'use client';

interface ToolInputDisplayProps {
  input: Record<string, unknown>;
  toolName: string;
}

export function ToolInputDisplay({ input, toolName }: ToolInputDisplayProps) {
  const formatValue = (value: unknown): string => {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
  };

  const hasDescription = 'description' in input && input.description;
  const hasContent = 'content' in input && input.content;

  // Special formatting for common tools
  if (toolName === 'Bash' && 'command' in input) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-muted-foreground">Command:</div>
        <pre className="bg-muted p-3 rounded-md text-sm overflow-auto font-mono">
          {formatValue(input.command)}
        </pre>
        {hasDescription ? (
          <>
            <div className="text-sm font-medium text-muted-foreground">
              Description:
            </div>
            <p className="text-sm">{formatValue(input.description)}</p>
          </>
        ) : null}
      </div>
    );
  }

  if ((toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') && 'file_path' in input) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-muted-foreground">File:</div>
        <pre className="bg-muted p-3 rounded-md text-sm overflow-auto font-mono">
          {formatValue(input.file_path)}
        </pre>
        {hasContent ? (
          <>
            <div className="text-sm font-medium text-muted-foreground">
              Content:
            </div>
            <pre className="bg-muted p-3 rounded-md text-sm overflow-auto max-h-64">
              {formatValue(input.content)}
            </pre>
          </>
        ) : null}
      </div>
    );
  }

  // Generic display
  return (
    <pre className="bg-muted p-3 rounded-md text-sm overflow-auto max-h-96">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}
