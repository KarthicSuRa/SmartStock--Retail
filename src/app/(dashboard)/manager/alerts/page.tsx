// src/app/(dashboard)/manager/alerts/page.tsx

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRealtimeInventory } from '@/hooks/useRealtimeInventory';
import { useStoreContext } from '@/hooks/useStoreContext';
import { AlertCard } from '@/components/alerts/AlertCard';
import { BottomNav } from '@/components/layout/BottomNav';
import { SyncStatusBar } from '@/components/layout/SyncStatusBar';
import { ArrowLeft, AlertTriangle, Clock, ShieldAlert, Filter } from 'lucide-react';

type FilterType = 'ALL' | 'CRITICAL_RISK' | 'REPLENISHMENT_NEEDED' | 'EXPIRY_RISK';

export default function ManagerAlertsPage() {
  const router = useRouter();
  const { perms } = useStoreContext();
  const [filter, setFilter] = useState<FilterType>('ALL');

  const { items: criticalItems, lastUpdate: lastCritical } = useRealtimeInventory({ status: ['CRITICAL_RISK'] });
  const { items: replenItems, lastUpdate: lastReplen } = useRealtimeInventory({ status: ['REPLENISHMENT_NEEDED'] });
  const { items: expiryItems, lastUpdate: lastExpiry } = useRealtimeInventory({ status: ['EXPIRY_RISK'] });

  const allItems = [...criticalItems, ...replenItems, ...expiryItems];
  const filteredItems = filter === 'ALL' ? allItems
    : filter === 'CRITICAL_RISK' ? criticalItems
    : filter === 'REPLENISHMENT_NEEDED' ? replenItems
    : expiryItems;

  const lastUpdate = lastCritical;

  const filterButtons: { key: FilterType; label: string; count: number; color: string }[] = [
    { key: 'ALL', label: 'All Alerts', count: allItems.length, color: 'bg-slate-100 text-slate-700' },
    { key: 'CRITICAL_RISK', label: '🔴 Critical', count: criticalItems.length, color: 'bg-rose-100 text-rose-800' },
    { key: 'REPLENISHMENT_NEEDED', label: '🟡 Reorder', count: replenItems.length, color: 'bg-amber-100 text-amber-800' },
    { key: 'EXPIRY_RISK', label: '🟣 Expiry', count: expiryItems.length, color: 'bg-purple-100 text-purple-800' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-24">
      <SyncStatusBar lastSync={lastUpdate} />

      <header className="px-4 py-4 bg-white border-b">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="p-2 -ml-2 text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Active Alerts Centre</h1>
            <p className="text-xs text-slate-500">Real-time replenishment & expiry risk signals</p>
          </div>
        </div>

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
            <AlertTriangle className="w-4 h-4 text-rose-600 mx-auto mb-1" />
            <p className="text-xl font-extrabold text-rose-700">{criticalItems.length}</p>
            <p className="text-[10px] font-semibold text-rose-600">Critical</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <ShieldAlert className="w-4 h-4 text-amber-600 mx-auto mb-1" />
            <p className="text-xl font-extrabold text-amber-700">{replenItems.length}</p>
            <p className="text-[10px] font-semibold text-amber-600">Reorder Due</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
            <Clock className="w-4 h-4 text-purple-600 mx-auto mb-1" />
            <p className="text-xl font-extrabold text-purple-700">{expiryItems.length}</p>
            <p className="text-[10px] font-semibold text-purple-600">FEFO Risk</p>
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b">
        <Filter className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
        {filterButtons.map(btn => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              filter === btn.key ? btn.color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {btn.label} ({btn.count})
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="flex-1 p-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No alerts in this category</p>
            <p className="text-sm">All stock levels are healthy.</p>
          </div>
        ) : (
          filteredItems.map(item => (
            <AlertCard key={item.sku} item={item} showActions={perms.canApprovePR} />
          ))
        )}
      </div>

      <BottomNav role="store_manager" />
    </div>
  );
}
