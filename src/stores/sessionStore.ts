import { create } from 'zustand';
import type { SessionState, ChatHistoryItem, RecentSession } from '@/types';

// Claude Code modes cycle: none -> acceptEdits -> planMode -> none
export type ClaudeMode = 'none' | 'acceptEdits' | 'planMode';

interface SessionStore {
  sessions: Map<string, SessionState>;
  activeSessionId: string | null;
  chatHistory: Map<string, ChatHistoryItem[]>;
  cleanupQueue: string[]; // Session IDs waiting for cleanup decision
  recentSessions: RecentSession[];
  sessionsLoaded: boolean; // Whether initial sessions list has been received
  pendingResumeSessions: Set<string>; // Session IDs being resumed, waiting to appear
  sessionModes: Map<string, ClaudeMode>; // Track Claude mode per session

  // Actions
  setSessions: (sessions: SessionState[]) => void;
  updateSession: (session: SessionState) => void;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  updateChatHistory: (sessionId: string, messages: ChatHistoryItem[]) => void;
  addChatMessage: (sessionId: string, message: ChatHistoryItem) => void;
  clearChatHistory: (sessionId: string) => void;
  addToCleanupQueue: (sessionId: string) => void;
  removeFromCleanupQueue: (sessionId: string) => void;
  setRecentSessions: (sessions: RecentSession[]) => void;
  removeRecentSession: (sessionId: string) => void;
  resetSessionsLoaded: () => void;
  addPendingResumeSession: (sessionId: string) => void;
  removePendingResumeSession: (sessionId: string) => void;
  isPendingResume: (sessionId: string) => boolean;
  setSessionMode: (sessionId: string, mode: ClaudeMode) => void;
  cycleSessionMode: (sessionId: string) => void;

  // Getters
  getSession: (sessionId: string) => SessionState | undefined;
  getAllSessions: () => SessionState[];
  getActiveSession: () => SessionState | undefined;
  getChatHistory: (sessionId: string) => ChatHistoryItem[];
  getRecentSessions: () => RecentSession[];
  isSessionsLoaded: () => boolean;
  getSessionMode: (sessionId: string) => ClaudeMode;
}

// Helper to get next mode in cycle
const getNextMode = (mode: ClaudeMode): ClaudeMode => {
  switch (mode) {
    case 'none': return 'acceptEdits';
    case 'acceptEdits': return 'planMode';
    case 'planMode': return 'none';
  }
};

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,
  chatHistory: new Map(),
  cleanupQueue: [],
  recentSessions: [],
  sessionsLoaded: false,
  pendingResumeSessions: new Set(),
  sessionModes: new Map(),

  setSessions: (sessions) => {
    const map = new Map<string, SessionState>();
    sessions.forEach((s) => map.set(s.sessionId, s));
    set({ sessions: map, sessionsLoaded: true });
  },

  updateSession: (session) => {
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.set(session.sessionId, session);
      // Remove from pending resume if it was there
      const newPending = new Set(state.pendingResumeSessions);
      newPending.delete(session.sessionId);
      return { sessions: newSessions, pendingResumeSessions: newPending };
    });
  },

  removeSession: (sessionId) => {
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(sessionId);
      const newChatHistory = new Map(state.chatHistory);
      newChatHistory.delete(sessionId);
      const newSessionModes = new Map(state.sessionModes);
      newSessionModes.delete(sessionId);
      return {
        sessions: newSessions,
        chatHistory: newChatHistory,
        sessionModes: newSessionModes,
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId,
      };
    });
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  updateChatHistory: (sessionId, messages) => {
    set((state) => {
      const newChatHistory = new Map(state.chatHistory);
      const existing = newChatHistory.get(sessionId) || [];

      // Find optimistic messages that haven't been confirmed by server yet
      const optimisticMessages = existing.filter((msg) =>
        typeof msg.id === 'string' && msg.id.startsWith('optimistic-')
      );

      // Check which optimistic messages are not yet in the server response
      // by comparing content of user messages
      const serverUserMessages = messages
        .filter((msg) => msg.type === 'user')
        .map((msg) => msg.content);

      const unconfirmedOptimistic = optimisticMessages.filter(
        (msg) => !serverUserMessages.includes(msg.content)
      );

      // Append unconfirmed optimistic messages to server messages
      const finalMessages = unconfirmedOptimistic.length > 0
        ? [...messages, ...unconfirmedOptimistic]
        : messages;

      newChatHistory.set(sessionId, finalMessages);
      return { chatHistory: newChatHistory };
    });
  },

  addChatMessage: (sessionId, message) => {
    set((state) => {
      const newChatHistory = new Map(state.chatHistory);
      const existing = newChatHistory.get(sessionId) || [];
      newChatHistory.set(sessionId, [...existing, message]);
      return { chatHistory: newChatHistory };
    });
  },

  clearChatHistory: (sessionId) => {
    set((state) => {
      const newChatHistory = new Map(state.chatHistory);
      newChatHistory.set(sessionId, []);
      return { chatHistory: newChatHistory };
    });
  },

  addToCleanupQueue: (sessionId) => {
    set((state) => {
      if (state.cleanupQueue.includes(sessionId)) {
        return state;
      }
      return { cleanupQueue: [...state.cleanupQueue, sessionId] };
    });
  },

  removeFromCleanupQueue: (sessionId) => {
    set((state) => ({
      cleanupQueue: state.cleanupQueue.filter((id) => id !== sessionId),
    }));
  },

  setRecentSessions: (sessions) => {
    set({ recentSessions: sessions });
  },

  removeRecentSession: (sessionId) => {
    set((state) => ({
      recentSessions: state.recentSessions.filter((s) => s.sessionId !== sessionId),
    }));
  },

  resetSessionsLoaded: () => {
    set({ sessionsLoaded: false });
  },

  addPendingResumeSession: (sessionId) => {
    set((state) => {
      const newPending = new Set(state.pendingResumeSessions);
      newPending.add(sessionId);
      return { pendingResumeSessions: newPending };
    });
  },

  removePendingResumeSession: (sessionId) => {
    set((state) => {
      const newPending = new Set(state.pendingResumeSessions);
      newPending.delete(sessionId);
      return { pendingResumeSessions: newPending };
    });
  },

  isPendingResume: (sessionId) => {
    return get().pendingResumeSessions.has(sessionId);
  },

  setSessionMode: (sessionId, mode) => {
    set((state) => {
      const newSessionModes = new Map(state.sessionModes);
      newSessionModes.set(sessionId, mode);
      return { sessionModes: newSessionModes };
    });
  },

  cycleSessionMode: (sessionId) => {
    set((state) => {
      const newSessionModes = new Map(state.sessionModes);
      const currentMode = newSessionModes.get(sessionId) || 'none';
      newSessionModes.set(sessionId, getNextMode(currentMode));
      return { sessionModes: newSessionModes };
    });
  },

  getSession: (sessionId) => {
    return get().sessions.get(sessionId);
  },

  getAllSessions: () => {
    return Array.from(get().sessions.values());
  },

  getActiveSession: () => {
    const { activeSessionId, sessions } = get();
    if (!activeSessionId) return undefined;
    return sessions.get(activeSessionId);
  },

  getChatHistory: (sessionId) => {
    return get().chatHistory.get(sessionId) || [];
  },

  getRecentSessions: () => {
    return get().recentSessions;
  },

  isSessionsLoaded: () => {
    return get().sessionsLoaded;
  },

  getSessionMode: (sessionId) => {
    return get().sessionModes.get(sessionId) || 'none';
  },
}));
