'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { sendPrompt, getSocket } from '@/lib/socket';
import { Send, Loader2 } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';

interface PromptInputProps {
  sessionId: string;
  disabled?: boolean;
}

export function PromptInput({ sessionId, disabled }: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addChatMessage = useSessionStore((state) => state.addChatMessage);

  useEffect(() => {
    const socket = getSocket();

    const handlePromptSent = (sid: string, success: boolean, errorMsg?: string) => {
      if (sid !== sessionId) return;

      setSending(false);
      if (!success) {
        setError(errorMsg || 'Failed to send prompt');
      }
    };

    socket.on('prompt:sent', handlePromptSent);

    return () => {
      socket.off('prompt:sent', handlePromptSent);
    };
  }, [sessionId]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || sending || disabled) return;

      const trimmedPrompt = prompt.trim();

      // Add message to chat history immediately (optimistic update)
      addChatMessage(sessionId, {
        id: `optimistic-${Date.now()}`,
        type: 'user',
        content: trimmedPrompt,
        timestamp: new Date(),
      });

      // Clear prompt immediately for better UX
      setPrompt('');
      setSending(true);
      setError(null);
      sendPrompt(sessionId, trimmedPrompt);
    },
    [sessionId, prompt, sending, disabled, addChatMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="shrink-0 border-t bg-background p-4">
      {error && (
        <div className="text-sm text-red-500 mb-2">{error}</div>
      )}
      <div className="flex gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message to Claude... (Enter to send, Shift+Enter for newline)"
          disabled={sending || disabled}
          className="flex-1 min-h-[60px] max-h-[200px] p-3 rounded-lg border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          rows={2}
        />
        <Button
          type="submit"
          disabled={!prompt.trim() || sending || disabled}
          className="self-end"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Messages are sent directly to the Claude Code terminal session
      </p>
    </form>
  );
}
