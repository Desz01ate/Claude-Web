'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSession } from '@/hooks/useSession';
import { CodeBrowserLayout } from '@/components/code';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCodeBrowserStore } from '@/stores/codeBrowserStore';
import { ArrowLeft, Code, Globe, ExternalLink, Loader2 } from 'lucide-react';

function CodeBrowserPageContent() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  useWebSocket();
  const { session, sessionsLoaded } = useSession(sessionId);
  const { clearCache } = useCodeBrowserStore();

  // Clear cache when session changes
  useEffect(() => {
    clearCache();
  }, [sessionId, clearCache]);

  // Show loading state while sessions haven't been loaded yet
  if (!sessionsLoaded) {
    return (
      <div className="min-h-screen">
        <header className="border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href={`/sessions/${sessionId}`}>
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Session
              </Button>
            </Link>
          </div>
        </header>
        <main className="flex items-center justify-center h-[calc(100vh-80px)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen">
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

  if (!session.cwd) {
    return (
      <div className="min-h-screen">
        <header className="border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href={`/sessions/${sessionId}`}>
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Session
              </Button>
            </Link>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p>This session does not have a working directory.</p>
            <Button className="mt-4" onClick={() => router.push(`/sessions/${sessionId}`)}>
              Return to Session
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b shrink-0">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/sessions/${sessionId}`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Code className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-lg font-semibold">{session.projectName}</h1>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">Code Browser</span>
              </div>
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
            <div className="text-xs text-muted-foreground font-mono truncate max-w-md">
              {session.cwd}
            </div>
          </div>
        </div>
      </header>

      {/* Code Browser */}
      <main className="flex-1 min-h-0">
        <CodeBrowserLayout rootPath={session.cwd} projectName={session.projectName} />
      </main>
    </div>
  );
}

export default function CodeBrowserPage() {
  return (
    <AuthGuard>
      <CodeBrowserPageContent />
    </AuthGuard>
  );
}
