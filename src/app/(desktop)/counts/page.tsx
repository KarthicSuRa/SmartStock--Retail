'use client';

// /src/app/(desktop)/counts/page.tsx
// SmartStock LiveRetail — Interactive Smart Cycle Count Center

import React, { useState } from 'react';
import { useRealtimeInventory } from '@/hooks/useRealtimeInventory';
import { useStoreContext } from '@/hooks/useStoreContext';
import { useToast } from '@/hooks/useToast';
import { VoiceCountInput } from '@/components/count/VoiceCountInput';
import { Badge } from '@/components/ui/Badge';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  Mic,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Plus,
  Minus,
  RotateCcw,
  Check,
  Smartphone
} from 'lucide-react';
import Link from 'next/link';

interface CountTask {
  material_id: string;
  sku: string;
  description: string;
  current_stock: number;
  priority_score: number;
  reason: string;
  abc_class: string;
  days_since_last_count: number;
}

export default function DesktopCountsPage() {
  const { tenantId, activeStoreId } = useStoreContext();
  const { toast } = useToast();
  const { items } = useRealtimeInventory();

  const initialTasks: CountTask[] = [
    {
      material_id: 'MAT-1001',
      sku: 'SKU-DRINK-001',
      description: 'Coca Cola Zero 330ml Can (24 Pack)',
      current_stock: 12,
      priority_score: 98,
      reason: 'High velocity item below safety threshold',
      abc_class: 'A',
      days_since_last_count: 32,
    },
    {
      material_id: 'MAT-1002',
      sku: 'SKU-SNACK-004',
      description: 'Doritos Tangy Cheese 150g (12 Pack)',
      current_stock: 8,
      priority_score: 92,
      reason: 'Sales variance registered in POS telemetry',
      abc_class: 'A',
      days_since_last_count: 45,
    },
    {
      material_id: 'MAT-1003',
      sku: 'SKU-DAIRY-009',
      description: 'Organic Fresh Whole Milk 2L',
      current_stock: 35,
      priority_score: 85,
      reason: 'FEFO expiry rebalance audit due',
      abc_class: 'B',
      days_since_last_count: 14,
    },
    {
      material_id: 'MAT-1004',
      sku: 'MAT-00918',
      description: 'Lavazza Espresso Italiano 250g Beans',
      current_stock: 22,
      priority_score: 78,
      reason: 'Periodic high-value ABC cycle audit',
      abc_class: 'A',
      days_since_last_count: 38,
    },
    {
      material_id: 'MAT-1005',
      sku: 'MAT-20349',
      description: 'San Pellegrino Sparkling Mineral 750ml',
      current_stock: 40,
      priority_score: 72,
      reason: 'Routine variance check',
      abc_class: 'C',
      days_since_last_count: 60,
    },
  ];

  const [tasks, setTasks] = useState<CountTask[]>(initialTasks);
  const [activeTask, setActiveTask] = useState<CountTask | null>(initialTasks[0]);
  const [countedQty, setCountedQty] = useState<number>(initialTasks[0].current_stock);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedMap, setCompletedMap] = useState<Record<string, { counted: number; variance: number }>>({});

  const knownSkus = tasks.map((i) => ({
    sku: i.sku,
    description: i.description,
    keywords: i.description.toLowerCase().split(' ').filter((w) => w.length > 3),
  }));

  const handleSelectTask = (task: CountTask) => {
    setActiveTask(task);
    setCountedQty(completedMap[task.sku]?.counted ?? task.current_stock);
  };

  const handleConfirmCount = () => {
    if (!activeTask) return;
    setIsSubmitting(true);

    setTimeout(() => {
      const variance = countedQty - activeTask.current_stock;
      setCompletedMap((prev) => ({
        ...prev,
        [activeTask.sku]: { counted: countedQty, variance },
      }));

      setIsSubmitting(false);

      toast({
        type: 'success',
        title: `Count Recorded: ${activeTask.sku}`,
        description: `Physical count of ${countedQty} units confirmed (${variance >= 0 ? '+' : ''}${variance} variance). Ledgers updated.`,
      });

      // Auto advance to next uncounted task
      const nextUncounted = tasks.find((t) => t.sku !== activeTask.sku && !completedMap[t.sku]);
      if (nextUncounted) {
        setActiveTask(nextUncounted);
        setCountedQty(nextUncounted.current_stock);
      }
    }, 450);
  };

  const handleVoiceCount = (sku: string, qty: number) => {
    const task = tasks.find((t) => t.sku.toLowerCase() === sku.toLowerCase());
    if (task) {
      setActiveTask(task);
      setCountedQty(qty);
      const variance = qty - task.current_stock;
      setCompletedMap((prev) => ({
        ...prev,
        [task.sku]: { counted: qty, variance },
      }));
      toast({
        type: 'success',
        title: `Voice Count Confirmed: ${task.sku}`,
        description: `Counted ${qty} units via speech recognition.`,
      });
    } else {
      toast({
        type: 'error',
        title: 'SKU Not Found',
        description: `Could not match voice input to an active task.`,
      });
    }
  };

  const completedCount = Object.keys(completedMap).length;
  const varianceValue = activeTask ? countedQty - activeTask.current_stock : 0;

  return (
    <div className="space-y-6">
      {/* ── HEADER BANNER ── */}
      <div className="op-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#14706B]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge status="healthy" size="sm">
              ABC Variance Logic Active
            </Badge>
            <span className="text-xs text-[#667085]">Store {activeStoreId || '1001'}</span>
            <span className="text-xs font-mono text-[#667085]">· {completedCount}/{tasks.length} Completed</span>
          </div>
          <h1 className="text-xl font-bold text-[#101828] tracking-tight">Smart Cycle Count Center</h1>
          <p className="text-xs text-[#475467]">
            AI-prioritized cycle counts, voice-assisted verification, and immediate inventory variance reconciliation.
          </p>
        </div>

        <Link
          href="/floor/count"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#14706B] hover:bg-[#0E5652] text-white text-xs font-bold rounded-lg transition-all shadow-sm"
        >
          <Smartphone className="w-4 h-4" />
          <span>Launch Mobile Floor Count</span>
        </Link>
      </div>

      {/* ── MAIN WORKSPACE GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Prioritized Task List (5 Cols) */}
        <div className="lg:col-span-6 op-card bg-white p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#EAECF0] pb-3">
            <div>
              <h2 className="text-xs font-bold text-[#101828] uppercase tracking-wider">Prioritized Count Tasks</h2>
              <p className="text-[11px] text-[#667085]">Ranked by discrepancy risk & sales velocity</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E8F4F3] text-[#14706B] border border-[#14706B]/20">
              {tasks.length} Items Due
            </span>
          </div>

          <div className="space-y-2.5">
            {tasks.map((task) => {
              const isSelected = activeTask?.sku === task.sku;
              const isCompleted = Boolean(completedMap[task.sku]);
              const result = completedMap[task.sku];

              return (
                <div
                  key={task.sku}
                  onClick={() => handleSelectTask(task)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'border-[#14706B] bg-[#E8F4F3]/30 shadow-xs ring-1 ring-[#14706B]'
                      : isCompleted
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-[#EAECF0] bg-white hover:border-[#D0D5DD]'
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.2 rounded font-mono ${
                          task.abc_class === 'A'
                            ? 'bg-rose-100 text-rose-700'
                            : task.abc_class === 'B'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {task.abc_class}-Item
                      </span>
                      {task.days_since_last_count > 30 && (
                        <span className="text-[10px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.days_since_last_count}d overdue
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-xs text-[#101828] truncate">{task.description}</p>
                    <p className="text-[11px] font-mono text-[#667085]">SKU: {task.sku}</p>
                    <p className="text-[11px] text-[#14706B] font-medium">{task.reason}</p>
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch">
                    <div>
                      <span className="text-[10px] text-[#667085] uppercase font-mono block">System</span>
                      <span className="font-mono text-sm font-bold text-[#101828]">{task.current_stock}</span>
                    </div>

                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full mt-2">
                        <Check className="w-3 h-3" />
                        <span>{result.counted} ({result.variance >= 0 ? `+${result.variance}` : result.variance})</span>
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectTask(task);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all mt-2 ${
                          isSelected
                            ? 'bg-[#14706B] text-white shadow-xs'
                            : 'bg-slate-100 text-[#344054] hover:bg-[#14706B] hover:text-white'
                        }`}
                      >
                        {isSelected ? 'Counting' : 'Count'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Interactive Count Execution Station (6 Cols) */}
        <div className="lg:col-span-6 space-y-6">
          {activeTask ? (
            <div className="op-card bg-white p-6 space-y-6 border-t-4 border-t-[#14706B] shadow-sm">
              <div className="flex items-start justify-between border-b border-[#EAECF0] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#14706B] bg-[#E8F4F3] px-2 py-0.5 rounded">
                      ACTIVE VERIFICATION
                    </span>
                    <span className="text-xs text-[#667085] font-mono">SKU: {activeTask.sku}</span>
                  </div>
                  <h3 className="text-base font-bold text-[#101828] mt-1.5">{activeTask.description}</h3>
                  <p className="text-xs text-[#667085]">{activeTask.reason}</p>
                </div>

                <div className="text-right p-3 bg-[#F9FAFB] rounded-xl border border-[#EAECF0]">
                  <span className="text-[10px] uppercase tracking-wider text-[#667085] font-mono block">System Stock</span>
                  <span className="text-xl font-black text-[#101828] font-mono">{activeTask.current_stock}</span>
                  <span className="text-[10px] text-[#667085] block">Units</span>
                </div>
              </div>

              {/* Physical Count Stepper */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#344054] uppercase tracking-wider block">
                  Enter Physical Counted Units:
                </label>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCountedQty((q) => Math.max(0, q - 1))}
                    className="w-14 h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#101828] text-2xl font-bold flex items-center justify-center transition-all active:scale-95 border border-[#D0D5DD]"
                  >
                    <Minus className="w-5 h-5" />
                  </button>

                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min="0"
                      value={countedQty}
                      onChange={(e) => setCountedQty(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full h-14 text-center text-3xl font-black text-[#101828] font-mono bg-[#F9FAFB] border-2 border-[#D0D5DD] rounded-2xl focus:outline-none focus:border-[#14706B] focus:ring-2 focus:ring-[#14706B]/20"
                    />
                  </div>

                  <button
                    onClick={() => setCountedQty((q) => q + 1)}
                    className="w-14 h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#101828] text-2xl font-bold flex items-center justify-center transition-all active:scale-95 border border-[#D0D5DD]"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Quick Add Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setCountedQty(activeTask.current_stock)}
                    className="flex-1 py-1.5 bg-[#F9FAFB] hover:bg-[#EAECF0] border border-[#D0D5DD] text-[#344054] rounded-lg text-xs font-semibold font-mono"
                  >
                    Match System ({activeTask.current_stock})
                  </button>
                  <button
                    onClick={() => setCountedQty((q) => q + 5)}
                    className="px-3 py-1.5 bg-[#F9FAFB] hover:bg-[#EAECF0] border border-[#D0D5DD] text-[#344054] rounded-lg text-xs font-semibold font-mono"
                  >
                    +5
                  </button>
                  <button
                    onClick={() => setCountedQty((q) => q + 10)}
                    className="px-3 py-1.5 bg-[#F9FAFB] hover:bg-[#EAECF0] border border-[#D0D5DD] text-[#344054] rounded-lg text-xs font-semibold font-mono"
                  >
                    +10
                  </button>
                  <button
                    onClick={() => setCountedQty(0)}
                    className="px-3 py-1.5 bg-[#F9FAFB] hover:bg-[#EAECF0] border border-[#D0D5DD] text-rose-600 rounded-lg text-xs font-semibold font-mono"
                  >
                    Zero
                  </button>
                </div>
              </div>

              {/* Real-Time Variance Calculation Box */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                  varianceValue === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : varianceValue > 0
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="space-y-0.5">
                  <span className="block font-bold">
                    {varianceValue === 0 ? '✓ Exact Match — Zero Variance' : `Inventory Variance: ${varianceValue > 0 ? `+${varianceValue}` : varianceValue} Units`}
                  </span>
                  <span className="text-[11px] opacity-80">
                    {varianceValue === 0
                      ? 'Physical count matches SAP recorded balance.'
                      : varianceValue < 0
                      ? 'Deficit registered. Potential shrinkage or unrecorded sale.'
                      : 'Surplus registered. Incoming transfer or receipt pending.'}
                  </span>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-lg font-black font-mono">
                    {varianceValue > 0 ? `+${varianceValue}` : varianceValue}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleConfirmCount}
                  disabled={isSubmitting}
                  className="flex-1 py-3.5 bg-[#14706B] hover:bg-[#0E5652] disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Recording...' : 'Confirm & Reconcile Count'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="op-card bg-white p-8 text-center text-slate-500">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold">Select a count task from the left to start</p>
            </div>
          )}

          {/* Hands-Free Voice Count Card */}
          <div className="op-card bg-white p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAECF0] pb-3">
              <h3 className="text-xs font-bold text-[#101828] uppercase tracking-wider flex items-center gap-2">
                <Mic className="w-4 h-4 text-[#14706B]" />
                <span>Hands-Free Voice Count</span>
              </h3>
              <Badge status="healthy" size="sm">
                Web Speech Engine
              </Badge>
            </div>

            <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#EAECF0]">
              <VoiceCountInput knownSkus={knownSkus} onCount={handleVoiceCount} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
