import { Server, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SessionState,
  PermissionContext,
  ChatHistoryItem,
  PermissionDecision,
  SessionCreateResult,
  SessionResumeResult,
  SessionDeleteResult,
} from '../../src/types';
import type { SessionStore } from '../services/SessionStore';
import type { TmuxSessionManager } from '../services/TmuxSessionManager';
import type { ConfigStore } from '../services/ConfigStore';
import type { SessionDatabase } from '../services/SessionDatabase';
import type { AuthService } from '../services/AuthService';
import { PromptSender } from '../services/PromptSender';

export class WebSocketServer {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private sessionStore: SessionStore;
  private subscriptions: Map<string, Set<string>> = new Map(); // socketId -> Set<sessionId>
  private permissionResponder: ((sessionId: string, toolUseId: string, decision: PermissionDecision) => boolean) | null = null;
  private questionResponder: ((sessionId: string, toolUseId: string, answers: Record<string, string>) => boolean) | null = null;
  private promptSender: PromptSender;
  private tmuxManager: TmuxSessionManager | null = null;
  private configStore: ConfigStore | null = null;
  private sessionDb: SessionDatabase | null = null;
  private authService: AuthService | null = null;
  private tmuxAvailable: boolean = false;

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>, sessionStore: SessionStore) {
    this.io = io;
    this.sessionStore = sessionStore;
    this.promptSender = new PromptSender();

    this.setupEventListeners();
    this.setupSocketHandlers();
  }

  setTmuxManager(tmuxManager: TmuxSessionManager): void {
    this.tmuxManager = tmuxManager;
    // Check tmux availability on startup
    this.tmuxManager.checkTmuxAvailable().then((available) => {
      this.tmuxAvailable = available;
      console.log(`[WebSocket] tmux available: ${available}`);
      if (!available) {
        console.warn('[WebSocket] tmux is not installed - session creation will be disabled');
      }
    });
  }

  setConfigStore(configStore: ConfigStore): void {
    this.configStore = configStore;
  }

  setSessionDatabase(db: SessionDatabase): void {
    this.sessionDb = db;
  }

  setAuthService(authService: AuthService): void {
    this.authService = authService;
  }

  setPermissionResponder(responder: (sessionId: string, toolUseId: string, decision: PermissionDecision) => boolean): void {
    this.permissionResponder = responder;
  }

  setQuestionResponder(responder: (sessionId: string, toolUseId: string, answers: Record<string, string>) => boolean): void {
    this.questionResponder = responder;
  }

  emitModeReset(sessionId: string): void {
    console.log(`[WebSocket] Emitting mode reset for session ${sessionId}`);
    this.io.emit('session:modeReset', sessionId);
  }

  private setupEventListeners(): void {
    // Listen for session store events and broadcast to clients
    this.sessionStore.on('session:update', (session: SessionState) => {
      this.broadcastToSubscribers(session.sessionId, 'session:update', session);
      // Also broadcast to all clients on the sessions list
      this.io.emit('session:update', session);
    });

    this.sessionStore.on('session:ended', (sessionId: string) => {
      this.io.emit('session:ended', sessionId);
    });

    this.sessionStore.on('permission:request', (sessionId: string, permission: PermissionContext) => {
      this.io.emit('permission:request', sessionId, permission);
    });

    this.sessionStore.on('permission:resolved', (sessionId: string, toolUseId: string) => {
      this.io.emit('permission:resolved', sessionId, toolUseId);
    });

    this.sessionStore.on('session:created', (sessionId: string, session: SessionState) => {
      this.io.emit('session:created', sessionId, session);
    });

    this.sessionStore.on('session:cleanup-prompt', (sessionId: string) => {
      this.io.emit('session:cleanup-prompt', sessionId);
    });

    this.sessionStore.on('chat:update', (sessionId: string, messages: ChatHistoryItem[]) => {
      this.broadcastToSubscribers(sessionId, 'chat:update', sessionId, messages);
    });
  }

  private setupSocketHandlers(): void {
    // Authentication middleware
    this.io.use((socket, next) => {
      // If auth service is not set up, allow connection (backward compatibility)
      if (!this.authService) {
        return next();
      }

      // If auth is not enabled, allow connection
      if (!this.authService.isAuthEnabled()) {
        return next();
      }

      // Check for auth token
      const token = socket.handshake.auth?.token;

      if (!token) {
        console.log(`[WebSocket] Connection rejected: no auth token provided`);
        return next(new Error('Authentication required'));
      }

      // Verify token
      if (!this.authService.verifyToken(token)) {
        console.log(`[WebSocket] Connection rejected: invalid auth token`);
        return next(new Error('Invalid authentication token'));
      }

      next();
    });

    this.io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      // Initialize subscriptions for this socket
      this.subscriptions.set(socket.id, new Set());

      // Send current sessions list on connect
      socket.emit('sessions:list', this.sessionStore.getAllSessions());

      // Send tmux availability status
      socket.emit('tmux:available', this.tmuxAvailable);

      // Handle session subscription
      socket.on('session:subscribe', async (sessionId: string) => {
        const subs = this.subscriptions.get(socket.id);
        if (subs) {
          subs.add(sessionId);
          console.log(`[WebSocket] ${socket.id} subscribed to ${sessionId}`);
        }

        // Send current session state
        const session = this.sessionStore.getSession(sessionId);
        if (session) {
          socket.emit('session:update', session);
          // Also refresh and send conversation
          await this.sessionStore.refreshConversation(sessionId);
        }
      });

      socket.on('session:unsubscribe', (sessionId: string) => {
        const subs = this.subscriptions.get(socket.id);
        if (subs) {
          subs.delete(sessionId);
        }
      });

      // Handle sessions list request
      socket.on('sessions:list', () => {
        socket.emit('sessions:list', this.sessionStore.getAllSessions());
      });

      // Handle recent sessions request
      socket.on('sessions:recent', () => {
        if (!this.sessionDb) {
          socket.emit('sessions:recent', []);
          return;
        }
        const activeIds = this.sessionStore.getAllSessions().map(s => s.sessionId);
        const recentSessions = this.sessionDb.getRecentSessions(10, activeIds);
        socket.emit('sessions:recent', recentSessions);
      });

      // Handle recent session deletion
      socket.on('session:delete-recent', (sessionId: string, callback: (result: SessionDeleteResult) => void) => {
        console.log(`[WebSocket] Delete recent session request: ${sessionId}`);

        if (!this.sessionDb) {
          callback({ success: false, error: 'Session database not initialized' });
          return;
        }

        const deleted = this.sessionDb.deleteSession(sessionId);
        if (deleted) {
          callback({ success: true });
        } else {
          callback({ success: false, error: 'Session not found' });
        }
      });

      // Handle session creation
      socket.on('session:create', async (workingDirectory: string, callback: (result: SessionCreateResult) => void) => {
        console.log(`[WebSocket] Session create request for: ${workingDirectory}`);

        if (!this.tmuxManager) {
          callback({ success: false, error: 'Session manager not initialized' });
          return;
        }

        if (!this.tmuxAvailable) {
          callback({ success: false, error: 'tmux is not installed on this system' });
          return;
        }

        // Check session limit
        if (this.configStore) {
          const maxSessions = this.configStore.getMaxConcurrentSessions();
          const currentCount = this.sessionStore.getManagedSessionCount();
          if (currentCount >= maxSessions) {
            callback({
              success: false,
              error: `Session limit reached (${currentCount}/${maxSessions}). Close existing sessions or increase limit in settings.`,
            });
            return;
          }
        }

        // Create tmux session
        const result = await this.tmuxManager.createSession(workingDirectory);
        if (!result.success || !result.tmuxName) {
          callback({ success: false, error: result.error || 'Failed to create session' });
          return;
        }

        // Register as pending managed session (will be correlated when hook event arrives)
        this.sessionStore.registerPendingManagedSession(workingDirectory, result.tmuxName);

        // Return success with tmux name - the actual session ID will be emitted via session:created event
        // when the hook event fires
        callback({ success: true, tmuxName: result.tmuxName });
      });

      // Handle session resume
      socket.on('session:resume', async (sessionId: string, cwd: string, callback: (result: SessionResumeResult) => void) => {
        console.log(`[WebSocket] Session resume request for: ${sessionId} in ${cwd}`);

        if (!this.tmuxManager) {
          callback({ success: false, error: 'Session manager not initialized' });
          return;
        }

        if (!this.tmuxAvailable) {
          callback({ success: false, error: 'tmux is not installed on this system' });
          return;
        }

        // Check session limit
        if (this.configStore) {
          const maxSessions = this.configStore.getMaxConcurrentSessions();
          const currentCount = this.sessionStore.getManagedSessionCount();
          if (currentCount >= maxSessions) {
            callback({
              success: false,
              error: `Session limit reached (${currentCount}/${maxSessions}). Close existing sessions or increase limit in settings.`,
            });
            return;
          }
        }

        // Resume the session via tmux
        const result = await this.tmuxManager.resumeSession(sessionId, cwd);
        if (!result.success || !result.tmuxName) {
          callback({ success: false, error: result.error || 'Failed to resume session' });
          return;
        }

        // Register as pending managed session (will be correlated when hook event arrives)
        // The resumed session will use the same session ID
        this.sessionStore.registerPendingManagedSession(cwd, result.tmuxName);

        // Return success - the session will appear when hook event fires
        callback({ success: true, sessionId });
      });

      // Handle session destruction
      socket.on('session:destroy', async (sessionId: string, keepTmux: boolean) => {
        console.log(`[WebSocket] Session destroy request: ${sessionId}, keepTmux: ${keepTmux}`);

        const session = this.sessionStore.getSession(sessionId);
        if (!session) {
          console.log(`[WebSocket] Session ${sessionId} not found`);
          return;
        }

        if (!keepTmux && session.tmuxSessionName && this.tmuxManager) {
          // Destroy the tmux session
          const result = await this.tmuxManager.destroySession(session.tmuxSessionName);
          if (!result.success) {
            console.error(`[WebSocket] Failed to destroy tmux session: ${result.error}`);
          }
        }

        // Unregister the managed session
        this.sessionStore.unregisterManagedSession(sessionId);
      });

      // Handle permission responses
      socket.on('permission:respond', (sessionId: string, toolUseId: string, decision: PermissionDecision) => {
        console.log(`[WebSocket] Permission response: ${decision} for ${toolUseId}`);
        if (this.permissionResponder) {
          this.permissionResponder(sessionId, toolUseId, decision);
        }
      });

      // Handle question responses (AskUserQuestion)
      socket.on('question:respond', (sessionId: string, toolUseId: string, answers: Record<string, string>) => {
        console.log(`[WebSocket] Question response for ${toolUseId}:`, Object.keys(answers));
        if (this.questionResponder) {
          this.questionResponder(sessionId, toolUseId, answers);
        }
      });

      // Handle mode cycling (Shift+Tab)
      socket.on('session:cycleMode', async (sessionId: string) => {
        console.log(`[WebSocket] Mode cycle request for session ${sessionId}`);
        const session = this.sessionStore.getSession(sessionId);

        if (!session) {
          socket.emit('session:cycleMode:result', sessionId, false, 'Session not found');
          return;
        }

        if (!session.isManaged || !session.tmuxSessionName) {
          socket.emit('session:cycleMode:result', sessionId, false, 'Mode cycling is only available for managed sessions');
          return;
        }

        if (!this.tmuxManager) {
          socket.emit('session:cycleMode:result', sessionId, false, 'Session manager not initialized');
          return;
        }

        // Send Shift+Tab (BTab in tmux) to cycle through modes
        const result = await this.tmuxManager.sendSpecialKey(session.tmuxSessionName, 'BTab');
        socket.emit('session:cycleMode:result', sessionId, result.success, result.error);
      });

      // Handle prompt sending
      socket.on('prompt:send', async (sessionId: string, prompt: string) => {
        console.log(`[WebSocket] Sending prompt to session ${sessionId}`);
        const session = this.sessionStore.getSession(sessionId);

        if (!session) {
          socket.emit('prompt:sent', sessionId, false, 'Session not found');
          return;
        }

        // For managed sessions, use tmux send-keys (more reliable)
        if (session.isManaged && session.tmuxSessionName) {
          const result = await this.promptSender.sendViaTmux(session.tmuxSessionName, prompt);
          socket.emit('prompt:sent', sessionId, result.success, result.error);
          return;
        }

        // For external sessions, check if prompts are allowed
        if (!session.canSendPrompts) {
          socket.emit('prompt:sent', sessionId, false, 'This is an external session - prompts can only be sent to sessions created via the web UI');
          return;
        }

        // Fallback to TTY-based sending for non-managed sessions that allow prompts
        if (!session.tty) {
          socket.emit('prompt:sent', sessionId, false, 'No TTY available for this session');
          return;
        }

        const result = await this.promptSender.sendPrompt(session.tty, prompt, session.pid);
        socket.emit('prompt:sent', sessionId, result.success, result.error);
      });

      socket.on('disconnect', () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
        this.subscriptions.delete(socket.id);
      });
    });
  }

  private broadcastToSubscribers<E extends keyof ServerToClientEvents>(
    sessionId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    for (const [socketId, subs] of this.subscriptions.entries()) {
      if (subs.has(sessionId)) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          (socket.emit as (event: string, ...args: unknown[]) => void)(event, ...args);
        }
      }
    }
  }
}
