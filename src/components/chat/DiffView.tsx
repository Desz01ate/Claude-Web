'use client';

import { diffLines, Change } from 'diff';

interface DiffViewProps {
  oldString: string;
  newString: string;
  filePath?: string;
}

export function DiffView({ oldString, newString, filePath }: DiffViewProps) {
  const changes: Change[] = diffLines(oldString, newString);

  return (
    <div className="font-mono text-xs overflow-x-auto">
      {filePath && (
        <div className="text-muted-foreground mb-2 text-sm truncate" title={filePath}>
          {filePath}
        </div>
      )}
      <div className="bg-muted rounded-md overflow-hidden">
        {changes.map((change, index) => {
          const lines = change.value.split('\n');
          // Remove last empty line from split if the value ends with newline
          if (lines[lines.length - 1] === '') {
            lines.pop();
          }

          return lines.map((line, lineIndex) => {
            if (change.removed) {
              return (
                <div
                  key={`${index}-${lineIndex}`}
                  className="px-3 py-0.5 bg-red-500/20 text-red-700 dark:text-red-400"
                >
                  <span className="select-none w-6 inline-block text-red-600 dark:text-red-500">-</span>
                  {line}
                </div>
              );
            }
            if (change.added) {
              return (
                <div
                  key={`${index}-${lineIndex}`}
                  className="px-3 py-0.5 bg-green-500/20 text-green-700 dark:text-green-400"
                >
                  <span className="select-none w-6 inline-block text-green-600 dark:text-green-500">+</span>
                  {line}
                </div>
              );
            }
            // Context line (unchanged)
            return (
              <div
                key={`${index}-${lineIndex}`}
                className="px-3 py-0.5 text-muted-foreground"
              >
                <span className="select-none w-6 inline-block">&nbsp;</span>
                {line}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
