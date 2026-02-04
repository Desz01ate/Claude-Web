'use client';

import { ScrollArea } from '@/components/ui/scroll-area';

interface DiffViewerProps {
  diff: string;
  fileName?: string;
}

export function DiffViewer({ diff, fileName }: DiffViewerProps) {
  if (!diff) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No changes to display
      </div>
    );
  }

  // Parse diff into lines with proper styling
  const lines = diff.split('\n');

  return (
    <ScrollArea className="h-full">
      <div className="font-mono text-xs p-2">
        {fileName && (
          <div className="text-muted-foreground mb-2 text-sm font-semibold">
            {fileName}
          </div>
        )}
        <div className="bg-muted rounded-md overflow-hidden">
          {lines.map((line, index) => {
            // Determine line type
            let className = 'px-3 py-0.5 whitespace-pre';
            let prefix = ' ';

            if (line.startsWith('+++') || line.startsWith('---')) {
              // File header
              className += ' text-muted-foreground font-semibold bg-muted';
            } else if (line.startsWith('@@')) {
              // Hunk header
              className += ' text-blue-600 dark:text-blue-400 bg-blue-500/10';
            } else if (line.startsWith('+')) {
              // Added line
              className += ' bg-green-500/20 text-green-700 dark:text-green-400';
              prefix = '+';
            } else if (line.startsWith('-')) {
              // Removed line
              className += ' bg-red-500/20 text-red-700 dark:text-red-400';
              prefix = '-';
            } else {
              // Context line
              className += ' text-muted-foreground';
            }

            return (
              <div key={index} className={className}>
                {line.startsWith('+') || line.startsWith('-') ? (
                  <>
                    <span className="select-none w-4 inline-block opacity-70">{prefix}</span>
                    {line.slice(1)}
                  </>
                ) : (
                  line
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
