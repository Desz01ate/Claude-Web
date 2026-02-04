'use client';

import { useEffect, useRef, useMemo } from 'react';
import { getSocket, subscribeToFileWatch, unsubscribeFromFileWatch } from '@/lib/socket';
import type { FileWatcherChangedEvent, FileWatcherGitEvent } from '@/types';

interface UseFileWatcherOptions {
  rootPath: string;
  onFilesChanged?: (changes: FileWatcherChangedEvent['changes']) => void;
  onGitChanged?: () => void;
}

// Normalize path to match server-side path.resolve behavior
function normalizePath(p: string): string {
  // Remove trailing slashes (except for root "/")
  let normalized = p.replace(/\/+$/, '') || '/';
  // Ensure absolute path (browser doesn't have path.resolve, but paths should already be absolute)
  return normalized;
}

export function useFileWatcher({
  rootPath,
  onFilesChanged,
  onGitChanged,
}: UseFileWatcherOptions): void {
  // Normalize the path for consistent comparison
  const normalizedRootPath = useMemo(() => normalizePath(rootPath), [rootPath]);

  // Use refs to avoid re-subscribing when callbacks change
  const onFilesChangedRef = useRef(onFilesChanged);
  const onGitChangedRef = useRef(onGitChanged);

  useEffect(() => {
    onFilesChangedRef.current = onFilesChanged;
    onGitChangedRef.current = onGitChanged;
  }, [onFilesChanged, onGitChanged]);

  useEffect(() => {
    if (!normalizedRootPath) return;

    const socket = getSocket();

    const handleFilesChanged = (event: FileWatcherChangedEvent) => {
      // Only handle events for our rootPath (compare normalized paths)
      const eventPath = normalizePath(event.rootPath);
      if (eventPath === normalizedRootPath && onFilesChangedRef.current) {
        onFilesChangedRef.current(event.changes);
      }
    };

    const handleGitChanged = (event: FileWatcherGitEvent) => {
      // Only handle events for our rootPath (compare normalized paths)
      const eventPath = normalizePath(event.rootPath);
      if (eventPath === normalizedRootPath && onGitChangedRef.current) {
        onGitChangedRef.current();
      }
    };

    // Subscribe to file watching
    subscribeToFileWatch(normalizedRootPath);

    // Listen for events
    socket.on('filewatcher:changed', handleFilesChanged);
    socket.on('filewatcher:git', handleGitChanged);

    return () => {
      // Unsubscribe from file watching
      unsubscribeFromFileWatch(normalizedRootPath);

      // Remove event listeners
      socket.off('filewatcher:changed', handleFilesChanged);
      socket.off('filewatcher:git', handleGitChanged);
    };
  }, [normalizedRootPath]);
}
