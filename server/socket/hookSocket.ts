import * as net from 'net';
import * as fs from 'fs';
import type { HookEvent, PermissionDecision, AskUserQuestionInput, Question } from '../../src/types';
import type { SessionStore } from '../services/SessionStore';
import type { WebSocketServer } from './webSocket';
import type { TmuxSessionManager } from '../services/TmuxSessionManager';

const SOCKET_PATH = '/tmp/claude-web.sock';

interface PendingPermission {
  socket: net.Socket;
  sessionId: string;
  toolUseId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  receivedAt: Date;
}

export class HookSocketServer {
  private server: net.Server | null = null;
  private sessionStore: SessionStore;
  private webSocketServer: WebSocketServer;
  private tmuxManager: TmuxSessionManager | null = null;
  private pendingPermissions: Map<string, PendingPermission> = new Map();

  constructor(sessionStore: SessionStore, webSocketServer: WebSocketServer) {
    this.sessionStore = sessionStore;
    this.webSocketServer = webSocketServer;
  }

  setTmuxManager(tmuxManager: TmuxSessionManager): void {
    this.tmuxManager = tmuxManager;
  }

  start(): void {
    // Remove existing socket file if it exists
    try {
      fs.unlinkSync(SOCKET_PATH);
    } catch {
      // Socket file might not exist
    }

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.listen(SOCKET_PATH, () => {
      console.log(`[HookSocket] Listening on ${SOCKET_PATH}`);
      // Make socket accessible
      fs.chmodSync(SOCKET_PATH, 0o777);
    });

    this.server.on('error', (err) => {
      console.error('[HookSocket] Server error:', err);
    });
  }

  stop(): void {
    // Close all pending permission sockets
    for (const pending of this.pendingPermissions.values()) {
      pending.socket.destroy();
    }
    this.pendingPermissions.clear();

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    try {
      fs.unlinkSync(SOCKET_PATH);
    } catch {
      // Socket file might not exist
    }

    console.log('[HookSocket] Server stopped');
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Try to parse complete JSON objects
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(socket, line.trim());
        }
      }
    });

    socket.on('error', (err) => {
      console.error('[HookSocket] Client error:', err.message);
    });

    socket.on('close', () => {
      // Clean up any pending permissions for this socket
      for (const [id, pending] of this.pendingPermissions.entries()) {
        if (pending.socket === socket) {
          this.pendingPermissions.delete(id);
        }
      }
    });

    // Set timeout for non-permission connections
    socket.setTimeout(300000); // 5 minutes
    socket.on('timeout', () => {
      socket.destroy();
    });
  }

  private handleMessage(socket: net.Socket, message: string): void {
    try {
      const event = JSON.parse(message) as HookEvent;
      console.log(`[HookSocket] Received event: ${event.event_type} for session ${event.session_id}`);

      // Cache tool_use_id from running_tool events
      if (event.event_type === 'running_tool' && event.tool_use_id && event.tool_name) {
        this.sessionStore.cacheToolUseId(
          event.session_id,
          event.tool_name,
          event.tool_input || {},
          event.tool_use_id
        );

        // Detect ExitPlanMode tool and notify frontend to reset mode
        if (event.tool_name === 'ExitPlanMode') {
          this.webSocketServer.emitModeReset(event.session_id);
        }
      }

      // Handle permission requests specially - keep socket open
      if (event.event_type === 'waiting_for_approval') {
        // Try to get cached tool_use_id if not provided
        let toolUseId = event.tool_use_id;
        if (!toolUseId && event.tool_name) {
          toolUseId = this.sessionStore.getToolUseId(
            event.session_id,
            event.tool_name,
            event.tool_input || {}
          );
        }
        toolUseId = toolUseId || `${event.session_id}-${Date.now()}`;

        const pendingId = `${event.session_id}:${toolUseId}`;
        this.pendingPermissions.set(pendingId, {
          socket,
          sessionId: event.session_id,
          toolUseId,
          toolName: event.tool_name || 'unknown',
          toolInput: event.tool_input,
          receivedAt: new Date(),
        });

        // Update event with resolved toolUseId
        event.tool_use_id = toolUseId;

        // Process event but don't close socket
        this.sessionStore.processHookEvent(event);

        // Disable timeout for permission sockets
        socket.setTimeout(0);
      } else {
        // Process event and close socket
        this.sessionStore.processHookEvent(event);
        socket.end();
      }
    } catch (err) {
      console.error('[HookSocket] Failed to parse message:', err);
      socket.end();
    }
  }

  respondToPermission(sessionId: string, toolUseId: string, decision: PermissionDecision): boolean {
    const pendingId = `${sessionId}:${toolUseId}`;
    const pending = this.pendingPermissions.get(pendingId);

    if (!pending) {
      console.warn(`[HookSocket] No pending permission found for ${pendingId}`);
      return false;
    }

    // Send response to hook
    const response = JSON.stringify({ decision }) + '\n';
    pending.socket.write(response, () => {
      pending.socket.end();
    });

    this.pendingPermissions.delete(pendingId);
    this.sessionStore.resolvePermission(sessionId, toolUseId);

    console.log(`[HookSocket] Permission ${decision} for ${toolUseId}`);
    return true;
  }

  respondToQuestion(sessionId: string, toolUseId: string, answers: Record<string, string>): boolean {
    const pendingId = `${sessionId}:${toolUseId}`;
    const pending = this.pendingPermissions.get(pendingId);

    if (!pending) {
      console.warn(`[HookSocket] No pending permission found for ${pendingId}`);
      return false;
    }

    // Get the session's tmux name for sending key presses
    const session = this.sessionStore.getSession(sessionId);
    const tmuxName = session?.tmuxSessionName;

    // Get questions from the tool input to map answers to option indices
    const toolInput = pending.toolInput as AskUserQuestionInput | undefined;
    const questions = toolInput?.questions || [];

    // Send "ask" decision to hook - let Claude show its terminal UI
    const response = JSON.stringify({ decision: 'ask' }) + '\n';
    pending.socket.write(response, () => {
      pending.socket.end();
    });

    this.pendingPermissions.delete(pendingId);
    this.sessionStore.resolvePermission(sessionId, toolUseId);

    console.log(`[HookSocket] Question answered for ${toolUseId}`);

    // If we have tmux access, send key presses after Claude's UI appears
    if (tmuxName && this.tmuxManager && questions.length > 0) {
      this.sendQuestionAnswersViaTmux(tmuxName, questions, answers);
    }

    return true;
  }

  /**
   * Send key presses to answer questions in Claude's terminal UI
   * Uses arrow keys to navigate to the selected option, then Enter to confirm
   */
  private async sendQuestionAnswersViaTmux(
    tmuxName: string,
    questions: Question[],
    answers: Record<string, string>
  ): Promise<void> {
    if (!this.tmuxManager) return;

    // Wait for Claude's question UI to appear
    await this.sleep(500);

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const answerText = answers[question.question];

      if (!answerText) {
        console.warn(`[HookSocket] No answer provided for question: ${question.question}`);
        continue;
      }

      if (question.multiSelect) {
        // For multi-select, the answer is comma-separated labels
        const selectedLabels = answerText.split(', ').map(s => s.trim());

        // Track current cursor position
        let currentPosition = 0;

        for (const label of selectedLabels) {
          const optionIndex = question.options.findIndex(opt => opt.label === label);
          if (optionIndex >= 0) {
            // Navigate from current position to the target option
            const stepsNeeded = optionIndex - currentPosition;
            console.log(`[HookSocket] Navigating ${stepsNeeded} steps to multi-select option ${optionIndex} for question ${i + 1}`);

            if (stepsNeeded > 0) {
              for (let j = 0; j < stepsNeeded; j++) {
                await this.tmuxManager.sendSpecialKey(tmuxName, 'Down');
                await this.sleep(50);
              }
            } else if (stepsNeeded < 0) {
              for (let j = 0; j < Math.abs(stepsNeeded); j++) {
                await this.tmuxManager.sendSpecialKey(tmuxName, 'Up');
                await this.sleep(50);
              }
            }

            currentPosition = optionIndex;

            // Press Enter to toggle this option's selection
            await this.tmuxManager.sendSpecialKey(tmuxName, 'Enter');
            await this.sleep(100);
          }
        }
        // Press Right arrow to move to the next question
        console.log(`[HookSocket] Sending Right arrow to move to next question after multi-select ${i + 1}`);
        await this.tmuxManager.sendSpecialKey(tmuxName, 'Right');
      } else {
        // For single select, find the option index and navigate with arrow keys
        const optionIndex = question.options.findIndex(opt => opt.label === answerText);
        if (optionIndex >= 0) {
          // Navigate down to the correct option (first option is at index 0, already selected)
          console.log(`[HookSocket] Navigating to option ${optionIndex} for question ${i + 1}`);
          for (let j = 0; j < optionIndex; j++) {
            await this.tmuxManager.sendSpecialKey(tmuxName, 'Down');
            await this.sleep(50);
          }
          await this.sleep(100);
          // Press Enter to confirm selection
          console.log(`[HookSocket] Sending Enter to confirm selection for question ${i + 1}`);
          await this.tmuxManager.sendSpecialKey(tmuxName, 'Enter');
        }
      }

      // Small delay between questions
      if (i < questions.length - 1) {
        await this.sleep(200);
      }
    }

    // Final Enter to submit all answers
    await this.sleep(200);
    console.log(`[HookSocket] Sending final Enter to submit all answers`);
    await this.tmuxManager.sendSpecialKey(tmuxName, 'Enter');

    console.log(`[HookSocket] Finished sending question answers via tmux`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cancel all pending permissions for a session (e.g., on session end)
  cancelPendingPermissions(sessionId: string): void {
    for (const [id, pending] of this.pendingPermissions.entries()) {
      if (pending.sessionId === sessionId) {
        pending.socket.destroy();
        this.pendingPermissions.delete(id);
      }
    }
  }
}
