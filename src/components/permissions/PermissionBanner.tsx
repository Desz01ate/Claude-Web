'use client';

import { usePermissionStore } from '@/stores/permissionStore';
import { ShieldAlert } from 'lucide-react';

export function PermissionBanner() {
  const permissions = usePermissionStore((state) => state.getPendingPermissions());
  const oldest = permissions[0];

  if (!oldest) return null;

  return (
    <div className="bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2">
      <div className="flex items-center gap-3 max-w-7xl mx-auto">
        <ShieldAlert className="h-4 w-4 text-yellow-600 dark:text-yellow-400 animate-pulse" />
        <div className="text-sm">
          <span className="font-medium text-yellow-800 dark:text-yellow-200">
            {permissions.length} permission{permissions.length > 1 ? 's' : ''} pending
          </span>
          <span className="text-yellow-700 dark:text-yellow-300 ml-2">
            - Review in chat below
          </span>
        </div>
      </div>
    </div>
  );
}
