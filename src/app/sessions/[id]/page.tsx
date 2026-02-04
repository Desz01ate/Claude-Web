'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSession } from '@/hooks/useSession';
import { ChatView } from '@/components/chat/ChatView';
import { PromptInput } from '@/components/chat/PromptInput';
import { PhaseIndicator } from '@/components/sessions/PhaseIndicator';
import { PermissionBanner } from '@/components/permissions/PermissionBanner';
import { SessionCleanupModal } from '@/components/sessions/SessionCleanupModal';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FolderOpen, Terminal, Globe, ExternalLink, AlertCircle, Square, ToggleRight, Trash2, Minimize2, Code } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useSessionStore, type ClaudeMode } from '@/stores/sessionStore';
import { destroySession, cycleSessionMode as emitCycleMode, getSocket, sendPrompt } from '@/lib/socket';

const MODE_LABELS: Record<ClaudeMode, string> = {
  none: 'Default',
  acceptEdits: 'Accept Edits',
  planMode: 'Plan Mode',
};
const MODE_COLORS: Record<ClaudeMode, string> = {
  none: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  acceptEdits: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  planMode: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
};

function SessionDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  useWebSocket();
  const { session, chatHistory, sessionsLoaded, isPendingResume } = useSession(sessionId);
  const {
    cleanupQueue,
    removeFromCleanupQueue,
    removePendingResumeSession,
    getSessionMode,
    cycleSessionMode: cycleStoredMode,
  } = useSessionStore();

  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isCyclingMode, setIsCyclingMode] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);

  // Get current mode from store
  const currentMode = getSessionMode(sessionId);

  // Handle mode cycling button click
  const handleCycleMode = useCallback(() => {
    if (!session?.sessionId || isCyclingMode) return;
    setIsCyclingMode(true);
    emitCycleMode(session.sessionId);
  }, [session?.sessionId, isCyclingMode]);

  // Listen for mode cycle result
  useEffect(() => {
    const socket = getSocket();

    const handleCycleModeResult = (resultSessionId: string, success: boolean, error?: string) => {
      if (resultSessionId !== sessionId) return;

      setIsCyclingMode(false);
      if (success) {
        cycleStoredMode(sessionId);
      } else {
        console.error('Mode cycle failed:', error);
      }
    };

    socket.on('session:cycleMode:result', handleCycleModeResult);
    return () => {
      socket.off('session:cycleMode:result', handleCycleModeResult);
    };
  }, [sessionId, cycleStoredMode]);

  // Keyboard shortcut: Shift+Tab to cycle mode (matching Claude Code behavior)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger for managed sessions that aren't ended
      if (!session?.isManaged || session.phase.type === 'ended') return;

      // Check for Shift+Tab
      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        handleCycleMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session?.isManaged, session?.phase.type, handleCycleMode]);

  // Timeout for pending resume - if session doesn't appear within 30s, clear pending state
  useEffect(() => {
    if (isPendingResume && !session) {
      const timeout = setTimeout(() => {
        removePendingResumeSession(sessionId);
      }, 30000);
      return () => clearTimeout(timeout);
    }
  }, [isPendingResume, session, sessionId, removePendingResumeSession]);

  const handleEndSession = () => {
    if (!session?.isManaged) return;
    if (!confirm('Are you sure you want to end this session? The tmux session will be terminated.')) {
      return;
    }
    setIsEnding(true);
    destroySession(sessionId, false);
    router.push('/');
  };

  const handleClear = () => {
    if (!session?.isManaged || session.phase.type === 'ended') return;
    setIsClearing(true);
    sendPrompt(sessionId, '/clear');
    // Reset after a short delay since there's no explicit confirmation
    setTimeout(() => setIsClearing(false), 1000);
  };

  const handleCompact = () => {
    if (!session?.isManaged || session.phase.type === 'ended') return;
    setIsCompacting(true);
    sendPrompt(sessionId, '/compact');
    // Reset after a short delay since there's no explicit confirmation
    setTimeout(() => setIsCompacting(false), 1000);
  };

  // Show cleanup modal when this session is in the cleanup queue
  useEffect(() => {
    if (cleanupQueue.includes(sessionId)) {
      setCleanupModalOpen(true);
    }
  }, [cleanupQueue, sessionId]);

  const handleCleanupModalClose = (open: boolean) => {
    setCleanupModalOpen(open);
    if (!open) {
      removeFromCleanupQueue(sessionId);
    }
  };

  // Show loading state while sessions haven't been loaded yet or session is pending resume
  if (!sessionsLoaded || (!session && isPendingResume)) {
    return (
      <div className="min-h-screen">
        <PermissionBanner />
        <header className="border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href="/">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p>{isPendingResume ? 'Starting session...' : 'Loading session...'}</p>
          </div>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen">
        <PermissionBanner />
        <header className="border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href="/">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p>Session not found or has ended.</p>
            <Button className="mt-4" onClick={() => router.push('/')}>
              Return to Dashboard
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <PermissionBanner />

      {/* Header */}
      <header className="border-b shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
              <h1 className="text-xl font-bold">{session.projectName}</h1>
              {session.isManaged ? (
                <Badge variant="default" className="gap-1">
                  <Globe className="h-3 w-3" />
                  Web Session
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <ExternalLink className="h-3 w-3" />
                  External
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r p-4 shrink-0 overflow-y-auto">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Session Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PhaseIndicator phase={session.phase} />

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Directory:</span>
                </div>
                <p className="text-sm font-mono break-all">{session.cwd}</p>
              </div>

              {session.pid && (
                <div className="flex items-center gap-2 text-sm">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">PID:</span>
                  <span className="font-mono">{session.pid}</span>
                </div>
              )}

              {session.tty && (
                <div className="flex items-center gap-2 text-sm">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">TTY:</span>
                  <span className="font-mono text-xs">{session.tty}</span>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Session ID: {session.sessionId.slice(0, 8)}...
              </div>

              {session.isManaged && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleEndSession}
                  disabled={isEnding}
                  className="w-full gap-1 mt-2"
                >
                  <Square className="h-3 w-3 fill-current" />
                  {isEnding ? 'Ending...' : 'End Session'}
                </Button>
              )}
            </CardContent>
          </Card>

          {session.isManaged && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Context Management</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Mode Display */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Mode:</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODE_COLORS[currentMode]}`}>
                      {MODE_LABELS[currentMode]}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCycleMode}
                    disabled={session.phase.type === 'ended' || isCyclingMode}
                    className="w-full gap-1"
                  >
                    <ToggleRight className={`h-3 w-3 ${isCyclingMode ? 'animate-spin' : ''}`} />
                    {isCyclingMode ? 'Switching...' : 'Cycle Mode (Shift+Tab)'}
                  </Button>
                </div>

                <div className="space-y-2">
                  {/* Disabled because /clear is effectively ended current session, which doesn't make sense in this context. Better start a new session instead */}
                  {/* <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClear}
                    disabled={session.phase.type === 'ended' || isClearing}
                    className="w-full gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    {isClearing ? 'Clearing...' : 'Clear'}
                  </Button> */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCompact}
                    disabled={session.phase.type === 'ended' || isCompacting}
                    className="w-full gap-1"
                  >
                    <Minimize2 className="h-3 w-3" />
                    {isCompacting ? 'Compacting...' : 'Compact'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/sessions/${session.sessionId}/code`)}
                    className="w-full gap-1"
                  >
                    <Code className="h-3 w-3" />
                    Browse Code
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </aside>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ChatView messages={chatHistory} sessionId={session.sessionId} />
          </div>

          {/* Show warning for external sessions */}
          {!session.canSendPrompts && (
            <div className="border-t bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">
                  This is an external session. Prompts can only be sent to sessions created via the web UI.
                </span>
              </div>
            </div>
          )}

          <PromptInput
            sessionId={session.sessionId}
            disabled={
              !session.canSendPrompts ||
              session.phase.type === 'processing' ||
              session.phase.type === 'waitingForApproval' ||
              session.phase.type === 'compacting' ||
              session.phase.type === 'ended'
            }
          />
        </div>
      </main>

      {/* Session Cleanup Modal */}
      {session.isManaged && (
        <SessionCleanupModal
          open={cleanupModalOpen}
          onOpenChange={handleCleanupModalClose}
          sessionId={session.sessionId}
          tmuxSessionName={session.tmuxSessionName}
        />
      )}
    </div>
  );
}

export default function SessionDetailPage() {
  return (
    <AuthGuard>
      <SessionDetailPageContent />
    </AuthGuard>
  );
}
