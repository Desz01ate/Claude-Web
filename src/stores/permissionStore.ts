import { create } from 'zustand';
import type { PermissionContext } from '@/types';

interface PendingPermission {
  sessionId: string;
  permission: PermissionContext;
}

interface PermissionStore {
  pendingPermissions: Map<string, PendingPermission>;

  // Actions
  addPermission: (sessionId: string, permission: PermissionContext) => void;
  removePermission: (sessionId: string, toolUseId: string) => void;
  clearPermissionsForSession: (sessionId: string) => void;

  // Getters
  getPendingPermissions: () => PendingPermission[];
  getPermissionsForSession: (sessionId: string) => PermissionContext[];
  hasPermissions: () => boolean;
  getOldestPermission: () => PendingPermission | undefined;
}

export const usePermissionStore = create<PermissionStore>((set, get) => ({
  pendingPermissions: new Map(),

  addPermission: (sessionId, permission) => {
    set((state) => {
      const newPermissions = new Map(state.pendingPermissions);
      const key = `${sessionId}:${permission.toolUseId}`;
      newPermissions.set(key, { sessionId, permission });
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
      .map((p) => p.permission)
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
