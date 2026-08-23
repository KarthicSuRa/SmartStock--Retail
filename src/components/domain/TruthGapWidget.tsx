'use client';

// /src/components/domain/TruthGapWidget.tsx
// SmartStock Intelligence RC1 — Like-for-Like Inventory Truth Gap Widget

import React from 'react';
import { HardenedTruthGapData } from '@/lib/analytics/analytics-service';
import { TrendingDown, HelpCircle, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';

export interface TruthGapWidgetProps {
  data: HardenedTruthGapData;
  onExplain?: () => void;
  className?: string;
}

export const TruthGapWidget: React.FC<TruthGapWidgetProps> = ({
  data,
  onExplain,
  className = '',
}) => {
  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#EAECF0] pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#101828] uppercase tracking-wider">
              Signature Metric (v1.1)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#E8F4F3] text-[#14706B] font-bold">
              LIKE-FOR-LIKE
            </span>
          </div>
          <h3 className="text-base font-semibold text-[#101828]">Inventory Truth Gap</h3>
          <p className="text-xs text-[#667085]">
            Physical discrepancy between SAP baseline and operational twin, separated from sellable reservations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right font-mono">
            <span className="text-2xl font-bold text-[#D92D20]">
              €{data.unexplainedPhysicalGapEur.toLocaleString()}
            </span>
            <span className="text-xs text-[#039855] font-sans font-bold flex items-center justify-end gap-1 mt-0.5">
              <TrendingDown className="w-3.5 h-3.5" /> {data.unexplainedChangePct}% vs last month
            </span>
          </div>
          {onExplain && (
            <Button variant="outline" size="sm" onClick={onExplain} leftIcon={<HelpCircle className="w-3.5 h-3.5" />}>
              Explain
            </Button>
          )}
        </div>
      </div>

      {/* 3-Layer Waterfall Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs text-center">
        {/* Layer 1: Comparable On-Hand */}
        <div className="p-3 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] uppercase font-sans text-[#667085] block">SAP On-Hand Stock</span>
          <span className="text-sm font-bold text-[#101828]">
            €{(data.sapComparableOnHandEur / 1000000).toFixed(2)}M
          </span>
          <span className="text-[10px] block font-sans text-[#667085]">Baseline Checkpoint</span>
        </div>

        {/* Layer 2: Total Physical Gap */}
        <div className="p-3 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] uppercase font-sans text-[#667085] block">Total Physical Gap</span>
          <span className="text-sm font-bold text-[#101828]">
            €{data.totalPhysicalGapEur.toLocaleString()}
          </span>
          <span className="text-[10px] block font-sans text-[#667085]">Physical Stock Diff</span>
        </div>

        {/* Layer 3: Explained Adjustments */}
        <div className="p-3 bg-[#EDFDF5] rounded-[6px] border border-[#A6F4C5] text-[#027A48]">
          <span className="text-[10px] uppercase font-sans text-[#027A48] font-bold block">Explained Gap</span>
          <span className="text-sm font-bold">
            €{data.explainedPhysicalGapEur.toLocaleString()}
          </span>
          <span className="text-[10px] block font-sans text-[#039855]">In-transit timing, scrap</span>
        </div>

        {/* Layer 4: Unexplained Gap (Signature Target) */}
        <div className="p-3 bg-[#FEF3F2] rounded-[6px] border border-[#FECDCA] text-[#D92D20]">
          <span className="text-[10px] uppercase font-sans text-[#B42318] font-bold block">
            Unexplained Variance
          </span>
          <span className="text-sm font-bold">
            €{data.unexplainedPhysicalGapEur.toLocaleString()}
          </span>
          <span className="text-[10px] block font-sans text-[#B42318]">Requires physical count</span>
        </div>
      </div>
    </div>
  );
};
