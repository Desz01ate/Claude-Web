'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, AlertCircle, ShieldX } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLockedOut, setLockedOut, error, clearError } = useAuthStore();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Check locked status on mount
  useEffect(() => {
    const checkLockStatus = async () => {
      try {
        const res = await fetch('/api/auth/status');
        if (res.ok) {
          const data = await res.json();
          setLockedOut(data.lockedOut ?? false);
        }
      } catch (err) {
        console.error('Failed to check lock status:', err);
      }
    };
    checkLockStatus();
  }, [setLockedOut]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!password.trim()) {
      setLocalError('Please enter a password');
      return;
    }

    setIsLoading(true);
    const success = await login(password);
    setIsLoading(false);

    if (success) {
      router.push('/');
    }
    // If not successful, error is already set in the store
  };

  // Show locked out state
  if (isLockedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <ShieldX className="h-6 w-6 text-red-500" />
            </div>
            <CardTitle className="text-red-500">Account Locked</CardTitle>
            <CardDescription>
              Too many failed login attempts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-3">
              <p>
                This account has been locked after 3 failed login attempts.
              </p>
              <p>
                To unlock, manually edit <code className="bg-muted px-1 py-0.5 rounded text-xs">~/.claude-web/config.json</code> and remove the <code className="bg-muted px-1 py-0.5 rounded text-xs">&quot;lockedOut&quot;: true</code> line.
              </p>
              <p className="text-xs text-muted-foreground/70">
                After removing the lockout flag, refresh this page to try again.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Claude Web Monitor</CardTitle>
          <CardDescription>Enter your password to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoFocus
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Enter password"
              />
            </div>

            {(error || localError) && (
              <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                <AlertCircle className="h-4 w-4" />
                <span>{error || localError}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
