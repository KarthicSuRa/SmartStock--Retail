'use client';

// /src/app/(dashboard)/layout.tsx
// SmartStock Experience V1 — Mobile Floor PWA Layout

import React from 'react';
import { SyncStatusBar } from '@/components/layout/SyncStatusBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { ToastProvider } from '@/hooks/useToast';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex flex-col min-h-screen bg-[#F7F8FA] text-[#101828] font-sans antialiased pb-20 select-none">
        {/* Sync Status Header */}
        <SyncStatusBar />

        {/* Dynamic Floor Content */}
        <main className="flex-1 p-4 max-w-md mx-auto w-full">{children}</main>

        {/* Persistent Bottom Nav (Tasks, Scan, Search) */}
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
