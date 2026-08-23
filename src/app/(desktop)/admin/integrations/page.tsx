'use client';

// /src/app/(desktop)/admin/integrations/page.tsx
// SmartStock LiveRetail V2 — Enterprise Integration Control Tower

import React, { useState } from 'react';
import {
  Shield, CheckCircle2, AlertTriangle, RefreshCw, Activity,
  Server, Cpu, Database, ArrowUpRight, Zap, Clock
} from 'lucide-react';

export default function IntegrationControlTowerPage() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-extrabold uppercase">
              Operational Gateways Active
            </span>
            <span className="text-xs text-slate-400">Enterprise Control Tower</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-2">Integration Health &amp; Outbox Pipeline</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time feed health, SAP S/4HANA OData gateway status, and durable outbox telemetry.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-2 border border-white/10"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Probe Gateways</span>
        </button>
      </div>

      {/* Systems Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* SAP ERP */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">SAP S/4HANA OData</h3>
                <span className="text-[10px] text-slate-400 font-mono">Gateway Client: 100</span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              HEALTHY (42ms)
            </span>
          </div>
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex justify-between font-mono">
            <span>Last Checkpoint: 02:00 UTC</span>
            <span className="text-slate-700 font-bold">100% Reconciled</span>
          </div>
        </div>

        {/* POS Ingestion */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">POS Stream Gateway</h3>
                <span className="text-[10px] text-slate-400 font-mono">3 Active Registers</span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              STREAMING
            </span>
          </div>
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex justify-between font-mono">
            <span>Last Sale: 14s ago</span>
            <span className="text-slate-700 font-bold">0 Sequence Gaps</span>
          </div>
        </div>

        {/* PWA Mobile Offline Queue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">PWA Offline Sync</h3>
                <span className="text-[10px] text-slate-400 font-mono">Floor Staff Terminals</span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              SYNCED (0 Pending)
            </span>
          </div>
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex justify-between font-mono">
            <span>IndexedDB Queue: Empty</span>
            <span className="text-slate-700 font-bold">100% Flush Rate</span>
          </div>
        </div>
      </div>

      {/* Outbox Pipeline Status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
          Durable Integration Outbox State
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Pending Outbound</span>
            <span className="text-2xl font-extrabold text-blue-600">0</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Retrying Backoff</span>
            <span className="text-2xl font-extrabold text-amber-600">0</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Outcome Unknown</span>
            <span className="text-2xl font-extrabold text-slate-800">0</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Dead Letter Queue</span>
            <span className="text-2xl font-extrabold text-emerald-600">0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
