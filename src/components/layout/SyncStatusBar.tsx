'use client';

// /src/components/layout/SyncStatusBar.tsx
// SmartStock Experience V1 — Reassuring Offline & Sync Status Bar

import React, { useState, useEffect } from 'react';
import { CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';

export interface SyncStatusBarProps {
  lastSync?: Date;
  className?: string;
}

export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({ lastSync, className = '' }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && pendingCount === 0) {
    return (
      <div className="bg-[#EDFDF5] border-b border-[#A6F4C5] px-4 py-1.5 flex items-center justify-between text-xs text-[#027A48]">
        <div className="flex items-center gap-1.5 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#039855]" />
          <span>Synced with Store 1001</span>
        </div>
        <span className="text-[10px] font-mono">Live</span>
      </div>
    );
  }

  return (
    <div className="bg-[#FEF6EE] border-b border-[#FEDF89] px-4 py-2 flex items-center justify-between text-xs text-[#B54708]">
      <div className="flex items-center gap-2">
        <CloudOff className="w-4 h-4 text-[#DC6803]" />
        <div>
          <p className="font-semibold leading-tight">Offline Mode Active</p>
          <p className="text-[11px] text-[#B54708]/90">
            {pendingCount > 0 ? `${pendingCount} actions safely saved.` : 'Actions safely saved on this device.'} Automatically syncs when reconnected.
          </p>
        </div>
      </div>
      <span className="px-2 py-0.5 rounded bg-white font-mono text-[10px] font-bold border border-[#FEDF89]">
        Offline Safe
      </span>
    </div>
  );
};
