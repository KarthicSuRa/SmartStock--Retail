'use client';

// /src/components/domain/PilotScorecard.tsx
// SmartStock Intelligence RC1 — Executive Pilot Scorecard Widget

import React from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PilotScorecardData } from '@/lib/analytics/analytics-service';
import { TrendingUp, TrendingDown, ShieldCheck, Award, HelpCircle } from 'lucide-react';

export const PilotScorecard: React.FC<{
  data: PilotScorecardData;
  onExplainMetric?: (metricId: string) => void;
  className?: string;
}> = ({ data, onExplainMetric, className = '' }) => {
  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAECF0] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[6px] bg-[#E8F4F3] border border-[#14706B]/20 text-[#14706B] flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[#101828]">Enterprise Pilot Scorecard</h2>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-[#E8F4F3] text-[#14706B] border border-[#14706B]/20">
                Week {data.pilotWeek} of {data.totalWeeks}
              </span>
              {data.isSimulated && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89]">
                  SIMULATED PILOT BASELINE
                </span>
              )}
            </div>
            <p className="text-xs text-[#475467]">
              Pre-pilot baseline vs measured business impact across pilot store cohort.
            </p>
          </div>
        </div>

        <Badge status="completed" size="md">
          Pilot Performance: Ahead of Target
        </Badge>
      </div>

      {/* 4 Core Impact Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-center">
        {/* Metric 1: Accuracy */}
        <div
          onClick={() => onExplainMetric?.('INVENTORY_ACCURACY_SYMMETRIC')}
          className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-1.5 cursor-pointer hover:border-[#14706B]/50 transition-colors"
        >
          <div className="flex items-center justify-center gap-1">
            <span className="text-[11px] font-sans text-[#667085] uppercase font-semibold block">
              Symmetric Accuracy
            </span>
            <HelpCircle className="w-3 h-3 text-[#98A2B3]" />
          </div>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-2xl font-bold text-[#101828]">{data.inventoryAccuracy.current}%</span>
            <span className="text-xs text-[#039855] font-sans font-bold flex items-center">
              <TrendingUp className="w-3.5 h-3.5" /> +{data.inventoryAccuracy.change}pp
            </span>
          </div>
          <span className="text-[11px] text-[#667085] block font-sans">
            Baseline: {data.inventoryAccuracy.baseline}%
          </span>
        </div>

        {/* Metric 2: Stockout Hours */}
        <div
          onClick={() => onExplainMetric?.('STOCKOUT_HOURS_INTRADAY')}
          className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-1.5 cursor-pointer hover:border-[#14706B]/50 transition-colors"
        >
          <div className="flex items-center justify-center gap-1">
            <span className="text-[11px] font-sans text-[#667085] uppercase font-semibold block">
              Stockout Hours / Mo
            </span>
            <HelpCircle className="w-3 h-3 text-[#98A2B3]" />
          </div>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-2xl font-bold text-[#101828]">{data.stockoutHours.current}h</span>
            <span className="text-xs text-[#039855] font-sans font-bold flex items-center">
              <TrendingDown className="w-3.5 h-3.5" /> {data.stockoutHours.changePct}%
            </span>
          </div>
          <span className="text-[11px] text-[#667085] block font-sans">
            Baseline: {data.stockoutHours.baseline}h
          </span>
        </div>

        {/* Metric 3: Resolution Time */}
        <div className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-1.5">
          <span className="text-[11px] font-sans text-[#667085] uppercase font-semibold block">
            Resolution Time (MTTR)
          </span>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-2xl font-bold text-[#101828]">{data.meanResolutionHours.current}h</span>
            <span className="text-xs text-[#039855] font-sans font-bold flex items-center">
              <TrendingDown className="w-3.5 h-3.5" /> {data.meanResolutionHours.changePct}%
            </span>
          </div>
          <span className="text-[11px] text-[#667085] block font-sans">
            Baseline: {data.meanResolutionHours.baseline}h
          </span>
        </div>

        {/* Metric 4: Reconciliation Rate */}
        <div className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-1.5">
          <span className="text-[11px] font-sans text-[#667085] uppercase font-semibold block">
            Reconciliation Rate
          </span>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-2xl font-bold text-[#039855]">{data.reconciliationRate.current}%</span>
            <span className="text-xs text-[#039855] font-sans font-bold flex items-center">
              <TrendingUp className="w-3.5 h-3.5" /> +{data.reconciliationRate.change}pp
            </span>
          </div>
          <span className="text-[11px] text-[#667085] block font-sans">
            Baseline: {data.reconciliationRate.baseline}%
          </span>
        </div>
      </div>

      {/* Operational Reliability & Trust Guarantee */}
      <div className="p-4 rounded-[6px] bg-[#EDFDF5] border border-[#A6F4C5] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#027A48]">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="w-5 h-5 text-[#039855] flex-shrink-0" />
          <span>Operational Reliability Audit (Zero Data Loss Guarantee):</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono font-semibold">
          <span>• Lost Events: <strong>{data.reliabilityMetrics.lostEventsCount}</strong></span>
          <span>• Duplicate SAP Posts: <strong>{data.reliabilityMetrics.duplicateSapDocsCount}</strong></span>
          <span>• Feed Completeness: <strong>{data.reliabilityMetrics.posFeedCompletenessPct}%</strong></span>
        </div>
      </div>
    </div>
  );
};
