'use client';

import { useEffect } from 'react';
import { useSessionStore } from '@/stores/sessionStore';
import { subscribeToSession, unsubscribeFromSession } from '@/lib/socket';

export function useSession(sessionId: string | null) {
  const session = useSessionStore((state) =>
    sessionId ? state.getSession(sessionId) : undefined
  );
  const chatHistory = useSessionStore((state) =>
    sessionId ? state.getChatHistory(sessionId) : []
  );
  const sessionsLoaded = useSessionStore((state) => state.sessionsLoaded);
  const isPendingResume = useSessionStore((state) =>
    sessionId ? state.pendingResumeSessions.has(sessionId) : false
  );

  useEffect(() => {
    if (sessionId) {
      subscribeToSession(sessionId);
      return () => {
        unsubscribeFromSession(sessionId);
      };
    }
  }, [sessionId]);

  return { session, chatHistory, sessionsLoaded, isPendingResume };
}
