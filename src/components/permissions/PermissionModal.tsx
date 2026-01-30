'use client';

import { useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToolInputDisplay } from './ToolInputDisplay';
import { respondToPermission } from '@/lib/socket';
import type { PermissionContext } from '@/types';
import { ShieldAlert, Check, X, HelpCircle } from 'lucide-react';

interface PermissionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  permission: PermissionContext;
}

export function PermissionModal({
  open,
  onOpenChange,
  sessionId,
  permission,
}: PermissionModalProps) {
  const handleDecision = useCallback(
    (decision: 'allow' | 'deny' | 'ask') => {
      respondToPermission(sessionId, permission.toolUseId, decision);
      onOpenChange(false);
    },
    [sessionId, permission.toolUseId, onOpenChange]
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        handleDecision('allow');
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleDecision('deny');
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleDecision('ask');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleDecision('ask');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleDecision]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-yellow-500" />
            <DialogTitle>Permission Request</DialogTitle>
          </div>
          <DialogDescription>
            Claude wants to use the following tool. Review and approve or deny.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Tool:</span>
            <Badge variant="secondary" className="font-mono">
              {permission.toolName}
            </Badge>
          </div>

          {permission.toolInput && (
            <div>
              <span className="text-sm font-medium">Input:</span>
              <div className="mt-2">
                <ToolInputDisplay
                  input={permission.toolInput}
                  toolName={permission.toolName}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <div className="text-xs text-muted-foreground mb-2 sm:mb-0 sm:mr-auto">
            Shortcuts: Y=Allow, N=Deny, A=Ask in terminal
          </div>
          <Button
            variant="outline"
            onClick={() => handleDecision('ask')}
            className="gap-2"
          >
            <HelpCircle className="h-4 w-4" />
            Ask (A)
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleDecision('deny')}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Deny (N)
          </Button>
          <Button
            variant="default"
            onClick={() => handleDecision('allow')}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Allow (Y)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
