'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { isAuthRequired, isAuthenticated, setAuthRequired, setLockedOut } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [statusChecked, setStatusChecked] = useState(false);

  useEffect(() => {
    // Check auth status on mount
    const checkAuthStatus = async () => {
      try {
        const res = await fetch('/api/auth/status');
        if (res.ok) {
          const data = await res.json();
          setAuthRequired(data.enabled);
          setLockedOut(data.lockedOut ?? false);
        }
      } catch (err) {
        console.error('Failed to check auth status:', err);
      } finally {
        setStatusChecked(true);
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, [setAuthRequired, setLockedOut]);

  useEffect(() => {
    // Redirect to login if auth is required and user is not authenticated
    if (statusChecked && isAuthRequired === true && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthRequired, isAuthenticated, statusChecked, router]);

  // Show loading while checking auth status
  if (isLoading || isAuthRequired === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // If auth is required but not authenticated, don't render children (will redirect)
  if (isAuthRequired && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  // Auth not required or user is authenticated - render children
  return <>{children}</>;
}
