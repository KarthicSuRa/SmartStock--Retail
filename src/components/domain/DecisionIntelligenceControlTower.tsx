'use client';

// /src/components/domain/DecisionIntelligenceControlTower.tsx
// SmartStock Decision Intelligence V1 — Safety, Model Governance & Kill Switches

import React, { useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ShieldCheck, AlertTriangle, Power, Cpu, RefreshCw, Layers } from 'lucide-react';

export const DecisionIntelligenceControlTower: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  const [globalKillSwitch, setGlobalKillSwitch] = useState(false);
  const [stoKillSwitch, setStoKillSwitch] = useState(false);

  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAECF0] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[6px] bg-[#E8F4F3] border border-[#14706B]/20 text-[#14706B] flex items-center justify-center font-bold">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#101828]">Decision Intelligence Governance</h2>
            <p className="text-xs text-[#475467]">
              Model registry lifecycle, safety guardrails, kill switches, and deterministic fallbacks.
            </p>
          </div>
        </div>

        <Badge status={globalKillSwitch ? 'degraded' : 'healthy'} size="md">
          {globalKillSwitch ? 'Fallback to Deterministic Rules' : 'AI Decision Engine Active'}
        </Badge>
      </div>

      {/* 4 Core Health Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs text-center">
        <div className="p-3.5 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] font-sans uppercase text-[#667085] block">Feature Freshness</span>
          <strong className="text-sm text-[#039855]">2.4 min</strong>
        </div>

        <div className="p-3.5 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] font-sans uppercase text-[#667085] block">Abstention Rate</span>
          <strong className="text-sm text-[#101828]">6.2%</strong>
        </div>

        <div className="p-3.5 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] font-sans uppercase text-[#667085] block">Human Override Rate</span>
          <strong className="text-sm text-[#101828]">14.8%</strong>
        </div>

        <div className="p-3.5 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] font-sans uppercase text-[#667085] block">Active Models in Shadow</span>
          <strong className="text-sm text-[#14706B]">2 Models</strong>
        </div>
      </div>

      {/* Model Registry Status Table */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-[#101828]">Active Production Model Deployments</h4>
        <div className="overflow-x-auto border border-[#EAECF0] rounded-[6px]">
          <table className="w-full text-xs font-mono text-left">
            <thead className="bg-[#F2F4F7] text-[#475467]">
              <tr>
                <th className="p-2.5 font-semibold">Decision Domain</th>
                <th className="p-2.5 font-semibold">Champion Model</th>
                <th className="p-2.5 font-semibold">Challenger Model</th>
                <th className="p-2.5 font-semibold text-right">Champion WAPE / AUC</th>
                <th className="p-2.5 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAECF0] bg-white">
              <tr>
                <td className="p-2.5 font-bold text-[#101828]">Demand Forecast</td>
                <td className="p-2.5 font-semibold text-[#14706B]">Prophet v2.1</td>
                <td className="p-2.5 text-[#667085]">Seasonal Naive v1 (Shadow)</td>
                <td className="p-2.5 text-right">14.2% WAPE</td>
                <td className="p-2.5 text-right font-bold text-[#039855]">● ACTIVE</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-[#101828]">Stockout Hazard Risk</td>
                <td className="p-2.5 font-semibold text-[#14706B]">Logistic Hazard v1</td>
                <td className="p-2.5 text-[#667085]">LightGBM Hazard v2 (Shadow)</td>
                <td className="p-2.5 text-right">0.912 PR-AUC</td>
                <td className="p-2.5 text-right font-bold text-[#039855]">● ACTIVE</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-[#101828]">Replenishment Solver</td>
                <td className="p-2.5 font-semibold text-[#14706B]">Mixed Integer Solver v1</td>
                <td className="p-2.5 text-[#667085]">Nearest-Store Heuristic</td>
                <td className="p-2.5 text-right">0.001 Gap</td>
                <td className="p-2.5 text-right font-bold text-[#039855]">● ACTIVE</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Safety Kill Switches & Emergency Fallbacks */}
      <div className="p-4 rounded-[6px] bg-[#FEF3F2] border border-[#FECDCA] space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#D92D20]">
          <AlertTriangle className="w-4 h-4" />
          <span>Operational Safety Kill Switches</span>
        </div>
        <p className="text-xs text-[#475467]">
          Activating a kill switch instantly falls back to deterministic business heuristics with zero retail disruption.
        </p>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <Button
            variant={globalKillSwitch ? 'danger' : 'outline'}
            size="sm"
            onClick={() => setGlobalKillSwitch(!globalKillSwitch)}
            leftIcon={<Power className="w-3.5 h-3.5" />}
          >
            {globalKillSwitch ? 'Kill Switch Active: Resume AI Models' : 'Activate Global Fallback to Rules'}
          </Button>

          <Button
            variant={stoKillSwitch ? 'danger' : 'outline'}
            size="sm"
            onClick={() => setStoKillSwitch(!stoKillSwitch)}
            leftIcon={<Power className="w-3.5 h-3.5" />}
          >
            {stoKillSwitch ? 'STO Solver Disabled' : 'Disable STO Recommendations'}
          </Button>
        </div>
      </div>
    </div>
  );
};
