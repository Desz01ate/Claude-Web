'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { resumeSession, requestRecentSessions, deleteRecentSession } from '@/lib/socket';
import { useSessionStore } from '@/stores/sessionStore';
import type { RecentSession } from '@/types';
import { FolderOpen, MessageSquare, Play, History, Loader2, Trash2 } from 'lucide-react';

interface RecentSessionCardProps {
  session: RecentSession;
}

export function RecentSessionCard({ session }: RecentSessionCardProps) {
  const router = useRouter();
  const [isResuming, setIsResuming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addPendingResumeSession = useSessionStore((state) => state.addPendingResumeSession);
  const removeRecentSession = useSessionStore((state) => state.removeRecentSession);

  const handleResume = () => {
    setIsResuming(true);
    setError(null);

    resumeSession(session.sessionId, session.cwd, (result) => {
      if (!result.success) {
        setIsResuming(false);
        setError(result.error || 'Failed to resume session');
      } else {
        // Mark this session as pending resume so the session page shows loading
        addPendingResumeSession(session.sessionId);
        // Refresh recent sessions list since this one is now active
        requestRecentSessions();
        // Navigate to the resumed session
        router.push(`/sessions/${session.sessionId}`);
      }
    });
  };

  const handleDelete = () => {
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
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{session.projectName}</CardTitle>
          <Badge variant="secondary" className="gap-1 text-xs">
            <History className="h-3 w-3" />
            Recent
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4 flex-shrink-0" />
          <span className="truncate" title={session.cwd}>
            {session.cwd}
          </span>
        </div>

        {session.messageCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            <span>{session.messageCount} messages</span>
          </div>
        )}

        {session.lastUserMessage && (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2 italic">
            "{truncate(session.lastUserMessage, 80)}"
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Last active: {formatRelativeTime(session.lastActivity)}
        </div>

        {error && (
          <div className="text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1 gap-2"
            onClick={handleResume}
            disabled={isResuming || isDeleting}
          >
            {isResuming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Resuming...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Resume Session
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-destructive hover:border-destructive"
            onClick={handleDelete}
            disabled={isResuming || isDeleting}
            title="Delete session"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
