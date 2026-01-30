'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { PhaseIndicator } from './PhaseIndicator';
import { formatRelativeTime } from '@/lib/utils';
import type { SessionState } from '@/types';
import { FolderOpen, Globe, ExternalLink } from 'lucide-react';

interface SessionListItemProps {
  session: SessionState;
}

export function SessionListItem({ session }: SessionListItemProps) {
  const needsAttention =
    session.phase.type === 'waitingForApproval' ||
    session.phase.type === 'waitingForInput';

  return (
    <Link href={`/sessions/${session.sessionId}`}>
      <div
        className={`flex items-center gap-4 px-4 py-3 rounded-lg border bg-card transition-all hover:shadow-md hover:bg-accent/50 cursor-pointer ${
          needsAttention ? 'border-yellow-500 border-2' : ''
        }`}
      >
        {/* Left: Project name + badges */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0 w-64">
          <span className="font-medium truncate">{session.projectName}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {session.isManaged ? (
              <Badge variant="default" className="gap-1 text-xs">
                <Globe className="h-3 w-3" />
                Web
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 text-xs">
                <ExternalLink className="h-3 w-3" />
                External
              </Badge>
            )}
            {needsAttention && (
              <Badge variant="warning" className="text-xs">Needs Attention</Badge>
            )}
          </div>
        </div>

        {/* Center: Working directory + Phase */}
        <div className="flex items-center gap-6 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0 flex-1">
            <FolderOpen className="h-4 w-4 flex-shrink-0" />
            <span className="truncate" title={session.cwd}>
              {session.cwd}
            </span>
          </div>
          <div className="flex-shrink-0">
            <PhaseIndicator phase={session.phase} size="sm" />
          </div>
        </div>

        {/* Right: Last activity */}
        <div className="text-xs text-muted-foreground flex-shrink-0 w-32 text-right">
          {formatRelativeTime(session.lastActivity)}
        </div>
      </div>
    </Link>
  );
}
