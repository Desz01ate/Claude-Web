// Shared types between frontend and backend

export interface SessionState {
  sessionId: string;
  cwd: string;
  projectName: string;
  pid?: number;
  tty?: string;
  phase: SessionPhase;
  lastActivity: Date;
  conversationPath?: string;
  isManaged: boolean;           // true if created via web UI
  tmuxSessionName?: string;     // tmux session name for managed sessions
  canSendPrompts: boolean;      // false for legacy/external sessions
}

export type SessionPhase =
  | { type: 'idle' }
  | { type: 'processing' }
  | { type: 'waitingForInput' }
  | { type: 'waitingForApproval'; permission: PermissionContext }
  | { type: 'compacting' }
  | { type: 'ended' };

export interface PermissionContext {
  toolUseId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  receivedAt: Date;
}

export interface CompactionMessageContent {
  type: 'compaction';
  timestamp: Date;
  message: string;
}

export interface ChatHistoryItem {
  id: string;
  type: 'user' | 'assistant' | 'toolCall' | 'toolResult' | 'thinking' | 'permissionRequest' | 'compaction';
  content: string | ToolCallContent | ToolResultContent | PermissionRequestContent | CompactionMessageContent;
  timestamp: Date;
}

export interface PermissionRequestContent {
  toolUseId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  status: 'pending' | 'allowed' | 'denied' | 'asked' | 'answered';
  answers?: Record<string, string>;  // For AskUserQuestion - the user's answers
}

// AskUserQuestion tool types
export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionInput {
  questions: Question[];
}

// Response type for questions
export interface QuestionAnswers {
  answers: Record<string, string>;
}

export interface ToolCallContent {
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  toolUseId: string;
  content: string;
  isError?: boolean;
  stdout?: string;
  stderr?: string;
}

// Hook events from Python script
export interface HookEvent {
  event_type: HookEventType;
  session_id: string;
  cwd: string;
  tty?: string;
  pid?: number;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  title?: string;
  message?: string;
}

export type HookEventType =
  | 'session_start'
  | 'session_end'
  | 'processing'
  | 'running_tool'
  | 'waiting_for_input'
  | 'waiting_for_approval'
  | 'compacting'
  | 'compaction_finished'
  | 'notification'
  | 'ended';

// WebSocket events
// File watcher event types
export interface FileWatcherChange {
  path: string;
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
}

export interface FileWatcherChangedEvent {
  rootPath: string;
  changes: FileWatcherChange[];
}

export interface FileWatcherGitEvent {
  rootPath: string;
}

export interface ServerToClientEvents {
  'session:update': (session: SessionState) => void;
  'session:ended': (sessionId: string) => void;
  'session:created': (sessionId: string, session: SessionState) => void;
  'session:cleanup-prompt': (sessionId: string) => void;
  'permission:request': (sessionId: string, permission: PermissionContext) => void;
  'permission:resolved': (sessionId: string, toolUseId: string) => void;
  'chat:update': (sessionId: string, messages: ChatHistoryItem[]) => void;
  'chat:clear': (sessionId: string) => void;
  'sessions:list': (sessions: SessionState[]) => void;
  'sessions:recent': (sessions: RecentSession[]) => void;
  'prompt:sent': (sessionId: string, success: boolean, error?: string) => void;
  'session:cycleMode:result': (sessionId: string, success: boolean, error?: string) => void;
  'session:modeReset': (sessionId: string) => void;
  'tmux:available': (available: boolean) => void;
  // Terminal events
  'terminal:data': (data: { sessionId: string; data: string }) => void;
  'terminal:exit': (data: { sessionId: string }) => void;
  'terminal:error': (data: { error: string }) => void;
  // File watcher events
  'filewatcher:changed': (event: FileWatcherChangedEvent) => void;
  'filewatcher:git': (event: FileWatcherGitEvent) => void;
}

export interface SessionCreateResult {
  success: boolean;
  sessionId?: string;
  session?: SessionState;
  tmuxName?: string;
  error?: string;
}

export interface SessionDeleteResult {
  success: boolean;
  error?: string;
}

export interface ClientToServerEvents {
  'permission:respond': (sessionId: string, toolUseId: string, decision: PermissionDecision) => void;
  'question:respond': (sessionId: string, toolUseId: string, answers: Record<string, string>) => void;
  'session:subscribe': (sessionId: string) => void;
  'session:unsubscribe': (sessionId: string) => void;
  'session:create': (workingDirectory: string, callback: (result: SessionCreateResult) => void) => void;
  'session:destroy': (sessionId: string, keepTmux: boolean) => void;
  'session:resume': (sessionId: string, cwd: string, callback: (result: SessionResumeResult) => void) => void;
  'session:delete-recent': (sessionId: string, callback: (result: SessionDeleteResult) => void) => void;
  'session:cycleMode': (sessionId: string) => void;
  'sessions:list': () => void;
  'sessions:recent': () => void;
  'prompt:send': (sessionId: string, prompt: string) => void;
  // Terminal events
  'terminal:attach': (sessionId: string) => void;
  'terminal:input': (data: { sessionId: string; data: string }) => void;
  // File watcher events
  'filewatcher:subscribe': (rootPath: string) => void;
  'filewatcher:unsubscribe': (rootPath: string) => void;
}

export type PermissionDecision = 'allow' | 'deny' | 'ask';

// Setup/installation types
export interface SetupStatus {
  installed: boolean;
  hookPath?: string;
  settingsConfigured: boolean;
  errors?: string[];
}

// JSONL message types (from Claude conversation files)
export interface JsonlMessage {
  type: 'user' | 'assistant';
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: JsonlContentBlock[];
    model?: string;
  };
  timestamp?: string;
}

export type JsonlContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'thinking'; thinking: string };

// App configuration
export interface AppConfig {
  maxConcurrentSessions: number;  // Default: 5
  defaultWorkingDirectory?: string;
  claudeCommandPath?: string;     // Custom path to claude command (e.g., /opt/claude/bin/claude)
  passwordHash?: string;
  failedLoginAttempts?: number;   // Number of consecutive failed login attempts
  lockedOut?: boolean;            // True if user is locked out after too many failed attempts
}

// Recent session from database (for resume feature)
export interface RecentSession {
  sessionId: string;
  cwd: string;
  projectName: string;
  conversationPath?: string;
  createdAt: Date;
  lastActivity: Date;
  endedAt?: Date;
  messageCount: number;
  lastUserMessage?: string;
}

// Session resume result
export interface SessionResumeResult {
  success: boolean;
  sessionId?: string;
  session?: SessionState;
  error?: string;
}

// MCP (Model Context Protocol) server configuration
export interface MCPServer {
  type: 'stdio' | 'sse';
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface MCPServersResponse {
  mcpServers: Record<string, MCPServer>;
}

export interface MCPServerWithMeta extends MCPServer {
  name: string;
  isActive?: boolean;
}
