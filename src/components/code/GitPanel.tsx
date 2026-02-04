'use client';

import { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useCodeBrowserStore } from '@/stores/codeBrowserStore';
import { fetchGitStatus, fetchGitFileContent, fetchFileContent } from '@/lib/codeApi';
import { GitFileList } from './GitFileList';
import { EXTENSION_LANGUAGE_MAP } from '@/types/code';
import {
  GitBranch,
  RefreshCw,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface GitPanelProps {
  rootPath: string;
}

// Get Monaco language from file path
function getLanguage(filePath: string): string {
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}

export function GitPanel({ rootPath }: GitPanelProps) {
  const {
    gitStatus,
    setGitStatus,
    isGitPanelOpen,
    toggleGitPanel,
    openFileDiff,
  } = useCodeBrowserStore();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);

  const loadGitStatus = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const status = await fetchGitStatus(rootPath);
      setGitStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load git status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGitStatus();
  }, [rootPath]);

  const handleFileSelect = async (filePath: string) => {
    setSelectedDiffFile(filePath);
    setIsDiffLoading(true);

    try {
      // Get the file's status to determine how to handle it
      const fileStatus = gitStatus?.files.find((f) => f.path === filePath);
      const fullPath = rootPath + '/' + filePath;
      const language = getLanguage(filePath);

      if (fileStatus?.status === '?') {
        // Untracked file - no original content, just show the new file
        const currentContent = await fetchFileContent(fullPath, rootPath);
        openFileDiff(fullPath, '', currentContent.content, language);
      } else if (fileStatus?.status === 'D') {
        // Deleted file - show original content only
        const originalContent = await fetchGitFileContent(rootPath, filePath);
        openFileDiff(fullPath, originalContent.content, '', language);
      } else {
        // Modified, Added (staged), or other - show diff
        const [originalContent, currentContent] = await Promise.all([
          fetchGitFileContent(rootPath, filePath),
          fetchFileContent(fullPath, rootPath),
        ]);

        openFileDiff(
          fullPath,
          originalContent.exists ? originalContent.content : '',
          currentContent.content,
          language
        );
      }
    } catch (err) {
      console.error('Error loading diff:', err);
    } finally {
      setIsDiffLoading(false);
    }
  };

  // Collapsed state - just show toggle button
  if (!isGitPanelOpen) {
    return (
      <div className="w-10 border-l flex flex-col items-center py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleGitPanel}
          title="Open Git panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="writing-mode-vertical text-xs text-muted-foreground mt-2 rotate-180">
          Git
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 border-l flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <span className="text-sm font-medium">Git</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={loadGitStatus}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={toggleGitPanel}
            title="Close Git panel"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading && !gitStatus ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 px-4 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={loadGitStatus}>
            Retry
          </Button>
        </div>
      ) : gitStatus && !gitStatus.isRepo ? (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <p className="text-sm">Not a git repository</p>
        </div>
      ) : gitStatus ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Branch info */}
          <div className="px-3 py-2 border-b">
            <div className="flex items-center gap-2 text-sm">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono truncate">{gitStatus.branch}</span>
            </div>
            {(gitStatus.ahead || gitStatus.behind) && (
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {gitStatus.ahead ? (
                  <span className="flex items-center gap-1">
                    <ArrowUp className="h-3 w-3" />
                    {gitStatus.ahead} ahead
                  </span>
                ) : null}
                {gitStatus.behind ? (
                  <span className="flex items-center gap-1">
                    <ArrowDown className="h-3 w-3" />
                    {gitStatus.behind} behind
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* File list */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              {isDiffLoading && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground ml-2">Loading diff...</span>
                </div>
              )}
              <GitFileList
                files={gitStatus.files}
                selectedFile={selectedDiffFile}
                onFileSelect={handleFileSelect}
              />
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
