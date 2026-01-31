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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useMCPStore, useServerList } from '@/stores/mcpStore';
import type { MCPServer } from '@/types';
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  Save,
} from 'lucide-react';

interface ServerFormData {
  name: string;
  type: 'stdio' | 'sse';
  command: string;
  args: string;
  env: string;
}

function parseArgs(argsString: string): string[] {
  if (!argsString.trim()) return [];
  return argsString.split('\n').filter(arg => arg.trim() !== '');
}

function parseEnv(envString: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!envString.trim()) return env;

  for (const line of envString.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key) {
        env[key] = value;
      }
    }
  }
  return env;
}

function formatEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function MCPPageContent() {
  const servers = useServerList();
  const { fetchServers, addServer, updateServer, deleteServer, testServer, loading, error, testResult, clearError, clearTestResult } = useMCPStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editServer, setEditServer] = useState<string | null>(null);
  const [formData, setFormData] = useState<ServerFormData>({
    name: '',
    type: 'stdio',
    command: '',
    args: '',
    env: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [testingServer, setTestingServer] = useState<string | null>(null);

  const fetchServersCallback = useCallback(() => {
    fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    fetchServersCallback();
  }, [fetchServersCallback]);

  const handleOpenAddDialog = () => {
    setEditServer(null);
    setFormData({
      name: '',
      type: 'stdio',
      command: '',
      args: '',
      env: '',
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (server: { name: string } & MCPServer) => {
    setEditServer(server.name);
    setFormData({
      name: server.name,
      type: server.type,
      command: server.command,
      args: server.args.join('\n'),
      env: formatEnv(server.env),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditServer(null);
    setFormData({
      name: '',
      type: 'stdio',
      command: '',
      args: '',
      env: '',
    });
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);

    // Validate form
    if (!formData.name.trim()) {
      setFormError('Server name is required');
      return;
    }

    if (!formData.command.trim()) {
      setFormError('Command is required');
      return;
    }

    const serverConfig: MCPServer = {
      type: formData.type,
      command: formData.command,
      args: parseArgs(formData.args),
      env: parseEnv(formData.env),
    };

    try {
      if (editServer) {
        await updateServer(editServer, serverConfig);
      } else {
        await addServer(formData.name, serverConfig);
      }
      handleCloseDialog();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete the MCP server "${name}"?`)) {
      return;
    }

    try {
      await deleteServer(name);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTest = async (name: string) => {
    clearTestResult();
    setTestingServer(name);
    await testServer(name);
    setTestingServer(null);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/setup">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Setup
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold">MCP Servers</h1>
                <p className="text-sm text-muted-foreground">
                  Manage Model Context Protocol servers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchServersCallback}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={handleOpenAddDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Server
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Error Banner */}
        {error && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <span>{error}</span>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={clearError}>
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Result Banner */}
        {testResult && (
          <Card className={testResult.success ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-red-500 bg-red-50 dark:bg-red-950/20'}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                {testResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-medium">
                    {testResult.success ? 'Test Successful' : 'Test Failed'} - {testResult.name}
                  </div>
                  {testResult.output && (
                    <div className="text-sm mt-1 text-green-700 dark:text-green-300">
                      {testResult.output}
                    </div>
                  )}
                  {testResult.error && (
                    <div className="text-sm mt-1 text-red-700 dark:text-red-300">
                      {testResult.error}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={clearTestResult}>
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Servers List */}
        {loading && servers.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">Loading servers...</div>
            </CardContent>
          </Card>
        ) : servers.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No MCP Servers Configured</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add your first Model Context Protocol server to extend Claude capabilities.
                </p>
                <Button onClick={handleOpenAddDialog} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Server
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {servers.map((server) => (
              <Card key={server.name}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {server.name}
                        <Badge variant="secondary">{server.type}</Badge>
                      </CardTitle>
                      <CardDescription className="mt-1 font-mono text-xs">
                        {server.command} {server.args.join(' ')}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(server.name)}
                        disabled={testingServer === server.name}
                        className="gap-1"
                      >
                        <Play className="h-3 w-3" />
                        {testingServer === server.name ? 'Testing...' : 'Test'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditDialog(server)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(server.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {server.env && Object.keys(server.env).length > 0 && (
                  <CardContent>
                    <div className="text-sm">
                      <span className="font-medium">Environment variables:</span>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {Object.entries(server.env).map(([key]) => (
                          <Badge key={key} variant="outline" className="mr-1 mb-1">
                            {key}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>About MCP Servers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Model Context Protocol (MCP) servers extend Claude capabilities by providing
              additional tools and resources. These servers run as separate processes and
              communicate via stdio.
            </p>
            <p>
              Common MCP servers include file system access, database connections,
              web browsing, and custom tool integrations.
            </p>
            <p>
              After adding a server here, it will be available to Claude Code sessions.
              Use the <strong>Test</strong> button to verify the server configuration
              before using it.
            </p>
          </CardContent>
        </Card>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editServer ? 'Edit MCP Server' : 'Add MCP Server'}</DialogTitle>
            <DialogDescription>
              Configure a Model Context Protocol server for Claude.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Server Name */}
            <div className="space-y-2">
              <label htmlFor="serverName" className="text-sm font-medium">
                Server Name
              </label>
              <input
                id="serverName"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={!!editServer}
                placeholder="my-mcp-server"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Alphanumeric, hyphens, and underscores only. Cannot be changed after creation.
              </p>
            </div>

            {/* Type */}
            <div className="space-y-2">
              <label htmlFor="serverType" className="text-sm font-medium">
                Type
              </label>
              <select
                id="serverType"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'stdio' | 'sse' })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="stdio">stdio (Standard Input/Output)</option>
                <option value="sse">sse (Server-Sent Events)</option>
              </select>
            </div>

            {/* Command */}
            <div className="space-y-2">
              <label htmlFor="serverCommand" className="text-sm font-medium">
                Command
              </label>
              <input
                id="serverCommand"
                type="text"
                value={formData.command}
                onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                placeholder="npx or node or /usr/bin/python3"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">
                The executable command to start the MCP server.
              </p>
            </div>

            {/* Args */}
            <div className="space-y-2">
              <label htmlFor="serverArgs" className="text-sm font-medium">
                Arguments
              </label>
              <textarea
                id="serverArgs"
                value={formData.args}
                onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                placeholder="One argument per line"
                rows={4}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Enter one argument per line. Example: <code>@anthropic-ai/mcp-server</code>
              </p>
            </div>

            {/* Environment Variables */}
            <div className="space-y-2">
              <label htmlFor="serverEnv" className="text-sm font-medium">
                Environment Variables
              </label>
              <textarea
                id="serverEnv"
                value={formData.env}
                onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                placeholder="API_KEY=your-key-here&#10;DEBUG=true"
                rows={4}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Enter as KEY=value pairs, one per line. Lines starting with # are ignored.
              </p>
            </div>

            {/* Form Error */}
            {formError && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertTriangle className="h-4 w-4" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
              {editServer ? 'Update' : 'Add'} Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MCPPage() {
  return (
    <AuthGuard>
      <MCPPageContent />
    </AuthGuard>
  );
}
