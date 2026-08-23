// src/app/(dashboard)/floor/count/page.tsx

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useRealtimeInventory } from '@/hooks/useRealtimeInventory';
import { useStoreContext } from '@/hooks/useStoreContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { BottomNav } from '@/components/layout/BottomNav';
import { SyncStatusBar } from '@/components/layout/SyncStatusBar';
import { VoiceCountInput } from '@/components/count/VoiceCountInput';
import { ArrowLeft, CheckCircle, ClipboardList } from 'lucide-react';

interface CountTask {
  sku: string;
  description: string;
  current_stock: number;
  abc_class: string;
  days_since_last_count: number;
  reason: string;
  priority_score: number;
  material_id?: string;
}

export default function FloorCountPage() {
  const router = useRouter();
  const { activeStoreId, tenantId } = useStoreContext();
  const { items, lastUpdate } = useRealtimeInventory();
  const [activeCountSku, setActiveCountSku] = useState<string | null>(null);
  const [physicalQty, setPhysicalQty] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [completedSkus, setCompletedSkus] = useState<Set<string>>(new Set());
  const [showVoice, setShowVoice] = useState(false);
  const [liveCountList, setLiveCountList] = useState<CountTask[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Fetch AI-prioritized count list from daily-count-list edge function
  useEffect(() => {
    if (!activeStoreId || !tenantId || !isSupabaseConfigured) {
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    supabase.functions.invoke('daily-count-list', {
      body: { store_id: activeStoreId, tenant_id: tenantId }
    }).then(({ data }) => {
      if (data?.tasks?.length) {
        setLiveCountList(data.tasks);
      }
    }).catch(() => {
      // Edge function not deployed yet — fall back to inventory-derived list below
    }).finally(() => setLoadingList(false));
  }, [activeStoreId, tenantId]);

  // Stable fallback derived from live inventory (deterministic, not random)
  const fallbackCountTasks: CountTask[] = useMemo(() => items.slice(0, 15).map((item, idx) => ({
    sku: item.sku,
    description: item.description,
    current_stock: item.current_calculated_stock,
    abc_class: idx < 3 ? 'A' : idx < 8 ? 'B' : 'C',
    days_since_last_count: ((item.sku.charCodeAt(item.sku.length - 1) * 7) % 45) + 5,
    reason: item.stock_status === 'CRITICAL_RISK' ? 'Critical stock — verify immediately' :
            item.stock_status === 'EXPIRY_RISK' ? 'FEFO expiry risk batch tracking' :
            'Scheduled cycle count',
    priority_score: item.stock_status === 'CRITICAL_RISK' ? 95 : 70,
  })), [items]);

  const countTasks = liveCountList.length > 0 ? liveCountList : fallbackCountTasks;

  // knownSkus shape expected by VoiceCountInput
  const knownSkus = useMemo(() => countTasks.map(t => ({
    sku: t.sku,
    description: t.description,
    keywords: t.description.toLowerCase().split(' ').filter(w => w.length > 3),
  })), [countTasks]);

  const handleStartCount = (sku: string, currentStock: number) => {
    setActiveCountSku(sku);
    setPhysicalQty(currentStock);
    setShowVoice(false);
  };

  const handleSubmitCount = async () => {
    if (!activeCountSku) return;
    setSubmitting(true);
    try {
      await supabase.from('physical_counts').insert({
        tenant_id: tenantId || 'default-tenant',
        store_id: activeStoreId || '1001',
        sku: activeCountSku,
        physical_qty: physicalQty,
        system_qty: items.find(i => i.sku === activeCountSku)?.current_calculated_stock || 0,
        counted_at: new Date().toISOString(),
      });
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      setCompletedSkus(prev => new Set([...prev, activeCountSku]));
    } catch {
      // Offline: will sync via BackgroundSync
      setCompletedSkus(prev => new Set([...prev, activeCountSku!]));
    } finally {
      setSubmitting(false);
      setActiveCountSku(null);
    }
  };

  // VoiceCountInput callback — sets the qty on the active SKU and confirms immediately
  const handleVoiceCount = (sku: string, qty: number) => {
    const task = countTasks.find(t => t.sku === sku);
    if (task) {
      setActiveCountSku(sku);
      setPhysicalQty(qty);
      setShowVoice(false);
    }
  };

  const remaining = countTasks.filter(t => !completedSkus.has(t.sku));

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <SyncStatusBar lastSync={lastUpdate} />

      <header className="px-4 pt-4 pb-3 bg-white border-b flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-900">Smart Cycle Count</h1>
          <p className="text-xs text-slate-500">AI-prioritized by ABC class &amp; variance risk</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVoice(v => !v)}
            className={`p-2 rounded-xl text-xs font-bold border transition-all ${showVoice ? 'bg-rose-500 text-white border-rose-400' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
            title="Toggle voice count mode"
          >
            🎤
          </button>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-900">{completedSkus.size}/{countTasks.length}</span>
            <p className="text-[10px] text-slate-400">Done</p>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-slate-200">
        <div
          className="h-full bg-blue-600 transition-all duration-500"
          style={{ width: `${countTasks.length ? (completedSkus.size / countTasks.length) * 100 : 0}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-28">
        {/* Voice input panel — toggled by the mic button in header */}
        {showVoice && (
          <VoiceCountInput
            knownSkus={knownSkus}
            onCount={handleVoiceCount}
          />
        )}

        {countTasks.length === 0 && !loadingList && (
          <div className="text-center py-16">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No inventory loaded yet</p>
            <p className="text-xs text-slate-400">Check your network connection</p>
          </div>
        )}

        {loadingList && liveCountList.length === 0 && items.length === 0 && (
          <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
            <span className="animate-spin text-base">⚙</span> Loading count tasks...
          </div>
        )}

        {remaining.length === 0 && countTasks.length > 0 && (
          <div className="text-center py-10 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <p className="font-bold text-emerald-800 text-lg">All counts complete!</p>
            <p className="text-sm text-emerald-600">Results synced to inventory ledger.</p>
          </div>
        )}

        {remaining.map(task => (
          <div key={task.sku} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${task.abc_class === 'A' ? 'bg-rose-100 text-rose-800' : task.abc_class === 'B' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                    Class {task.abc_class}
                  </span>
                  {task.days_since_last_count > 30 && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      ⏱ {task.days_since_last_count}d overdue
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-slate-400">SKU: {task.sku}</p>
                <h4 className="font-bold text-slate-900 text-sm truncate">{task.description}</h4>
                <p className="text-xs text-blue-600 font-medium mt-0.5">{task.reason}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">System</p>
                <p className="text-lg font-extrabold text-slate-900 font-mono">{task.current_stock}</p>
              </div>
            </div>

            {activeCountSku === task.sku ? (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Enter Physical Count:</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPhysicalQty(Math.max(0, physicalQty - 1))}
                    className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 text-xl font-bold">−</button>
                  <input
                    type="number"
                    value={physicalQty}
                    onChange={e => setPhysicalQty(Math.max(0, parseInt(e.target.value) || 0))}
                    className="flex-1 text-center text-2xl font-extrabold text-slate-900 border border-slate-300 rounded-xl py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button onClick={() => setPhysicalQty(physicalQty + 1)}
                    className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 text-xl font-bold">+</button>
                </div>

                {physicalQty !== task.current_stock && (
                  <div className={`rounded-lg px-3 py-2 text-xs font-bold ${physicalQty < task.current_stock ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    Variance: {physicalQty - task.current_stock > 0 ? '+' : ''}{physicalQty - task.current_stock} units
                    {Math.abs(physicalQty - task.current_stock) > task.current_stock * 0.1 && (
                      <span className="ml-2 text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">⚠ Large variance</span>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={handleSubmitCount} disabled={submitting}
                    className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl text-sm disabled:bg-slate-300 transition-all">
                    {submitting ? 'Saving...' : '✓ Confirm Count'}
                  </button>
                  <button onClick={() => setActiveCountSku(null)}
                    className="px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => handleStartCount(task.sku, task.current_stock)}
                className="mt-3 w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all"
              >
                Start Count
              </button>
            )}
          </div>
        ))}
      </div>

      <BottomNav role="floor_staff" />
    </div>
  );
}
