import * as net from 'net';
import * as fs from 'fs';
import type { HookEvent, PermissionDecision } from '../../src/types';
import type { SessionStore } from '../services/SessionStore';
import type { WebSocketServer } from './webSocket';

const SOCKET_PATH = '/tmp/claude-web.sock';

interface PendingPermission {
  socket: net.Socket;
  sessionId: string;
  toolUseId: string;
  toolName: string;
  receivedAt: Date;
}

export class HookSocketServer {
  private server: net.Server | null = null;
  private sessionStore: SessionStore;
  private webSocketServer: WebSocketServer;
  private pendingPermissions: Map<string, PendingPermission> = new Map();

  constructor(sessionStore: SessionStore, webSocketServer: WebSocketServer) {
    this.sessionStore = sessionStore;
    this.webSocketServer = webSocketServer;
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
