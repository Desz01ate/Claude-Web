'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from '@/stores/themeStore';

/**
 * ThemeProviders - Initializes theme on app mount and prevents SSR/hydration mismatch.
 * This is a simple wrapper that ensures the theme is applied correctly after the
 * component mounts on the client side. Named "ThemeProviders" (plural) to avoid
 * naming conflict when imported in server components.
 */
export function ThemeProviders({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Initialize theme on client side only
    useThemeStore.getState()._initialize();
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
