'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FolderOpen, Loader2, AlertCircle } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import type { SessionCreateResult, SessionState } from '@/types';

interface CreateSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDirectory?: string;
}

interface AutocompleteResult {
  suggestions: string[];
  error?: string;
}

export function CreateSessionModal({
  open,
  onOpenChange,
  defaultDirectory,
}: CreateSessionModalProps) {
  const router = useRouter();
  const [directory, setDirectory] = useState(defaultDirectory || '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // Use ref to track pending tmux name to avoid race conditions
  const pendingTmuxNameRef = useRef<string | null>(null);
  const listenerCleanupRef = useRef<(() => void) | null>(null);

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (path: string) => {
    if (!path) {
      setSuggestions([]);
      return;
    }

    try {
      const res = await fetch(`/api/filesystem/autocomplete?path=${encodeURIComponent(path)}`);
      const data: AutocompleteResult = await res.json();
      setSuggestions(data.suggestions || []);
      setShowSuggestions(data.suggestions.length > 0);
      setSelectedIndex(-1);
    } catch {
      setSuggestions([]);
    }
  }, []);

  // Debounced autocomplete
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(directory);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [directory, open, fetchSuggestions]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setDirectory(defaultDirectory || '');
      setSuggestions([]);
      setShowSuggestions(false);
      setError(null);
      setValidationError(null);
      setIsLoading(false);
      pendingTmuxNameRef.current = null;
      // Focus input after modal animation
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Clean up listener when modal closes
      if (listenerCleanupRef.current) {
        listenerCleanupRef.current();
        listenerCleanupRef.current = null;
      }
    }
  }, [open, defaultDirectory]);

  // Validate directory
  const validateDirectory = async (path: string): Promise<boolean> => {
    if (!path.trim()) {
      setValidationError('Please enter a directory path');
      return false;
    }

    try {
      const res = await fetch(`/api/filesystem/validate?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!data.valid) {
        setValidationError(data.error || 'Invalid directory');
        return false;
      }
      setValidationError(null);
      return true;
    } catch {
      setValidationError('Failed to validate directory');
      return false;
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const isValid = await validateDirectory(directory);
    if (!isValid) return;

    setIsLoading(true);

    const socket = getSocket();

    // Set up listener BEFORE making the request to avoid race condition
    const handleSessionCreated = (sessionId: string, session: SessionState) => {
      // Check if this is the session we're waiting for by matching tmux session name
      if (pendingTmuxNameRef.current && session.tmuxSessionName === pendingTmuxNameRef.current) {
        // Clean up
        pendingTmuxNameRef.current = null;
        if (listenerCleanupRef.current) {
          listenerCleanupRef.current();
          listenerCleanupRef.current = null;
        }
        // Navigate
        setIsLoading(false);
        onOpenChange(false);
        router.push(`/sessions/${sessionId}`);
      }
    };

    socket.on('session:created', handleSessionCreated);

    // Set up timeout
    const timeout = setTimeout(() => {
      if (pendingTmuxNameRef.current) {
        pendingTmuxNameRef.current = null;
        socket.off('session:created', handleSessionCreated);
        listenerCleanupRef.current = null;
        setIsLoading(false);
        setError('Session creation timed out. The session may still be starting.');
      }
    }, 30000);

    // Store cleanup function
    listenerCleanupRef.current = () => {
      socket.off('session:created', handleSessionCreated);
      clearTimeout(timeout);
    };

    // Now make the request
    socket.emit('session:create', directory, (result: SessionCreateResult) => {
      if (result.success && result.tmuxName) {
        // Store the tmux name we're waiting for
        pendingTmuxNameRef.current = result.tmuxName;
      } else if (!result.success) {
        // Clean up listener on error
        if (listenerCleanupRef.current) {
          listenerCleanupRef.current();
          listenerCleanupRef.current = null;
        }
        setIsLoading(false);
        setError(result.error || 'Failed to create session');
      } else {
        // Success but no tmux name - shouldn't happen, clean up and close
        if (listenerCleanupRef.current) {
          listenerCleanupRef.current();
          listenerCleanupRef.current = null;
        }
        setIsLoading(false);
        onOpenChange(false);
      }
    });
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Tab') {
        // Trigger autocomplete on Tab when no suggestions shown
        fetchSuggestions(directory);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Tab':
        e.preventDefault();
        // Auto-complete to first suggestion
        if (suggestions.length > 0) {
          const suggestion = selectedIndex >= 0 ? suggestions[selectedIndex] : suggestions[0];
          setDirectory(suggestion);
          setShowSuggestions(false);
        }
        break;
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          setDirectory(suggestions[selectedIndex]);
          setShowSuggestions(false);
        }
        // Otherwise let form submit
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setDirectory(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Session</DialogTitle>
          <DialogDescription>
            Start a new Claude Code session in a directory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="directory" className="text-sm font-medium">
              Working Directory
            </label>
            <div className="relative">
              <div className="flex items-center">
                <FolderOpen className="absolute left-3 h-4 w-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  id="directory"
                  type="text"
                  value={directory}
                  onChange={(e) => {
                    setDirectory(e.target.value);
                    setValidationError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    // Delay hiding to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 150);
                  }}
                  onFocus={() => {
                    if (suggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  placeholder="/path/to/project"
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoading}
                  autoComplete="off"
                />
              </div>

              {/* Autocomplete dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  <ul className="max-h-48 overflow-auto py-1">
                    {suggestions.map((suggestion, index) => (
                      <li
                        key={suggestion}
                        className={`px-3 py-2 text-sm cursor-pointer ${
                          index === selectedIndex
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent hover:text-accent-foreground'
                        }`}
                        onMouseDown={() => handleSuggestionClick(suggestion)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <code className="text-xs">{suggestion}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {validationError && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {validationError}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Press Tab to autocomplete, use arrow keys to navigate suggestions
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !directory.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                'Create Session'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
