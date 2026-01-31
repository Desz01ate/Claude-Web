'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChatHistoryItem, ToolCallContent, ToolResultContent } from '@/types';
import { ChevronDown, ChevronUp, Wrench, CheckCircle, XCircle } from 'lucide-react';
import { DiffView } from './DiffView';

interface ToolCallCardProps {
  toolCall: ChatHistoryItem;
  toolResult?: ChatHistoryItem;
}

export function ToolCallCard({ toolCall, toolResult }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const content = toolCall.content as ToolCallContent;
  const result = toolResult?.content as ToolResultContent | undefined;

  const hasError = result?.isError;
  const toolName = content.toolName;

  const formatInput = (input: Record<string, unknown>) => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  const isEditInput = (input: Record<string, unknown>): boolean => {
    return (
      typeof input.old_string === 'string' &&
      typeof input.new_string === 'string' &&
      typeof input.file_path === 'string'
    );
  };

  const truncateContent = (str: string, maxLen: number = 200) => {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + '...';
  };

  return (
    <Card className={cn('border-l-4', hasError ? 'border-l-red-500' : 'border-l-blue-500')}>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-mono">{toolName}</CardTitle>
            {result && (
              hasError ? (
                <XCircle className="h-4 w-4 text-red-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          <div>
            <Badge variant="outline" className="mb-2">
              Input
            </Badge>
            {toolName === 'Edit' && isEditInput(content.input) ? (
              <DiffView
                oldString={content.input.old_string as string}
                newString={content.input.new_string as string}
                filePath={content.input.file_path as string}
              />
            ) : (
              <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
                {formatInput(content.input)}
              </pre>
            )}
          </div>

          {result && (
            <div>
              <Badge
                variant={hasError ? 'destructive' : 'outline'}
                className="mb-2"
              >
                {hasError ? 'Error' : 'Output'}
              </Badge>
              <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto max-h-96">
                {result.content}
              </pre>
            </div>
          )}
        </CardContent>
      )}

      {!expanded && result && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground truncate">
            {truncateContent(result.content)}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
