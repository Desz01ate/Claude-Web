'use client';

import { cn } from '@/lib/utils';
import type { ChatHistoryItem } from '@/types';
import { User, Bot, Wrench, Lightbulb } from 'lucide-react';

interface ChatMessageProps {
  item: ChatHistoryItem;
}

export function ChatMessage({ item }: ChatMessageProps) {
  const renderContent = () => {
    if (typeof item.content === 'string') {
      return (
        <div className="whitespace-pre-wrap break-words">{item.content}</div>
      );
    }
    return null;
  };

  const getIcon = () => {
    switch (item.type) {
      case 'user':
        return <User className="h-4 w-4" />;
      case 'assistant':
        return <Bot className="h-4 w-4" />;
      case 'toolCall':
      case 'toolResult':
        return <Wrench className="h-4 w-4" />;
      case 'thinking':
        return <Lightbulb className="h-4 w-4" />;
      default:
        return <Bot className="h-4 w-4" />;
    }
  };

  const getLabel = () => {
    switch (item.type) {
      case 'user':
        return 'User';
      case 'assistant':
        return 'Assistant';
      case 'toolCall':
        return 'Tool Call';
      case 'toolResult':
        return 'Tool Result';
      case 'thinking':
        return 'Thinking';
      default:
        return 'Message';
    }
  };

  const getBgColor = () => {
    switch (item.type) {
      case 'user':
        return 'bg-blue-50 dark:bg-blue-950';
      case 'thinking':
        return 'bg-yellow-50 dark:bg-yellow-950';
      default:
        return 'bg-gray-50 dark:bg-gray-900';
    }
  };

  // Skip tool calls, results, and permission requests - they're handled separately
  if (item.type === 'toolCall' || item.type === 'toolResult' || item.type === 'permissionRequest') {
    return null;
  }

  return (
    <div className={cn('rounded-lg p-4', getBgColor())}>
      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
        {getIcon()}
        <span>{getLabel()}</span>
      </div>
      {renderContent()}
    </div>
  );
}
