'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SetupStatus, AppConfig } from '@/types';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Download,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Settings2,
  Save,
} from 'lucide-react';

export default function SetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config state
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState(false);
  const [maxSessions, setMaxSessions] = useState(5);
  const [defaultDirectory, setDefaultDirectory] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/setup/status');
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      const data: AppConfig = await res.json();
      setConfig(data);
      setMaxSessions(data.maxConcurrentSessions);
      setDefaultDirectory(data.defaultWorkingDirectory || '');
      setConfigError(null);
    } catch (err) {
      setConfigError(String(err));
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchConfig();
  }, [fetchStatus, fetchConfig]);

  const handleInstall = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/setup/install', { method: 'POST' });
      if (!res.ok) throw new Error('Installation failed');
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUninstall = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/setup/uninstall', { method: 'POST' });
      if (!res.ok) throw new Error('Uninstallation failed');
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setConfigError(null);
    setConfigSuccess(false);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxConcurrentSessions: maxSessions,
          defaultWorkingDirectory: defaultDirectory || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save config');
      }
      const data: AppConfig = await res.json();
      setConfig(data);
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 3000);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfigSaving(false);
    }
  };

  const isFullyInstalled = status?.installed && status?.settingsConfigured;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Setup</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Hook Installation Status</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchStatus}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <CardDescription>
              The hook script integrates Claude Web Monitor with Claude Code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-muted-foreground">Loading status...</div>
            ) : error ? (
              <div className="text-red-500 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span>Hook Script</span>
                    {status?.installed ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Installed
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Not Installed
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Settings Configuration</span>
                    {status?.settingsConfigured ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Not Configured
                      </Badge>
                    )}
                  </div>

                  {status?.hookPath && (
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">Hook location:</span>{' '}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {status.hookPath}
                      </code>
                    </div>
                  )}

                  {status?.errors && status.errors.length > 0 && (
                    <div className="text-sm text-red-500">
                      <span className="font-medium">Errors:</span>
                      <ul className="list-disc list-inside mt-1">
                        {status.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  {!isFullyInstalled ? (
                    <Button
                      onClick={handleInstall}
                      disabled={actionLoading}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      {actionLoading ? 'Installing...' : 'Install Hooks'}
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={handleUninstall}
                      disabled={actionLoading}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      {actionLoading ? 'Uninstalling...' : 'Uninstall Hooks'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Session Settings Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              <CardTitle>Session Settings</CardTitle>
            </div>
            <CardDescription>
              Configure session creation and limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configLoading ? (
              <div className="text-muted-foreground">Loading settings...</div>
            ) : configError && !config ? (
              <div className="text-red-500 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {configError}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="maxSessions" className="text-sm font-medium">
                    Max Concurrent Sessions
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="maxSessions"
                      type="number"
                      min={1}
                      max={20}
                      value={maxSessions}
                      onChange={(e) => setMaxSessions(parseInt(e.target.value) || 1)}
                      className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="text-sm text-muted-foreground">
                      (1-20)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Maximum number of web-managed Claude sessions that can run simultaneously.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="defaultDirectory" className="text-sm font-medium">
                    Default Working Directory
                  </label>
                  <input
                    id="defaultDirectory"
                    type="text"
                    value={defaultDirectory}
                    onChange={(e) => setDefaultDirectory(e.target.value)}
                    placeholder="/home/user/projects (optional)"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Pre-filled directory when creating new sessions. Leave empty for no default.
                  </p>
                </div>

                {configError && (
                  <div className="text-sm text-red-500 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {configError}
                  </div>
                )}

                {configSuccess && (
                  <div className="text-sm text-green-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Settings saved successfully
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    onClick={handleSaveConfig}
                    disabled={configSaving}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {configSaving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Instructions Card */}
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Claude Web Monitor uses Claude Code hooks to receive real-time updates
              about session activity. The installation process:
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                Copies the hook script to{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  ~/.claude/hooks/claude-web-state.py
                </code>
              </li>
              <li>
                Updates{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  ~/.claude/settings.json
                </code>{' '}
                to register the hook for various events
              </li>
              <li>
                When Claude Code runs, it triggers the hook which sends events to this
                web app via a Unix socket
              </li>
            </ol>
            <p>
              After installation, start a new Claude Code session and it should
              appear in the dashboard automatically.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
