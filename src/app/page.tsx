'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWebSocket } from '@/hooks/useWebSocket';
import { SessionList, useActiveSessionCount } from '@/components/sessions/SessionList';
import { RecentSessionList, useRecentSessionCount } from '@/components/sessions/RecentSessionList';
import { PermissionBanner } from '@/components/permissions/PermissionBanner';
import { CreateSessionModal } from '@/components/sessions/CreateSessionModal';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, RefreshCw, Wifi, WifiOff, Plus } from 'lucide-react';

function DashboardPageContent() {
  const { connected, reconnect, tmuxAvailable } = useWebSocket();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const activeCount = useActiveSessionCount();
  const recentCount = useRecentSessionCount();

  return (
    <div className="min-h-screen">
      {/* Permission Banner */}
      <PermissionBanner />

      {/* Header */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">Claude Web Monitor</h1>
              <Badge variant={connected ? 'success' : 'destructive'} className="gap-1">
                {connected ? (
                  <>
                    <Wifi className="h-3 w-3" />
                    Connected
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3" />
                    Disconnected
                  </>
                )}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                onClick={() => setCreateModalOpen(true)}
                disabled={!connected || !tmuxAvailable}
                title={!tmuxAvailable ? 'tmux is required to create sessions' : undefined}
              >
                <Plus className="h-4 w-4" />
                New Session
              </Button>
              {!connected && (
                <Button variant="outline" size="sm" onClick={reconnect} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Reconnect
                </Button>
              )}
              <Link href="/setup">
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings className="h-4 w-4" />
                  Setup
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Tabs defaultValue="active" className="w-full">
          <TabsList>
            <TabsTrigger value="active">
              Active Sessions {activeCount > 0 && `(${activeCount})`}
            </TabsTrigger>
            <TabsTrigger value="recent">
              Recent Sessions {recentCount > 0 && `(${recentCount})`}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-6">
            <SessionList />
          </TabsContent>
          <TabsContent value="recent" className="mt-6">
            <RecentSessionList />
          </TabsContent>
        </Tabs>
      </main>

      {/* Create Session Modal */}
      <CreateSessionModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardPageContent />
    </AuthGuard>
  );
}
