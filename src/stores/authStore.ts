import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const AUTH_TOKEN_KEY = 'auth_token';

interface AuthState {
  isAuthenticated: boolean;
  isAuthRequired: boolean | null; // null = not checked yet
  token: string | null;
  error: string | null;
  setAuthRequired: (required: boolean) => void;
  setToken: (token: string) => void;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      isAuthRequired: null,
      token: null,
      error: null,

      setAuthRequired: (required: boolean) => {
        set({ isAuthRequired: required });
      },

      setToken: (token: string) => {
        sessionStorage.setItem(AUTH_TOKEN_KEY, token);
        set({ token, isAuthenticated: true, error: null });
      },

      login: async (password: string) => {
        set({ error: null });
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });

          if (!res.ok) {
            const data = await res.json();
            set({ error: data.error || 'Login failed' });
            return false;
          }

          const data = await res.json();
          get().setToken(data.token);
          return true;
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Login failed' });
          return false;
        }
      },

      logout: () => {
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
        set({ token: null, isAuthenticated: false });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      // Only persist these fields, but use sessionStorage instead of localStorage
      // We need to handle this differently since persist middleware uses localStorage by default
      partialize: (state) => ({
        isAuthRequired: state.isAuthRequired,
        isAuthenticated: state.isAuthenticated,
      }),
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
        },
      },
    }
  )
);

// Initialize token from sessionStorage on store creation
const storedToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
if (storedToken) {
  useAuthStore.setState({ token: storedToken, isAuthenticated: true });
}
