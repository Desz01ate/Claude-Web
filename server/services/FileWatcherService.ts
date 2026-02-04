import { EventEmitter } from 'events';
import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import type { FileWatcherChange } from '../../src/types';

interface WatcherEntry {
  watcher: FSWatcher;
  socketIds: Set<string>;
  pendingChanges: FileWatcherChange[];
  debounceTimer: NodeJS.Timeout | null;
  gitThrottleTimer: NodeJS.Timeout | null;
  gitPending: boolean;
}

export class FileWatcherService extends EventEmitter {
  private watchers: Map<string, WatcherEntry> = new Map();
  private socketSubscriptions: Map<string, Set<string>> = new Map(); // socketId -> Set<rootPath>

  private readonly DEBOUNCE_MS = 300;
  private readonly GIT_THROTTLE_MS = 2000;

  private readonly IGNORE_PATTERNS = [
    '**/node_modules/**',
    '**/.git/objects/**',
    '**/.git/logs/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.cache/**',
    '**/coverage/**',
    '**/.turbo/**',
  ];

  subscribe(socketId: string, rootPath: string): void {
    const normalizedPath = path.resolve(rootPath);
    console.log(`[FileWatcher] Socket ${socketId} subscribing to ${normalizedPath}`);

    // Track socket -> paths mapping
    if (!this.socketSubscriptions.has(socketId)) {
      this.socketSubscriptions.set(socketId, new Set());
    }
    this.socketSubscriptions.get(socketId)!.add(normalizedPath);

    // Check if we already have a watcher for this path
    const existing = this.watchers.get(normalizedPath);
    if (existing) {
      existing.socketIds.add(socketId);
      console.log(`[FileWatcher] Added socket to existing watcher, total: ${existing.socketIds.size}`);
      return;
    }

    // Create new watcher
    const entry: WatcherEntry = {
      watcher: this.createWatcher(normalizedPath),
      socketIds: new Set([socketId]),
      pendingChanges: [],
      debounceTimer: null,
      gitThrottleTimer: null,
      gitPending: false,
    };

    this.watchers.set(normalizedPath, entry);
    console.log(`[FileWatcher] Created new watcher for ${normalizedPath}`);
  }

  unsubscribe(socketId: string, rootPath: string): void {
    const normalizedPath = path.resolve(rootPath);
    console.log(`[FileWatcher] Socket ${socketId} unsubscribing from ${normalizedPath}`);

    // Remove from socket subscriptions
    const socketPaths = this.socketSubscriptions.get(socketId);
    if (socketPaths) {
      socketPaths.delete(normalizedPath);
      if (socketPaths.size === 0) {
        this.socketSubscriptions.delete(socketId);
      }
    }

    // Remove from watcher
    const entry = this.watchers.get(normalizedPath);
    if (!entry) return;

    entry.socketIds.delete(socketId);

    // If no more subscribers, close the watcher
    if (entry.socketIds.size === 0) {
      this.closeWatcher(normalizedPath, entry);
    }
  }

  cleanupSocket(socketId: string): void {
    console.log(`[FileWatcher] Cleaning up socket ${socketId}`);
    const socketPaths = this.socketSubscriptions.get(socketId);
    if (!socketPaths) return;

    // Unsubscribe from all paths
    for (const rootPath of socketPaths) {
      const entry = this.watchers.get(rootPath);
      if (entry) {
        entry.socketIds.delete(socketId);
        if (entry.socketIds.size === 0) {
          this.closeWatcher(rootPath, entry);
        }
      }
    }

    this.socketSubscriptions.delete(socketId);
  }

  closeAll(): void {
    console.log(`[FileWatcher] Closing all watchers`);
    for (const [rootPath, entry] of this.watchers) {
      this.closeWatcher(rootPath, entry);
    }
    this.watchers.clear();
    this.socketSubscriptions.clear();
  }

  private closeWatcher(rootPath: string, entry: WatcherEntry): void {
    console.log(`[FileWatcher] Closing watcher for ${rootPath}`);

    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
    }
    if (entry.gitThrottleTimer) {
      clearTimeout(entry.gitThrottleTimer);
    }

    entry.watcher.close().catch((err) => {
      console.error(`[FileWatcher] Error closing watcher:`, err);
    });

    this.watchers.delete(rootPath);
  }

  private createWatcher(rootPath: string): FSWatcher {
    const watcher = chokidar.watch(rootPath, {
      ignored: this.IGNORE_PATTERNS,
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      depth: 20, // Reasonable depth limit
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on('add', (filePath) => this.handleFileChange(rootPath, filePath, 'add'));
    watcher.on('change', (filePath) => this.handleFileChange(rootPath, filePath, 'change'));
    watcher.on('unlink', (filePath) => this.handleFileChange(rootPath, filePath, 'unlink'));
    watcher.on('addDir', (filePath) => this.handleFileChange(rootPath, filePath, 'addDir'));
    watcher.on('unlinkDir', (filePath) => this.handleFileChange(rootPath, filePath, 'unlinkDir'));

    watcher.on('error', (err) => {
      console.error(`[FileWatcher] Error for ${rootPath}:`, err);
    });

    watcher.on('ready', () => {
      console.log(`[FileWatcher] Ready for ${rootPath}`);
    });

    return watcher;
  }

  private handleFileChange(
    rootPath: string,
    filePath: string,
    type: FileWatcherChange['type']
  ): void {
    const entry = this.watchers.get(rootPath);
    if (!entry) return;

    const relativePath = path.relative(rootPath, filePath);

    // Check if this is a git-related change (internal .git files)
    if (this.isGitChange(relativePath)) {
      this.scheduleGitEvent(rootPath, entry);
      return;
    }

    // Skip files inside .git directory that aren't tracked
    if (relativePath.startsWith('.git/')) {
      return;
    }

    // Add to pending changes for file tree
    entry.pendingChanges.push({ path: relativePath, type });

    // Debounce the file change event
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
    }

    entry.debounceTimer = setTimeout(() => {
      this.emitFileChanges(rootPath, entry);
    }, this.DEBOUNCE_MS);

    // Also schedule git status refresh since working directory changes affect git status
    this.scheduleGitEvent(rootPath, entry);
  }

  private isGitChange(relativePath: string): boolean {
    // Watch for git state changes
    return (
      relativePath === '.git/HEAD' ||
      relativePath === '.git/index' ||
      relativePath.startsWith('.git/refs/') ||
      relativePath === '.git/COMMIT_EDITMSG' ||
      relativePath === '.git/MERGE_HEAD' ||
      relativePath === '.git/REBASE_HEAD'
    );
  }

  private scheduleGitEvent(rootPath: string, entry: WatcherEntry): void {
    entry.gitPending = true;

    // Throttle git events
    if (entry.gitThrottleTimer) {
      return; // Already scheduled
    }

    entry.gitThrottleTimer = setTimeout(() => {
      entry.gitThrottleTimer = null;
      if (entry.gitPending) {
        entry.gitPending = false;
        console.log(`[FileWatcher] Emitting git change for ${rootPath}`);
        this.emit('git:changed', rootPath);
      }
    }, this.GIT_THROTTLE_MS);
  }

  private emitFileChanges(rootPath: string, entry: WatcherEntry): void {
    if (entry.pendingChanges.length === 0) return;

    const changes = [...entry.pendingChanges];
    entry.pendingChanges = [];
    entry.debounceTimer = null;

    console.log(`[FileWatcher] Emitting ${changes.length} changes for ${rootPath}`);
    this.emit('files:changed', rootPath, changes);
  }
}
