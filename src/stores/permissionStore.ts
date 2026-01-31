import { create } from 'zustand';
import type { PermissionContext } from '@/types';

interface PendingPermission {
  sessionId: string;
  permission: PermissionContext;
  status: 'pending' | 'answered';
  answers?: Record<string, string>;  // For AskUserQuestion
}

interface PermissionStore {
  pendingPermissions: Map<string, PendingPermission>;

  // Actions
  addPermission: (sessionId: string, permission: PermissionContext) => void;
  removePermission: (sessionId: string, toolUseId: string) => void;
  markAnswered: (sessionId: string, toolUseId: string, answers: Record<string, string>) => void;
  clearPermissionsForSession: (sessionId: string) => void;

  // Getters
  getPendingPermissions: () => PendingPermission[];
  getPermissionsForSession: (sessionId: string) => (PermissionContext & { status: 'pending' | 'answered'; answers?: Record<string, string> })[];
  hasPermissions: () => boolean;
  getOldestPermission: () => PendingPermission | undefined;
}

export const usePermissionStore = create<PermissionStore>((set, get) => ({
  pendingPermissions: new Map(),

  addPermission: (sessionId, permission) => {
    set((state) => {
      const newPermissions = new Map(state.pendingPermissions);
      const key = `${sessionId}:${permission.toolUseId}`;
      newPermissions.set(key, { sessionId, permission, status: 'pending' });
      return { pendingPermissions: newPermissions };
    });
  },

  removePermission: (sessionId, toolUseId) => {
    set((state) => {
      const newPermissions = new Map(state.pendingPermissions);
      const key = `${sessionId}:${toolUseId}`;
      newPermissions.delete(key);
      return { pendingPermissions: newPermissions };
    });
  },

  markAnswered: (sessionId, toolUseId, answers) => {
    set((state) => {
      const newPermissions = new Map(state.pendingPermissions);
      const key = `${sessionId}:${toolUseId}`;
      const existing = newPermissions.get(key);
      if (existing) {
        newPermissions.set(key, { ...existing, status: 'answered', answers });
      }
      return { pendingPermissions: newPermissions };
    });
  },

  clearPermissionsForSession: (sessionId) => {
    set((state) => {
      const newPermissions = new Map(state.pendingPermissions);
      for (const [key] of newPermissions) {
        if (key.startsWith(`${sessionId}:`)) {
          newPermissions.delete(key);
        }
      }
      return { pendingPermissions: newPermissions };
    });
  },

  getPendingPermissions: () => {
    return Array.from(get().pendingPermissions.values()).sort(
      (a, b) =>
        new Date(a.permission.receivedAt).getTime() -
        new Date(b.permission.receivedAt).getTime()
    );
  },

  getPermissionsForSession: (sessionId) => {
    return Array.from(get().pendingPermissions.values())
      .filter((p) => p.sessionId === sessionId)
      .map((p) => ({ ...p.permission, status: p.status, answers: p.answers }))
      .sort(
        (a, b) =>
          new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
      );
  },

  hasPermissions: () => {
    return get().pendingPermissions.size > 0;
  },

  getOldestPermission: () => {
    const permissions = get().getPendingPermissions();
    return permissions[0];
  },
}));
