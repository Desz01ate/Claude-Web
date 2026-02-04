'use client';

import { useState, useCallback } from 'react';
import { FileTree } from './FileTree';
import { CodeViewer } from './CodeViewer';
import { GitPanel } from './GitPanel';
import { WebTerminal } from './WebTerminal';
import { useCodeBrowserStore } from '@/stores/codeBrowserStore';
import { useFileWatcher } from '@/hooks/useFileWatcher';

interface CodeBrowserLayoutProps {
  rootPath: string;
  projectName: string;
}

export function CodeBrowserLayout({ rootPath, projectName }: CodeBrowserLayoutProps) {
  const { isTerminalOpen, setTerminalOpen } = useCodeBrowserStore();

  // Refresh triggers - increment to trigger a refresh in child components
  const [fileTreeRefreshTrigger, setFileTreeRefreshTrigger] = useState(0);
  const [gitPanelRefreshTrigger, setGitPanelRefreshTrigger] = useState(0);

  // Handle file watcher events
  const handleFilesChanged = useCallback(() => {
    setFileTreeRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleGitChanged = useCallback(() => {
    setGitPanelRefreshTrigger((prev) => prev + 1);
  }, []);

  // Subscribe to file watcher
  useFileWatcher({
    rootPath,
    onFilesChanged: handleFilesChanged,
    onGitChanged: handleGitChanged,
  });

  return (
    <div className="h-full flex flex-col">
      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* File Tree */}
        <div className="w-64 border-r flex-shrink-0">
          <FileTree rootPath={rootPath} refreshTrigger={fileTreeRefreshTrigger} />
        </div>

        {/* Code Viewer with Terminal */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Code Viewer Area */}
          <div className={isTerminalOpen ? 'flex-1 min-h-0' : 'h-full'} style={isTerminalOpen ? { height: '70%' } : undefined}>
            <CodeViewer rootPath={rootPath} />
          </div>

          {/* Terminal Panel */}
          {isTerminalOpen && (
            <div style={{ height: '30%' }} className="min-h-[150px]">
              <WebTerminal
                path={rootPath}
                rootPath={rootPath}
                onClose={() => setTerminalOpen(false)}
              />
            </div>
          )}
        </div>

        {/* Git Panel */}
        <GitPanel rootPath={rootPath} refreshTrigger={gitPanelRefreshTrigger} />
      </div>
    </div>
  );
}
