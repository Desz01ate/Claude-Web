'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PhaseIndicator } from './PhaseIndicator';
import { formatRelativeTime } from '@/lib/utils';
import type { SessionState } from '@/types';
import { FolderOpen, Terminal, Globe, ExternalLink } from 'lucide-react';

interface SessionCardProps {
  session: SessionState;
}

export function SessionCard({ session }: SessionCardProps) {
  const needsAttention =
    session.phase.type === 'waitingForApproval' ||
    session.phase.type === 'waitingForInput';

  return (
    <Link href={`/sessions/${session.sessionId}`}>
      <Card
        className={`cursor-pointer transition-all hover:shadow-md ${
          needsAttention ? 'border-yellow-500 border-2' : ''
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{session.projectName}</CardTitle>
            <div className="flex items-center gap-2">
              {session.isManaged ? (
                <Badge variant="default" className="gap-1 text-xs">
                  <Globe className="h-3 w-3" />
                  Web Session
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <ExternalLink className="h-3 w-3" />
                  External
                </Badge>
              )}
              {needsAttention && (
                <Badge variant="warning">Needs Attention</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <PhaseIndicator phase={session.phase} size="sm" />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="h-4 w-4" />
            <span className="truncate" title={session.cwd}>
              {session.cwd}
            </span>
          </div>

          {session.pid && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Terminal className="h-4 w-4" />
              <span>PID: {session.pid}</span>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Last activity: {formatRelativeTime(session.lastActivity)}
          </div>

          {!session.isManaged && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              External sessions have limited functionality
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
