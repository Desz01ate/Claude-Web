import { io, Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  PermissionDecision,
  SessionCreateResult,
  SessionResumeResult,
  SessionDeleteResult,
} from '@/types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

function getSocketUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3001';

  // Use environment variable if set
  const envUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (envUrl) return envUrl;

  // When behind a reverse proxy (nginx), use same origin
  // For local dev without proxy, specify port 3001 explicitly
  if (process.env.NODE_ENV === 'production') {
    // In production, assume reverse proxy - use same origin
    return window.location.origin;
  }

  // Development: use same host but port 3001
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:3001`;
}

export function getSocket(): TypedSocket {
  if (!socket) {
    // Get auth token from sessionStorage if available (client-side only)
    const token = typeof window !== 'undefined'
      ? sessionStorage.getItem('auth_token')
      : null;

    socket = io(getSocketUrl(), {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // Pass auth token in handshake
      auth: token ? { token } : undefined,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function subscribeToSession(sessionId: string): void {
  getSocket().emit('session:subscribe', sessionId);
}

export function unsubscribeFromSession(sessionId: string): void {
  getSocket().emit('session:unsubscribe', sessionId);
}

export function requestSessionsList(): void {
  getSocket().emit('sessions:list');
}

export function respondToPermission(
  sessionId: string,
  toolUseId: string,
  decision: PermissionDecision
): void {
  getSocket().emit('permission:respond', sessionId, toolUseId, decision);
}

export function sendPrompt(sessionId: string, prompt: string): void {
  getSocket().emit('prompt:send', sessionId, prompt);
}

export function createSession(
  workingDirectory: string,
  callback: (result: SessionCreateResult) => void
): void {
  getSocket().emit('session:create', workingDirectory, callback);
}

export function destroySession(sessionId: string, keepTmux: boolean): void {
  getSocket().emit('session:destroy', sessionId, keepTmux);
}

export function resumeSession(
  sessionId: string,
  cwd: string,
  callback: (result: SessionResumeResult) => void
): void {
  getSocket().emit('session:resume', sessionId, cwd, callback);
}

export function requestRecentSessions(): void {
  getSocket().emit('sessions:recent');
}

export function deleteRecentSession(
  sessionId: string,
  callback: (result: SessionDeleteResult) => void
): void {
  getSocket().emit('session:delete-recent', sessionId, callback);
}

export function cycleSessionMode(sessionId: string): void {
  getSocket().emit('session:cycleMode', sessionId);
}
