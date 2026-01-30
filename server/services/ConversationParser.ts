import * as fs from 'fs';
import type { ChatHistoryItem, ToolCallContent, ToolResultContent } from '../../src/types';

interface ParseCache {
  mtime: number;
  offset: number;
  messages: ChatHistoryItem[];
}

// Actual JSONL entry structure from Claude Code
interface JsonlEntry {
  type: string;
  uuid?: string;
  timestamp?: string;
  message?: {
    id?: string;
    role?: string;
    content?: string | ContentBlock[];
  };
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export class ConversationParser {
  private cache: Map<string, ParseCache> = new Map();

  async parse(filePath: string): Promise<ChatHistoryItem[]> {
    try {
      const stat = await fs.promises.stat(filePath);
      const cached = this.cache.get(filePath);

      // If file hasn't changed, return cached
      if (cached && cached.mtime === stat.mtimeMs) {
        return cached.messages;
      }

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      const messages: ChatHistoryItem[] = [];

      for (const line of lines) {
        try {
          const parsed: JsonlEntry = JSON.parse(line);
          const items = this.parseEntry(parsed);
          messages.push(...items);
        } catch {
          // Skip invalid JSON lines
        }
      }

      // Update cache
      this.cache.set(filePath, {
        mtime: stat.mtimeMs,
        offset: content.length,
        messages,
      });

      return messages;
    } catch (err) {
      console.error('[ConversationParser] Error parsing file:', err);
      return [];
    }
  }

  private parseEntry(entry: JsonlEntry): ChatHistoryItem[] {
    const items: ChatHistoryItem[] = [];

    // Only process user and assistant messages
    if (entry.type !== 'user' && entry.type !== 'assistant') {
      return items;
    }

    const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
    const messageId = entry.uuid || entry.message?.id || `msg-${timestamp.getTime()}`;
    const content = entry.message?.content;

    if (!content) {
      return items;
    }

    // Handle string content (simple user messages)
    if (typeof content === 'string') {
      items.push({
        id: messageId,
        type: entry.type === 'user' ? 'user' : 'assistant',
        content: content,
        timestamp,
      });
      return items;
    }

    // Handle array content (complex messages with blocks)
    for (const block of content) {
      const item = this.parseContentBlock(block, messageId, timestamp, entry.type);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  private parseContentBlock(
    block: ContentBlock,
    messageId: string,
    timestamp: Date,
    messageType: string
  ): ChatHistoryItem | null {
    switch (block.type) {
      case 'text':
        if (!block.text) return null;
        return {
          id: `${messageId}-text-${Date.now()}`,
          type: messageType === 'user' ? 'user' : 'assistant',
          content: block.text,
          timestamp,
        };

      case 'tool_use':
        if (!block.id || !block.name) return null;
        return {
          id: block.id,
          type: 'toolCall',
          content: {
            toolName: block.name,
            toolUseId: block.id,
            input: block.input || {},
          } as ToolCallContent,
          timestamp,
        };

      case 'tool_result':
        if (!block.tool_use_id) return null;
        return {
          id: `${block.tool_use_id}-result`,
          type: 'toolResult',
          content: {
            toolUseId: block.tool_use_id,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            isError: block.is_error,
          } as ToolResultContent,
          timestamp,
        };

      case 'thinking':
        if (!block.thinking) return null;
        return {
          id: `${messageId}-thinking-${Date.now()}`,
          type: 'thinking',
          content: block.thinking,
          timestamp,
        };

      default:
        return null;
    }
  }

  clearCache(filePath?: string): void {
    if (filePath) {
      this.cache.delete(filePath);
    } else {
      this.cache.clear();
    }
  }
}
