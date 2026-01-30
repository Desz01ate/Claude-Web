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

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io('http://localhost:3001', {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
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
