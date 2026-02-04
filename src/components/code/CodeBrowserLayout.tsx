'use client';

import { FileTree } from './FileTree';
import { CodeViewer } from './CodeViewer';
import { GitPanel } from './GitPanel';

interface CodeBrowserLayoutProps {
  rootPath: string;
  projectName: string;
}

export function CodeBrowserLayout({ rootPath, projectName }: CodeBrowserLayoutProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* File Tree */}
        <div className="w-64 border-r flex-shrink-0">
          <FileTree rootPath={rootPath} />
        </div>

        {/* Code Viewer */}
        <div className="flex-1 min-w-0">
          <CodeViewer rootPath={rootPath} />
        </div>

        {/* Git Panel */}
        <GitPanel rootPath={rootPath} />
      </div>
    </div>
  );
}
