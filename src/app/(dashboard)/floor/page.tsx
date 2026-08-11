// /src/app/(dashboard)/floor/page.tsx

'use client';

import React from 'react';
import { useRealtimeInventory } from '@/hooks/useRealtimeInventory';
import { useStoreContext } from '@/hooks/useStoreContext';
import { StockCard } from '@/components/inventory/StockCard';
import { BottomNav } from '@/components/layout/BottomNav';
import { SyncStatusBar } from '@/components/layout/SyncStatusBar';
import { ScanBarcode, ClipboardCheck, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';

export default function FloorHomePage() {
  const { activeStoreId } = useStoreContext();
  const { items, loading, lastUpdate } = useRealtimeInventory({
    status: ['CRITICAL_RISK', 'REPLENISHMENT_NEEDED', 'EXPIRY_RISK'],
  });

  const criticalCount = items.filter((i) => i.stock_status === 'CRITICAL_RISK').length;
  const expiryCount = items.filter((i) => i.stock_status === 'EXPIRY_RISK').length;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <SyncStatusBar lastSync={lastUpdate} />
      
      {/* Header */}
      <header className="px-4 pt-4 pb-2 bg-white border-b">
        <h1 className="text-lg font-bold text-slate-900">Store Floor Operations</h1>
        <p className="text-sm text-slate-500">Store {activeStoreId} • {items.length} items need attention</p>
      </header>

      {/* Quick Actions — Thumb Zone */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-white border-b">
        <Link href="/floor/scan" className="w-full">
          <div className="w-full h-20 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/50">
            <ScanBarcode className="w-6 h-6 text-blue-600" />
            <span className="text-xs font-medium text-slate-900">Scan</span>
          </div>
        </Link>
        <Link href="/floor/count" className="w-full">
          <div className="w-full h-20 flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 hover:border-slate-300 bg-white">
            <ClipboardCheck className="w-6 h-6 text-slate-600" />
            <span className="text-xs font-medium text-slate-900">Count</span>
          </div>
        </Link>
        <Link href="/floor/damage" className="w-full">
          <div className="w-full h-20 flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 hover:border-slate-300 bg-white">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <span className="text-xs font-medium text-slate-900">Damage</span>
          </div>
        </Link>
      </div>

      {/* Alert Summary Chips */}
      {(criticalCount > 0 || expiryCount > 0) && (
        <div className="flex gap-2 px-3 py-2 overflow-x-auto bg-slate-100/50">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-800 rounded-full text-xs font-semibold whitespace-nowrap">
              <AlertTriangle className="w-4 h-4" />
              {criticalCount} Critical
            </div>
          )}
          {expiryCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold whitespace-nowrap">
              <Clock className="w-4 h-4" />
              {expiryCount} Expiring
            </div>
          )}
        </div>
      )}

      {/* Scrollable Stock List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-24">
        {loading ? (
          <div className="text-center py-8 text-slate-400 text-sm">Loading store inventory...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p className="font-medium text-slate-900">All stock healthy</p>
            <p className="text-sm text-slate-500">Nothing needs attention right now.</p>
          </div>
        ) : (
          items.map((item) => <StockCard key={item.sku} item={item} />)
        )}
      </div>

      <BottomNav role="floor_staff" />
    </div>
  );
}
