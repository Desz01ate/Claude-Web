'use client';

import { useSessionStore } from '@/stores/sessionStore';
import { RecentSessionListItem } from './RecentSessionListItem';

export function RecentSessionList() {
  const recentSessions = useSessionStore((state) => state.getRecentSessions());

  // Sort by last activity (most recent first)
  const sortedSessions = [...recentSessions].sort((a, b) =>
    new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );

  if (sortedSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-muted-foreground">
          <p className="text-lg font-medium">No recent sessions</p>
          <p className="text-sm mt-1">
            Ended sessions will appear here for easy resumption
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sortedSessions.map((session) => (
        <RecentSessionListItem key={session.sessionId} session={session} />
      ))}
    </div>
  );
}

export function useRecentSessionCount() {
  return useSessionStore((state) => state.getRecentSessions().length);
}
