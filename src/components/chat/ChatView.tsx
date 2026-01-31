'use client';

import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ToolCallCard } from './ToolCallCard';
import { PermissionRequestCard } from './PermissionRequestCard';
import { QuestionCard } from './QuestionCard';
import { usePermissionStore } from '@/stores/permissionStore';
import type { ChatHistoryItem, ToolCallContent, ToolResultContent, PermissionRequestContent, CompactionMessageContent } from '@/types';
import { RefreshCw } from 'lucide-react';

interface ChatViewProps {
  messages: ChatHistoryItem[];
  sessionId: string;
}

export function ChatView({ messages, sessionId }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingPermissions = usePermissionStore((state) =>
    state.getPermissionsForSession(sessionId)
  );

  useEffect(() => {
    // Scroll to bottom when messages change or permissions change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingPermissions]);

  // Group tool calls with their results
  type GroupedItem =
    | ChatHistoryItem
    | { toolCall: ChatHistoryItem; toolResult?: ChatHistoryItem }
    | { permissionRequest: ChatHistoryItem }
    | { compaction: ChatHistoryItem };

  const groupedMessages: GroupedItem[] = [];
  const toolCalls = new Map<string, ChatHistoryItem>();

  for (const msg of messages) {
    if (msg.type === 'toolCall') {
      const content = msg.content as ToolCallContent;
      toolCalls.set(content.toolUseId, msg);
    } else if (msg.type === 'toolResult') {
      const content = msg.content as ToolResultContent;
      const call = toolCalls.get(content.toolUseId);
      if (call) {
        groupedMessages.push({ toolCall: call, toolResult: msg });
        toolCalls.delete(content.toolUseId);
      } else {
        // Orphan result - shouldn't happen but handle it
        groupedMessages.push(msg);
      }
    } else if (msg.type === 'permissionRequest') {
      // First, flush any pending tool calls without results
      for (const [id, call] of toolCalls) {
        groupedMessages.push({ toolCall: call });
        toolCalls.delete(id);
      }
      groupedMessages.push({ permissionRequest: msg });
    } else if (msg.type === 'compaction') {
      // First, flush any pending tool calls without results
      for (const [id, call] of toolCalls) {
        groupedMessages.push({ toolCall: call });
        toolCalls.delete(id);
      }
      groupedMessages.push({ compaction: msg });
    } else {
      // First, flush any pending tool calls without results
      for (const [id, call] of toolCalls) {
        groupedMessages.push({ toolCall: call });
        toolCalls.delete(id);
      }
      groupedMessages.push(msg);
    }
  }

  // Flush remaining tool calls
  for (const call of toolCalls.values()) {
    groupedMessages.push({ toolCall: call });
  }

  if (messages.length === 0 && pendingPermissions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No messages yet
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto scroll-smooth"
    >
      <div className="space-y-4 p-4">
        {groupedMessages.map((item, index) => {
          if ('toolCall' in item) {
            const toolContent = item.toolCall.content as ToolCallContent;
            // Render AskUserQuestion as QuestionCard with answered state
            if (toolContent.toolName === 'AskUserQuestion') {
              // Parse answers from tool result if available
              let answers: Record<string, string> | undefined;
              if (item.toolResult) {
                const resultContent = item.toolResult.content as ToolResultContent;
                try {
                  answers = JSON.parse(resultContent.content);
                } catch {
                  // If parsing fails, leave answers undefined
                }
              }
              return (
                <QuestionCard
                  key={item.toolCall.id}
                  sessionId={sessionId}
                  content={{
                    toolUseId: toolContent.toolUseId,
                    toolName: toolContent.toolName,
                    toolInput: toolContent.input,
                    status: item.toolResult ? 'answered' : 'pending',
                    answers,
                  }}
                />
              );
            }
            return (
              <ToolCallCard
                key={item.toolCall.id}
                toolCall={item.toolCall}
                toolResult={item.toolResult}
              />
            );
          }
          if ('permissionRequest' in item) {
            const content = item.permissionRequest.content as PermissionRequestContent;
            return (
              <PermissionRequestCard
                key={item.permissionRequest.id}
                sessionId={sessionId}
                content={content}
              />
            );
          }
          if ('compaction' in item) {
            const content = item.compaction.content as CompactionMessageContent;
            return (
              <div
                key={item.compaction.id}
                className="flex items-center justify-center py-4"
              >
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full text-sm text-muted-foreground border border-border/50">
                  <RefreshCw className="w-4 h-4" />
                  <span>{content.message}</span>
                </div>
              </div>
            );
          }
          return <ChatMessage key={item.id || index} item={item} />;
        })}

        {/* Render pending/answered permissions from the permission store */}
        {/* Skip if already shown in history */}
        {pendingPermissions
          .filter((permission) => {
            // Check if this permission already exists in history
            const hasInHistory = groupedMessages.some((item) => {
              if ('toolCall' in item) {
                const content = item.toolCall.content as ToolCallContent;
                // For AskUserQuestion, exclude if there's any matching toolCall (we render it directly)
                // For other tools, only exclude if there's a toolResult (completed)
                if (permission.toolName === 'AskUserQuestion') {
                  return content.toolUseId === permission.toolUseId;
                }
                return content.toolUseId === permission.toolUseId && item.toolResult;
              }
              return false;
            });
            return !hasInHistory;
          })
          .map((permission) => (
            <PermissionRequestCard
              key={`pending-${permission.toolUseId}`}
              sessionId={sessionId}
              content={{
                toolUseId: permission.toolUseId,
                toolName: permission.toolName,
                toolInput: permission.toolInput,
                status: permission.status === 'answered' ? 'answered' : 'pending',
                answers: permission.answers,
              }}
            />
          ))}
      </div>
    </div>
  );
}
