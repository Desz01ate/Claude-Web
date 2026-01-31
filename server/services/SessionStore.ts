import { EventEmitter } from 'events';
import type {
  SessionState,
  SessionPhase,
  HookEvent,
  PermissionContext,
  ChatHistoryItem,
} from '../../src/types';
import { ConversationParser } from './ConversationParser';
import type { SessionDatabase } from './SessionDatabase';

export class SessionStore extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private conversationParser: ConversationParser;
  private db: SessionDatabase;

  // Registry mapping Claude session IDs to tmux session names
  private managedSessionRegistry: Map<string, string> = new Map();
  // Pending managed sessions waiting for hook event correlation
  // Key: working directory, Value: { tmuxName, createdAt }
  private pendingManagedSessions: Map<string, { tmuxName: string; createdAt: Date }> = new Map();
  // Track which sessions have been persisted to the database (have messages)
  private persistedSessions: Set<string> = new Set();

  constructor(db: SessionDatabase) {
    super();
    this.db = db;
    this.conversationParser = new ConversationParser();
  }

  /**
   * Register a pending managed session (before hook event arrives)
   */
  registerPendingManagedSession(workingDirectory: string, tmuxName: string): void {
    // Normalize the path for comparison
    const normalizedPath = workingDirectory.replace(/\/+$/, '');
    this.pendingManagedSessions.set(normalizedPath, {
      tmuxName,
      createdAt: new Date(),
    });
    console.log(`[SessionStore] Registered pending managed session: ${tmuxName} at ${normalizedPath}`);
  }

  /**
   * Get the tmux session name for a managed session
   */
  getTmuxSessionName(sessionId: string): string | undefined {
    return this.managedSessionRegistry.get(sessionId);
  }

  /**
   * Register a managed session after correlating hook event
   */
  registerManagedSession(sessionId: string, tmuxName: string): void {
    this.managedSessionRegistry.set(sessionId, tmuxName);
    console.log(`[SessionStore] Registered managed session: ${sessionId} -> ${tmuxName}`);

    // Update the session state
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isManaged = true;
      session.tmuxSessionName = tmuxName;
      session.canSendPrompts = true;
      this.sessions.set(sessionId, session);
      this.emit('session:update', session);
    }
  }

  /**
   * Get count of active managed sessions
   */
  getManagedSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.isManaged && session.phase.type !== 'ended') {
        count++;
      }
    }
    return count;
  }

  /**
   * Remove managed session from registry
   */
  unregisterManagedSession(sessionId: string): string | undefined {
    const tmuxName = this.managedSessionRegistry.get(sessionId);
    if (tmuxName) {
      this.managedSessionRegistry.delete(sessionId);
      console.log(`[SessionStore] Unregistered managed session: ${sessionId}`);
    }
    return tmuxName;
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.phase.type !== 'ended'
    );
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  // Request conversation refresh for a session
  async refreshConversation(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session?.conversationPath) {
      console.log(`[SessionStore] Refreshing conversation for ${sessionId} from ${session.conversationPath}`);
      await this.parseConversation(sessionId, session.conversationPath);
    }
  }

  processHookEvent(event: HookEvent): void {
    const { session_id, event_type, cwd, pid, tty, tool_name, tool_input, tool_use_id } = event;

    let session = this.sessions.get(session_id);
    let isNewSession = false;

    // Check if this is a pending managed session (for new sessions or resumed sessions)
    const normalizedCwd = cwd.replace(/\/+$/, '');
    const pending = this.pendingManagedSessions.get(normalizedCwd);
    let pendingTmuxName: string | undefined;

    if (pending) {
      // Correlate by working directory and timing (within 30 seconds)
      const timeSinceCreation = Date.now() - pending.createdAt.getTime();
      if (timeSinceCreation < 30000) {
        pendingTmuxName = pending.tmuxName;
        this.pendingManagedSessions.delete(normalizedCwd);
        this.managedSessionRegistry.set(session_id, pendingTmuxName);
        console.log(`[SessionStore] Correlated managed session: ${session_id} -> ${pendingTmuxName}`);
      } else {
        // Too old, remove stale pending
        this.pendingManagedSessions.delete(normalizedCwd);
      }
    }

    // Create session if it doesn't exist
    if (!session) {
      isNewSession = true;

      session = {
        sessionId: session_id,
        cwd: cwd,
        projectName: this.extractProjectName(cwd),
        pid: pid,
        tty: tty,
        phase: { type: 'idle' },
        lastActivity: new Date(),
        conversationPath: this.getConversationPath(cwd, session_id),
        isManaged: !!pendingTmuxName,
        tmuxSessionName: pendingTmuxName,
        canSendPrompts: !!pendingTmuxName, // Only managed sessions can receive prompts via tmux
      };
      this.sessions.set(session_id, session);

      // Note: Session is NOT saved to database yet - will be saved on first message

      // Emit session:created for managed sessions
      if (pendingTmuxName) {
        this.emit('session:created', session_id, session);
      }
    } else if (pendingTmuxName) {
      // Session already exists but is being resumed - update the tmux session name
      console.log(`[SessionStore] Updating resumed session ${session_id} with new tmux name: ${pendingTmuxName}`);
      session.isManaged = true;
      session.tmuxSessionName = pendingTmuxName;
      session.canSendPrompts = true;
      this.sessions.set(session_id, session);
    }

    // Update TTY if provided (might change between events)
    if (tty && tty !== session.tty) {
      session.tty = tty;
    }

    // Update session based on event
    const previousPhase = session.phase;
    session.lastActivity = new Date();

    switch (event_type) {
      case 'session_start':
        session.phase = { type: 'waitingForInput' };
        session.pid = pid;
        break;

      case 'processing':
      case 'running_tool':
        session.phase = { type: 'processing' };
        break;

      case 'waiting_for_input':
        session.phase = { type: 'waitingForInput' };
        break;

      case 'waiting_for_approval':
        const permission: PermissionContext = {
          toolUseId: tool_use_id || `${session_id}-${Date.now()}`,
          toolName: tool_name || 'unknown',
          toolInput: tool_input,
          receivedAt: new Date(),
        };
        session.phase = { type: 'waitingForApproval', permission };
        this.emit('permission:request', session_id, permission);
        break;

      case 'compacting':
        session.phase = { type: 'compacting' };
        break;

      case 'session_end':
      case 'ended':
        session.phase = { type: 'ended' };
        // Mark session as ended in database (only if persisted)
        if (this.persistedSessions.has(session_id)) {
          this.db.markSessionEnded(session_id);
        }
        // Clean up tracking for memory management
        this.persistedSessions.delete(session_id);
        // For managed sessions, emit cleanup prompt
        if (session.isManaged && session.tmuxSessionName) {
          this.emit('session:cleanup-prompt', session_id);
        }
        this.emit('session:ended', session_id);
        break;
    }

    this.sessions.set(session_id, session);

    // Update activity timestamp in database (only if persisted)
    if (this.persistedSessions.has(session_id)) {
      this.db.updateSessionActivity(session_id, session.lastActivity);
    }

    this.emit('session:update', session);

    // Parse conversation if we have a path
    if (session.conversationPath) {
      this.parseConversation(session_id, session.conversationPath);
    }
  }

  resolvePermission(sessionId: string, toolUseId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (
      session.phase.type === 'waitingForApproval' &&
      session.phase.permission.toolUseId === toolUseId
    ) {
      session.phase = { type: 'processing' };
      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
      this.emit('session:update', session);
      this.emit('permission:resolved', sessionId, toolUseId);
    }
  }

  private async parseConversation(sessionId: string, path: string): Promise<void> {
    try {
      console.log(`[SessionStore] Parsing conversation from: ${path}`);
      const messages = await this.conversationParser.parse(path);
      console.log(`[SessionStore] Parsed ${messages.length} messages for session ${sessionId}`);

      // Save session to database on first message (lazy persistence)
      if (messages.length > 0 && !this.persistedSessions.has(sessionId)) {
        const session = this.sessions.get(sessionId);
        if (session) {
          this.db.saveSession({
            sessionId: session.sessionId,
            cwd: session.cwd,
            projectName: session.projectName,
            conversationPath: session.conversationPath,
            lastActivity: session.lastActivity,
          });
          this.persistedSessions.add(sessionId);
          console.log(`[SessionStore] Persisted session ${sessionId} to database (first message)`);
        }
      }

      if (messages.length > 0) {
        this.emit('chat:update', sessionId, messages);

        // Update message preview in database (only if persisted)
        if (this.persistedSessions.has(sessionId)) {
          const userMessages = messages.filter(m => m.type === 'user');
          const lastUserMessage = userMessages.length > 0
            ? (typeof userMessages[userMessages.length - 1].content === 'string'
                ? userMessages[userMessages.length - 1].content as string
                : undefined)
            : undefined;

          // Truncate message preview for storage
          const truncatedMessage = lastUserMessage?.slice(0, 200);
          this.db.updateMessagePreview(sessionId, messages.length, truncatedMessage);
        }
      }
    } catch (err) {
      console.error(`[SessionStore] Error parsing conversation: ${err}`);
    }
  }

  private extractProjectName(cwd: string): string {
    const parts = cwd.split('/');
    return parts[parts.length - 1] || cwd;
  }

  private getConversationPath(cwd: string, sessionId: string): string {
    const homeDir = process.env.HOME || '/tmp';
    // Project dir is cwd with / replaced by - (keeps leading dash)
    const projectDir = cwd.replace(/\//g, '-');
    return `${homeDir}/.claude/projects/${projectDir}/${sessionId}.jsonl`;
  }

  // Cache tool_use_id from PreToolUse events for PermissionRequest correlation
  private toolUseIdCache: Map<string, string[]> = new Map();

  cacheToolUseId(sessionId: string, toolName: string, toolInput: Record<string, unknown>, toolUseId: string): void {
    const key = `${sessionId}:${toolName}:${JSON.stringify(toolInput)}`;
    const existing = this.toolUseIdCache.get(key) || [];
    existing.push(toolUseId);
    this.toolUseIdCache.set(key, existing);
  }

  getToolUseId(sessionId: string, toolName: string, toolInput: Record<string, unknown>): string | undefined {
    const key = `${sessionId}:${toolName}:${JSON.stringify(toolInput)}`;
    const ids = this.toolUseIdCache.get(key);
    if (ids && ids.length > 0) {
      return ids.shift(); // FIFO
    }
    return undefined;
  }
}
