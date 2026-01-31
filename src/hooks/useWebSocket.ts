'use client';

import { useEffect, useCallback, useState } from 'react';
import { getSocket, connectSocket, disconnectSocket, requestRecentSessions } from '@/lib/socket';
import { useSessionStore } from '@/stores/sessionStore';
import { usePermissionStore } from '@/stores/permissionStore';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [tmuxAvailable, setTmuxAvailable] = useState(false);
  const { setSessions, updateSession, removeSession, updateChatHistory, addToCleanupQueue, setRecentSessions, resetSessionsLoaded, setSessionMode } =
    useSessionStore();
  const { addPermission, removePermission, clearPermissionsForSession } =
    usePermissionStore();

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => {
      console.log('[WS] Connected');
      setConnected(true);
      // Request recent sessions on connect
      requestRecentSessions();
    };

    const handleDisconnect = () => {
      console.log('[WS] Disconnected');
      setConnected(false);
      resetSessionsLoaded();
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    socket.on('sessions:list', (sessions) => {
      setSessions(sessions);
      // Extract any pending permissions from sessions
      sessions.forEach((session) => {
        if (session.phase.type === 'waitingForApproval') {
          addPermission(session.sessionId, session.phase.permission);
        }
      });
    });

    socket.on('session:update', (session) => {
      updateSession(session);
      // Update permission state based on session phase
      if (session.phase.type === 'waitingForApproval') {
        addPermission(session.sessionId, session.phase.permission);
      }
    });

    socket.on('session:ended', (sessionId) => {
      removeSession(sessionId);
      clearPermissionsForSession(sessionId);
    });

    socket.on('permission:request', (sessionId, permission) => {
      addPermission(sessionId, permission);
    });

    socket.on('permission:resolved', (sessionId, toolUseId) => {
      removePermission(sessionId, toolUseId);
    });

    socket.on('chat:update', (sessionId, messages) => {
      updateChatHistory(sessionId, messages);
    });

    socket.on('tmux:available', (available) => {
      setTmuxAvailable(available);
    });

    socket.on('session:created', (sessionId, session) => {
      updateSession(session);
    });

    socket.on('session:cleanup-prompt', (sessionId) => {
      addToCleanupQueue(sessionId);
    });

    socket.on('sessions:recent', (sessions) => {
      setRecentSessions(sessions);
    });

    socket.on('session:modeReset', (sessionId) => {
      console.log(`[WS] Mode reset for session ${sessionId}`);
      setSessionMode(sessionId, 'none');
    });

    connectSocket();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('sessions:list');
      socket.off('session:update');
      socket.off('session:ended');
      socket.off('permission:request');
      socket.off('permission:resolved');
      socket.off('chat:update');
      socket.off('tmux:available');
      socket.off('session:created');
      socket.off('session:cleanup-prompt');
      socket.off('sessions:recent');
      socket.off('session:modeReset');
      disconnectSocket();
    };
  }, [
    setSessions,
    updateSession,
    removeSession,
    updateChatHistory,
    addPermission,
    removePermission,
    clearPermissionsForSession,
    addToCleanupQueue,
    setRecentSessions,
    resetSessionsLoaded,
    setSessionMode,
  ]);

  const reconnect = useCallback(() => {
    disconnectSocket();
    connectSocket();
  }, []);

  return { connected, reconnect, tmuxAvailable };
}
