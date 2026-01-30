'use client';

import { useSessionStore } from '@/stores/sessionStore';
import { SessionListItem } from './SessionListItem';

export function SessionList() {
  const sessions = useSessionStore((state) => state.getAllSessions());

  // Sort sessions: needs attention first, then by last activity
  const sortedSessions = [...sessions].sort((a, b) => {
    const aAttention =
      a.phase.type === 'waitingForApproval' ||
      a.phase.type === 'waitingForInput';
    const bAttention =
      b.phase.type === 'waitingForApproval' ||
      b.phase.type === 'waitingForInput';

    if (aAttention && !bAttention) return -1;
    if (!aAttention && bAttention) return 1;

    return (
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  });

  if (sortedSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-muted-foreground">
          <p className="text-lg font-medium">No active sessions</p>
          <p className="text-sm mt-1">
            Start a Claude Code session to see it here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sortedSessions.map((session) => (
        <SessionListItem key={session.sessionId} session={session} />
      ))}
    </div>
  );
}

export function useActiveSessionCount() {
  return useSessionStore((state) => state.getAllSessions().length);
}
