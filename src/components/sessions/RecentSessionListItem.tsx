'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { resumeSession, requestRecentSessions, deleteRecentSession } from '@/lib/socket';
import { useSessionStore } from '@/stores/sessionStore';
import type { RecentSession } from '@/types';
import { FolderOpen, MessageSquare, Play, History, Loader2, Trash2 } from 'lucide-react';

interface RecentSessionListItemProps {
  session: RecentSession;
}

export function RecentSessionListItem({ session }: RecentSessionListItemProps) {
  const router = useRouter();
  const [isResuming, setIsResuming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addPendingResumeSession = useSessionStore((state) => state.addPendingResumeSession);
  const removeRecentSession = useSessionStore((state) => state.removeRecentSession);

  const handleResume = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResuming(true);
    setError(null);

    resumeSession(session.sessionId, session.cwd, (result) => {
      if (!result.success) {
        setIsResuming(false);
        setError(result.error || 'Failed to resume session');
      } else {
        addPendingResumeSession(session.sessionId);
        requestRecentSessions();
        router.push(`/sessions/${session.sessionId}`);
      }
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeleting(true);
    setError(null);

    deleteRecentSession(session.sessionId, (result) => {
      if (!result.success) {
        setIsDeleting(false);
        setError(result.error || 'Failed to delete session');
      } else {
        // Optimistically remove from local state
        removeRecentSession(session.sessionId);
      }
    });
  };

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 rounded-lg border bg-card transition-all hover:shadow-md ${
        error ? 'border-destructive' : ''
      }`}
    >
      {/* Left: Project name + badge */}
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0 w-64">
        <span className="font-medium truncate">{session.projectName}</span>
        <Badge variant="secondary" className="gap-1 text-xs flex-shrink-0">
          <History className="h-3 w-3" />
          Recent
        </Badge>
      </div>

      {/* Center: Working directory, message count, last message */}
      <div className="flex items-center gap-6 flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0 max-w-xs">
          <FolderOpen className="h-4 w-4 flex-shrink-0" />
          <span className="truncate" title={session.cwd}>
            {session.cwd}
          </span>
        </div>

        {session.messageCount > 0 && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground flex-shrink-0">
            <MessageSquare className="h-4 w-4" />
            <span>{session.messageCount}</span>
          </div>
        )}

        {session.lastUserMessage && (
          <span className="text-sm text-muted-foreground italic truncate flex-1 min-w-0">
            "{truncate(session.lastUserMessage, 50)}"
          </span>
        )}
      </div>

      {/* Right: Last activity + Resume button */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="text-xs text-muted-foreground w-24 text-right">
          {formatRelativeTime(session.lastActivity)}
        </span>

        {error && (
          <span className="text-xs text-destructive max-w-32 truncate" title={error}>
            {error}
          </span>
        )}

        <Button
          variant="default"
          size="sm"
          className="gap-1"
          onClick={handleResume}
          disabled={isResuming || isDeleting}
        >
          {isResuming ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Resuming
            </>
          ) : (
            <>
              <Play className="h-3 w-3" />
              Resume
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          disabled={isResuming || isDeleting}
          title="Delete session"
        >
          {isDeleting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}
