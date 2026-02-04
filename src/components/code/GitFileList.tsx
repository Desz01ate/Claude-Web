'use client';

import { cn } from '@/lib/utils';
import type { GitStatusFile } from '@/types/code';
import { File, FilePlus, FileMinus, FileEdit } from 'lucide-react';

interface GitFileListProps {
  files: GitStatusFile[];
  selectedFile?: string | null;
  onFileSelect?: (path: string) => void;
}

// Get icon and color for git status
function getStatusIcon(status: string) {
  switch (status) {
    case 'M':
      return <FileEdit className="h-4 w-4 text-yellow-500" />;
    case 'A':
    case '?':
      return <FilePlus className="h-4 w-4 text-green-500" />;
    case 'D':
      return <FileMinus className="h-4 w-4 text-red-500" />;
    case 'R':
      return <FileEdit className="h-4 w-4 text-blue-500" />;
    case 'C':
      return <FilePlus className="h-4 w-4 text-blue-500" />;
    case 'U':
      return <FileEdit className="h-4 w-4 text-purple-500" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'M':
      return 'Modified';
    case 'A':
      return 'Added';
    case 'D':
      return 'Deleted';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    case 'U':
      return 'Unmerged';
    case '?':
      return 'Untracked';
    case '!':
      return 'Ignored';
    default:
      return status;
  }
}

export function GitFileList({ files, selectedFile, onFileSelect }: GitFileListProps) {
  // Group files by staged/unstaged
  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);

  const renderFileItem = (file: GitStatusFile) => {
    const isSelected = selectedFile === file.path;
    const filename = file.path.split('/').pop() || file.path;

    return (
      <div
        key={`${file.path}-${file.staged ? 'staged' : 'unstaged'}`}
        className={cn(
          'flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm text-sm',
          isSelected && 'bg-accent'
        )}
        onClick={() => onFileSelect?.(file.path)}
        title={`${file.path} (${getStatusLabel(file.status)})`}
      >
        {getStatusIcon(file.status)}
        <span className="truncate flex-1">{filename}</span>
        <span className="text-xs text-muted-foreground">{file.status}</span>
      </div>
    );
  };

  if (files.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No changes
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stagedFiles.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-1">
            Staged ({stagedFiles.length})
          </div>
          <div className="space-y-0.5">
            {stagedFiles.map(renderFileItem)}
          </div>
        </div>
      )}

      {unstagedFiles.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-1">
            Changes ({unstagedFiles.length})
          </div>
          <div className="space-y-0.5">
            {unstagedFiles.map(renderFileItem)}
          </div>
        </div>
      )}
    </div>
  );
}
