'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCodeBrowserStore } from '@/stores/codeBrowserStore';
import { fetchDirectoryTree } from '@/lib/codeApi';
import type { TreeEntry } from '@/types/code';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  FileType,
  Loader2,
} from 'lucide-react';

interface FileTreeItemProps {
  entry: TreeEntry;
  rootPath: string;
  depth: number;
}

// Get icon for file type
function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return <FileCode className="h-4 w-4 text-blue-500" />;
    case 'json':
    case 'jsonc':
      return <FileJson className="h-4 w-4 text-yellow-500" />;
    case 'md':
    case 'mdx':
    case 'txt':
      return <FileText className="h-4 w-4 text-gray-500" />;
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return <FileType className="h-4 w-4 text-pink-500" />;
    case 'html':
    case 'htm':
      return <FileType className="h-4 w-4 text-orange-500" />;
    case 'py':
      return <FileCode className="h-4 w-4 text-green-500" />;
    case 'rb':
      return <FileCode className="h-4 w-4 text-red-500" />;
    case 'go':
      return <FileCode className="h-4 w-4 text-cyan-500" />;
    case 'rs':
      return <FileCode className="h-4 w-4 text-orange-600" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}

export function FileTreeItem({ entry, rootPath, depth }: FileTreeItemProps) {
  const {
    isFolderExpanded,
    toggleFolder,
    expandFolder,
    selectedFile,
    selectFile,
    getTreeCache,
    setTreeCache,
    showHiddenFiles,
  } = useCodeBrowserStore();

  const [children, setChildren] = useState<TreeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isExpanded = entry.type === 'directory' && isFolderExpanded(entry.path);
  const isSelected = selectedFile === entry.path;

  // Load children when folder is expanded
  useEffect(() => {
    if (entry.type !== 'directory' || !isExpanded) return;

    const cached = getTreeCache(entry.path);
    if (cached) {
      setChildren(cached);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetchDirectoryTree(entry.path, rootPath, showHiddenFiles)
      .then((response) => {
        setChildren(response.entries);
        setTreeCache(entry.path, response.entries);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [entry.path, entry.type, isExpanded, rootPath, showHiddenFiles, getTreeCache, setTreeCache]);

  const handleClick = () => {
    if (entry.type === 'directory') {
      toggleFolder(entry.path);
    } else {
      selectFile(entry.path);
    }
  };

  const handleDoubleClick = () => {
    if (entry.type === 'directory') {
      // Expand on double-click if collapsed
      if (!isExpanded) {
        expandFolder(entry.path);
      }
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-accent rounded-sm text-sm',
          isSelected && 'bg-accent'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {entry.type === 'directory' ? (
          <>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 text-yellow-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            {getFileIcon(entry.name)}
          </>
        )}
        <span className="truncate flex-1">{entry.name}</span>
      </div>

      {entry.type === 'directory' && isExpanded && (
        <div>
          {error && (
            <div
              className="text-xs text-destructive px-2 py-1"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              {error}
            </div>
          )}
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              entry={child}
              rootPath={rootPath}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
