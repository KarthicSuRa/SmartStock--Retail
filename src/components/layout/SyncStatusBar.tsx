// /src/components/layout/SyncStatusBar.tsx

import React from 'react';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { CloudOff, CloudCheck, RefreshCw } from 'lucide-react';

export function SyncStatusBar({ lastSync }: { lastSync: Date }) {
  const { pendingCount, isSyncing } = useOfflineQueue();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isOnline) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 text-xs font-medium">
        <CloudOff className="w-3 h-3" />
        Offline mode — {pendingCount} actions queued
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-100 text-blue-800 text-xs font-medium">
        <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
        Syncing {pendingCount} items...
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1 bg-green-100 text-green-800 text-xs font-medium">
      <CloudCheck className="w-3 h-3" />
      Live • synced {Math.floor((Date.now() - (lastSync?.getTime() || Date.now())) / 1000)}s ago
    </div>
  );
}
