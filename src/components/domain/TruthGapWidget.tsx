'use client';

// /src/components/domain/TruthGapWidget.tsx
// SmartStock Intelligence RC2 — Truth Gap Widget grounded in retail stock subject matter

import React from 'react';
import { HardenedTruthGapData } from '@/lib/analytics/analytics-service';
import { ShieldCheck, HelpCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface TruthGapWidgetProps {
  data: HardenedTruthGapData;
  onExplain?: () => void;
  className?: string;
}

export const TruthGapWidget: React.FC<TruthGapWidgetProps> = ({ data, onExplain, className = '' }) => {
  // Ground the design in the subject matter: retail stock intelligence.
  // The signature metric is the like-for-like discrepancy between SAP baseline
  // and the operational digital twin, after explained adjustments are accounted for.
  // Aesthetic choices are deliberate: the unexplained variance is the memorable
  // element (boldness spent in one place), everything else is disciplined.

  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#EAECF0] pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#101828] uppercase tracking-wider">
              Live Inventory Truth Gap
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#F0F9FF] text-[#0891B2] font-bold">
              LIKE-FOR-LIKE
            </span>
          </div>
          <h3 className="text-base font-semibold text-[#101828]">Stock Discrepancy</h3>
          <p className="text-xs text-[#667085]">
            Physical discrepancy between SAP baseline and operational twin, separated from sellable reservations.
            Requires physical count when unexplained.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right font-mono">
            <span className="text-2xl font-bold text-[#B42318]">
              {data.unexplainedPhysicalGapEur.toLocaleString()}
            </span>
            <span className="text-xs text-[#039855] font-sans font-bold flex items-center justify-end gap-1 mt-0.5">
              <Info className="w-3.5 h-3.5" /> {data.unexplainedChangePct}% vs prior period
            </span>
          </div>
          {onExplain && (
            <Button variant="outline" size="sm" onClick={onExplain} leftIcon={<HelpCircle className="w-3.5 h-3.5" />}>

              Explain
            </Button>
          )}
        </div>
      </div>

      {/* 3-Layer Waterfall Breakdown — subject-specific labels */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs text-center">
        {/* Layer 1: SAP Baseline (Comparable On-Hand) */}
        <div className="p-3 bg-[#F0F9FF] rounded-[6px] border border-[#0891B2]">
          <span className="text-[10px] uppercase font-sans text-[#0891B2] block">SAP Comparable On-Hand</span>
          <span className="text-sm font-bold text-[#101828]">
            {((data.sapComparableOnHandEur || 0) / 1000000).toFixed(2)}M
          </span>
          <span className="text-[10px] block font-sans text-[#667085]">Baseline checkpoint (ERP)</span>
        </div>

        {/* Layer 2: Unexplained Variance (the signature target) */}
        <div className="p-3 bg-[#FEF3F2] rounded-[6px] border border-[#FECACA] text-[#B42318]">
          <span className="text-[10px] uppercase font-sans text-[#B42318] block">Unexplained Variance</span>
          <span className="text-sm font-bold text-[#B42318]">
            {data.unexplainedPhysicalGapEur.toLocaleString()}
          </span>
          <span className="text-[10px] block font-sans text-[#B42318]">Requires physical count</span>
        </div>

        {/* Layer 3: Explained Adjustments */}
        <div className="p-3 bg-[#F0FDF4] rounded-[6px] border border-[#059669] text-[#059669]">
          <span className="text-[10px] uppercase font-sans text-[#059669] font-bold block">Explained Adjustments</span>
          <span className="text-sm font-bold">
            {(data.explainedPhysicalGapEur || 0).toLocaleString()}
          </span>
          <span className="text-[10px] block font-sans text-[#039855]">
            In-transit timing, scrap, damage
          </span>
        </div>

        {/* Layer 4: SmartStock Operational On-Hand (for context) */}
        <div className="p-3 bg-[#F8FAFD] rounded-[6px] border border-border-[#CBD5E1] text-[#475467]">
          <span className="text-[10px] uppercase font-sans text-[#475467] block">SmartStock Operational On-Hand</span>
          <span className="text-sm font-normal text-[#475467]">
            {((data.smartStockOperationalOnHandEur || 0) / 1000000).toFixed(2)}M
          </span>
          <span className="text-[10px] block font-sans text-[#667085]">Operational digital twin — not the variance target</span>
        </div>
      </div>
    </div>
  );
};