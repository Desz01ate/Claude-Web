import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeStore {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  _initialize: () => void;
}

// Helper to get the resolved theme (actual theme after system detection)
const getResolvedTheme = (theme: ThemeMode): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
};

// Apply the dark class to the document element
const applyTheme = (theme: ThemeMode) => {
  if (typeof window === 'undefined') return;
  const resolved = getResolvedTheme(theme);
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
};

// Listen for system theme changes when in 'system' mode
const setupSystemThemeListener = () => {
  if (typeof window === 'undefined') return;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    const store = useThemeStore.getState();
    if (store.theme === 'system') {
      applyTheme('system');
    }
  };
  mediaQuery.addEventListener('change', handleSystemThemeChange);
};

let initialized = false;

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      _initialize: () => {
        if (initialized || typeof window === 'undefined') return;
        initialized = true;
        // Apply the initial theme from storage
        applyTheme(get().theme);
        // Set up system theme listener
        setupSystemThemeListener();
      },
    }),
    { name: 'claude-web-theme' }
  )
);
