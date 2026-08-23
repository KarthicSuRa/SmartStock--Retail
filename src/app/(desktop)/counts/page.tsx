'use client';

import React from 'react';
import { CountTaskList } from '@/components/count/CountTaskList';
import { VoiceCountInput } from '@/components/count/VoiceCountInput';
import { useRealtimeInventory } from '@/hooks/useRealtimeInventory';
import { ClipboardList, Mic, Sparkles } from 'lucide-react';

export default function DesktopCountsPage() {
  const { items } = useRealtimeInventory();

  const knownSkus = items.map(i => ({
    sku: i.sku,
    description: i.description,
    keywords: i.description.toLowerCase().split(' ').filter(w => w.length > 3)
  }));

  return (
    <div className="space-y-6">
      
      {/* Banner (White Theme) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
              ABC Variance Logic
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900">Smart Cycle Count Center</h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            AI-prioritized cycle counts, voice-assisted counting & immediate inventory variance updates.
          </p>
        </div>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-600">
          <ClipboardList className="w-8 h-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Count Tasks Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Prioritized Count Tasks</h3>
            <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              High Variance ABC
            </span>
          </div>
          <div className="text-slate-900">
            <CountTaskList onSelectTask={(t) => alert(`Selected task for SKU ${t.sku}`)} />
          </div>
        </div>

        {/* Voice Count Input Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Mic className="w-4 h-4 text-blue-600" /> Hands-Free Voice Count
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Web Speech API
            </span>
          </div>

          <div className="text-slate-900 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <VoiceCountInput
              knownSkus={knownSkus}
              onCount={(sku, qty) => alert(`Voice Count Confirmed: SKU ${sku} -> ${qty} units`)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
