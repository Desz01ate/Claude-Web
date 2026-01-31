'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToolInputDisplay } from '@/components/permissions/ToolInputDisplay';
import { QuestionCard } from './QuestionCard';
import { respondToPermission } from '@/lib/socket';
import type { PermissionRequestContent } from '@/types';
import {
  ShieldAlert,
  Check,
  X,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PermissionRequestCardProps {
  sessionId: string;
  content: PermissionRequestContent;
}

export function PermissionRequestCard({
  sessionId,
  content,
}: PermissionRequestCardProps) {
  // Check if this is an AskUserQuestion tool - delegate to QuestionCard
  if (content.toolName === 'AskUserQuestion') {
    return <QuestionCard sessionId={sessionId} content={content} />;
  }
  const [expanded, setExpanded] = useState(true);
  const [localStatus, setLocalStatus] = useState(content.status);
  const isPending = localStatus === 'pending';

  // Sync local status with prop changes
  useEffect(() => {
    setLocalStatus(content.status);
  }, [content.status]);

  const handleDecision = useCallback(
    (decision: 'allow' | 'deny' | 'ask') => {
      respondToPermission(sessionId, content.toolUseId, decision);
      // Optimistically update local status
      if (decision === 'allow') setLocalStatus('allowed');
      else if (decision === 'deny') setLocalStatus('denied');
      else setLocalStatus('asked');
    },
    [sessionId, content.toolUseId]
  );

  // Keyboard shortcuts when this card is focused or global when pending
  useEffect(() => {
    if (!isPending) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if no input/textarea is focused
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        handleDecision('allow');
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleDecision('deny');
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleDecision('ask');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPending, handleDecision]);

  const getStatusBadge = () => {
    switch (localStatus) {
      case 'allowed':
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
            <CheckCircle className="h-3 w-3" />
            Allowed
          </Badge>
        );
      case 'denied':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Denied
          </Badge>
        );
      case 'asked':
        return (
          <Badge variant="secondary" className="gap-1">
            <MessageSquare className="h-3 w-3" />
            Asked in Terminal
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600">
            <ShieldAlert className="h-3 w-3" />
            Pending
          </Badge>
        );
    }
  };

  return (
    <Card
      className={cn(
        'border-l-4',
        isPending
          ? 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20'
          : localStatus === 'allowed'
          ? 'border-l-green-500'
          : localStatus === 'denied'
          ? 'border-l-red-500'
          : 'border-l-blue-500'
      )}
    >
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert
              className={cn(
                'h-4 w-4',
                isPending ? 'text-yellow-500' : 'text-muted-foreground'
              )}
            />
            <CardTitle className="text-sm">Permission Request</CardTitle>
            <Badge variant="secondary" className="font-mono text-xs">
              {content.toolName}
            </Badge>
            {getStatusBadge()}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-8 w-8 p-0"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {content.toolInput && (
            <div>
              <ToolInputDisplay
                input={content.toolInput}
                toolName={content.toolName}
              />
            </div>
          )}

          {isPending && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                Shortcuts: Y=Allow, N=Deny, A=Ask
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDecision('ask')}
                  className="gap-1"
                >
                  <HelpCircle className="h-3 w-3" />
                  Ask (A)
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDecision('deny')}
                  className="gap-1"
                >
                  <X className="h-3 w-3" />
                  Deny (N)
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleDecision('allow')}
                  className="gap-1"
                >
                  <Check className="h-3 w-3" />
                  Allow (Y)
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
