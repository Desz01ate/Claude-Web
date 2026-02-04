'use client';

import { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useCodeBrowserStore } from '@/stores/codeBrowserStore';
import { fetchDirectoryTree } from '@/lib/codeApi';
import { FileTreeItem } from './FileTreeItem';
import type { TreeEntry } from '@/types/code';
import { Eye, EyeOff, RefreshCw, Loader2, AlertCircle } from 'lucide-react';

interface FileTreeProps {
  rootPath: string;
}

export function FileTree({ rootPath }: FileTreeProps) {
  const {
    getTreeCache,
    setTreeCache,
    showHiddenFiles,
    toggleHiddenFiles,
    clearCache,
  } = useCodeBrowserStore();

  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTree = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getTreeCache(rootPath);
      if (cached) {
        setEntries(cached);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchDirectoryTree(rootPath, rootPath, showHiddenFiles);
      setEntries(response.entries);
      setTreeCache(rootPath, response.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, [rootPath, showHiddenFiles]);

  const handleRefresh = () => {
    clearCache();
    loadTree(true);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={toggleHiddenFiles}
            title={showHiddenFiles ? 'Hide hidden files' : 'Show hidden files'}
          >
            {showHiddenFiles ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && entries.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-4 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="py-2">
            {entries.map((entry) => (
              <FileTreeItem
                key={entry.path}
                entry={entry}
                rootPath={rootPath}
                depth={0}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
