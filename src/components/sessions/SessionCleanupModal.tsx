'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Terminal, Trash2 } from 'lucide-react';
import { getSocket } from '@/lib/socket';

interface SessionCleanupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  tmuxSessionName?: string;
}

export function SessionCleanupModal({
  open,
  onOpenChange,
  sessionId,
  tmuxSessionName,
}: SessionCleanupModalProps) {
  const handleKeepTmux = () => {
    const socket = getSocket();
    socket.emit('session:destroy', sessionId, true);
    onOpenChange(false);
  };

  const handleDestroyTmux = () => {
    const socket = getSocket();
    socket.emit('session:destroy', sessionId, false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Session Ended</DialogTitle>
          <DialogDescription>
            The Claude session has ended, but the tmux session is still running.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Would you like to keep the tmux session for manual inspection, or destroy it?
          </p>

          {tmuxSessionName && (
            <div className="flex items-center gap-2 text-sm bg-muted p-2 rounded">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <code className="text-xs">{tmuxSessionName}</code>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Keep:</strong> The tmux session will remain active. You can attach to it manually with:</p>
            <code className="block bg-muted px-2 py-1 rounded text-xs">
              tmux attach -t {tmuxSessionName || 'session-name'}
            </code>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleKeepTmux}
            className="gap-2"
          >
            <Terminal className="h-4 w-4" />
            Keep tmux session
          </Button>
          <Button
            variant="destructive"
            onClick={handleDestroyTmux}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Destroy tmux session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
