'use client';

// /src/app/(desktop)/demo/page.tsx
// SmartStock LiveRetail V2 — Interactive Pilot Demo Storyboard (RC1)

import React, { useState } from 'react';
import {
  Play, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck,
  RotateCcw, Sparkles, ShoppingBag, Truck, ClipboardList, Database
} from 'lucide-react';

interface DemoStep {
  stepNumber: number;
  time: string;
  actor: string;
  title: string;
  description: string;
  smartstockState: {
    sku: string;
    onHand: number;
    sellable: number;
    confidence: number;
    status: string;
  };
  erpState: {
    sapStock: number;
    docNumber?: string;
    connectionStatus: string;
  };
  caseAction?: string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    stepNumber: 1,
    time: '09:00',
    actor: 'SAP S/4HANA',
    title: 'Morning Stock Baseline Sync',
    description: 'Authoritative SAP_CHECKPOINT event arrives via OData batch. Sets initial baseline for Lavazza Espresso.',
    smartstockState: { sku: 'MAT-33104', onHand: 24, sellable: 24, confidence: 94, status: 'MATCHED' },
    erpState: { sapStock: 24, connectionStatus: 'NORMAL' },
  },
  {
    stepNumber: 2,
    time: '10:34',
    actor: 'POS Terminal 02',
    title: 'Mid-Morning Velocity Surge',
    description: 'Spike of 13 sales events ingested. Projection worker updates digital twin in sub-second time.',
    smartstockState: { sku: 'MAT-33104', onHand: 11, sellable: 11, confidence: 78, status: 'NORMAL' },
    erpState: { sapStock: 24, connectionStatus: 'NORMAL' },
  },
  {
    stepNumber: 3,
    time: '10:36',
    actor: 'Case Engine',
    title: 'Stockout Risk & Confidence Degradation',
    description: 'Velocity analysis predicts stockout in 3h 12m. Confidence drops to 61% due to count age. Exception generated.',
    smartstockState: { sku: 'MAT-33104', onHand: 11, sellable: 11, confidence: 61, status: 'STOCKOUT_RISK' },
    erpState: { sapStock: 24, connectionStatus: 'NORMAL' },
    caseAction: 'VERIFY_INVENTORY task assigned to Floor Staff',
  },
  {
    stepNumber: 4,
    time: '10:43',
    actor: 'Floor Staff (PWA)',
    title: 'Cycle Count Observation Recorded',
    description: 'Floor staff counts shelf: 8 units physically observed. Observation recorded WITHOUT directly modifying on-hand.',
    smartstockState: { sku: 'MAT-33104', onHand: 11, sellable: 11, confidence: 85, status: 'VARIANCE_PENDING' },
    erpState: { sapStock: 24, connectionStatus: 'NORMAL' },
    caseAction: 'COUNT_VARIANCE (-3 units) awaits Manager Approval',
  },
  {
    stepNumber: 5,
    time: '10:45',
    actor: 'Store Manager',
    title: 'Manager Approves Count Adjustment',
    description: 'Manager approves variance in Exception Inbox. count-approval-handler emits COUNT_ADJUSTMENT (-3).',
    smartstockState: { sku: 'MAT-33104', onHand: 8, sellable: 8, confidence: 98, status: 'ADJUSTED' },
    erpState: { sapStock: 24, connectionStatus: 'NORMAL' },
  },
  {
    stepNumber: 6,
    time: '10:46',
    actor: 'Replenishment Engine',
    title: 'Multi-Factor STO Optimization',
    description: 'Evaluates replenishment: Eindhoven Store 1005 has 28 units surplus. Recommends Emergency STO (2h lead time).',
    smartstockState: { sku: 'MAT-33104', onHand: 8, sellable: 8, confidence: 98, status: 'STO_RECOMMENDED' },
    erpState: { sapStock: 24, connectionStatus: 'NORMAL' },
    caseAction: 'Manager approves STO transfer of 12 units',
  },
  {
    stepNumber: 7,
    time: '10:49',
    actor: 'Posting Worker & SAP',
    title: 'ERP Commit Ambiguity Recovery (OUTCOME_UNKNOWN)',
    description: 'SAP commits STO 4500019281 but network connection drops. SmartStock probes status and marks SAP_ACCEPTED without duplicate.',
    smartstockState: { sku: 'MAT-33104', onHand: 8, sellable: 8, confidence: 98, status: 'IN_TRANSIT' },
    erpState: { sapStock: 24, docNumber: '4500019281', connectionStatus: 'RECOVERED' },
  },
  {
    stepNumber: 8,
    time: '12:55',
    actor: 'Reconciliation Engine',
    title: 'Intraday SAP Checkpoint Reconciled',
    description: 'Authoritative SAP checkpoint confirms stock. Full case lifecycle closed. Zero unhandled variance.',
    smartstockState: { sku: 'MAT-33104', onHand: 20, sellable: 20, confidence: 99, status: 'MATCHED' },
    erpState: { sapStock: 20, docNumber: '4500019281', connectionStatus: 'NORMAL' },
    caseAction: 'CASE RESOLVED • Revenue Protected: €228 • MTTR: 2h 19m',
  },
];

export default function PilotDemoStoryboardPage() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = DEMO_STEPS[currentStepIndex];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-extrabold uppercase">
              SmartStock Pilot Candidate RC1
            </span>
            <span className="text-xs text-slate-400">Step {currentStep.stepNumber} of {DEMO_STEPS.length}</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-2">End-to-End Enterprise Pilot Narrative</h1>
          <p className="text-xs text-slate-400 mt-1">
            Live interactive walkthrough of a complete exception detection, floor observation, STO dispatch, and SAP recovery cycle.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentStepIndex(0)}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            onClick={() => setCurrentStepIndex((prev) => Math.min(DEMO_STEPS.length - 1, prev + 1))}
            disabled={currentStepIndex === DEMO_STEPS.length - 1}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold transition flex items-center gap-2 shadow-lg disabled:opacity-50"
          >
            <span>Next Step</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="grid grid-cols-8 gap-2">
        {DEMO_STEPS.map((s, idx) => (
          <button
            key={s.stepNumber}
            onClick={() => setCurrentStepIndex(idx)}
            className={`p-2.5 rounded-xl text-left border transition-all ${
              idx === currentStepIndex
                ? 'bg-blue-600 text-white border-blue-500 shadow-md ring-2 ring-blue-400'
                : idx < currentStepIndex
                ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            <div className="text-[10px] font-mono font-bold uppercase">{s.time}</div>
            <div className="text-[11px] font-bold truncate mt-0.5">{s.actor}</div>
          </button>
        ))}
      </div>

      {/* Main Focus Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-mono font-bold text-blue-600 uppercase tracking-wider">{currentStep.actor} • {currentStep.time}</span>
            <h2 className="text-xl font-black text-slate-900 mt-1">{currentStep.title}</h2>
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-bold font-mono">
            {currentStep.smartstockState.sku}
          </span>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed font-medium">
          {currentStep.description}
        </p>

        {currentStep.caseAction && (
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
            <span className="text-xs font-bold text-amber-900">{currentStep.caseAction}</span>
          </div>
        )}

        {/* Digital Twin State vs SAP State Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* SmartStock Twin */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-600" /> SmartStock Digital Twin
              </span>
              <span className="text-xs font-bold font-mono text-blue-600">{currentStep.smartstockState.confidence}% Confidence</span>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Estimated On-Hand</span>
                <span className="text-xl font-black text-slate-900">{currentStep.smartstockState.onHand} units</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Sellable Available</span>
                <span className="text-xl font-black text-slate-900">{currentStep.smartstockState.sellable} units</span>
              </div>
            </div>
          </div>

          {/* SAP ERP State */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> SAP S/4HANA System of Record
              </span>
              <span className="text-xs font-bold font-mono text-emerald-600">{currentStep.erpState.connectionStatus}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Authoritative Stock</span>
                <span className="text-xl font-black text-slate-900">{currentStep.erpState.sapStock} units</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">ERP Document #</span>
                <span className="text-sm font-extrabold text-slate-700 mt-1 block truncate">
                  {currentStep.erpState.docNumber || 'None (In Sync)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
