'use client';

// /src/components/domain/UncertaintyValueWidget.tsx
// SmartStock Intelligence RC1 — Inventory Value at Risk of Uncertainty Widget

import React from 'react';
import { InventoryUncertaintyValueData } from '@/lib/analytics/analytics-service';
import { ShieldAlert, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import Link from 'next/link';

export const UncertaintyValueWidget: React.FC<{
  data: InventoryUncertaintyValueData;
  onExplain?: () => void;
  className?: string;
}> = ({ data, onExplain, className = '' }) => {
  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#EAECF0] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#101828]">Inventory Value by Confidence Tier</h3>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#FEF3F2] text-[#D92D20] font-bold">
              UNCERTAINTY RISK
            </span>
          </div>
          <p className="text-xs text-[#667085]">
            Separates operational uncertainty from financial valuation to target cycle counts.
          </p>
        </div>

        <div className="text-right font-mono">
          <span className="text-xs text-[#667085] font-sans block">Total Inventory Value</span>
          <span className="text-lg font-bold text-[#101828]">
            €{(data.totalInventoryValueEur / 1000000).toFixed(2)}M
          </span>
        </div>
      </div>

      {/* 3 Confidence Tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs text-center">
        {/* Tier 1: High Confidence */}
        <div className="p-3 bg-[#EDFDF5] rounded-[6px] border border-[#A6F4C5] text-[#027A48]">
          <span className="text-[10px] uppercase font-sans font-bold block">High Confidence (≥85%)</span>
          <span className="text-base font-bold">
            €{(data.highConfidenceValueEur / 1000000).toFixed(2)}M
          </span>
          <span className="text-[10px] block font-sans text-[#039855]">Verified / Low Variance</span>
        </div>

        {/* Tier 2: Medium Confidence */}
        <div className="p-3 bg-[#FFFAEB] rounded-[6px] border border-[#FEDF89] text-[#B54708]">
          <span className="text-[10px] uppercase font-sans font-bold block">Medium (70–84%)</span>
          <span className="text-base font-bold">
            €{(data.mediumConfidenceValueEur / 1000).toFixed(0)}K
          </span>
          <span className="text-[10px] block font-sans text-[#B54708]">Standard Replenishment</span>
        </div>

        {/* Tier 3: Low Confidence (Target for Counts) */}
        <div className="p-3 bg-[#FEF3F2] rounded-[6px] border border-[#FECDCA] text-[#D92D20]">
          <span className="text-[10px] uppercase font-sans font-bold block">Low (&lt;70% At Risk)</span>
          <span className="text-base font-bold">
            €{(data.lowConfidenceValueEur / 1000).toFixed(0)}K
          </span>
          <span className="text-[10px] block font-sans text-[#B42318]">Requires Physical Count</span>
        </div>
      </div>

      {/* Operational Target Banner */}
      <div className="p-3 bg-[#F9FAFB] border border-[#EAECF0] rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <span className="text-[#475467]">
          <strong>Target Focus:</strong> €{data.lowConfidenceValueEur.toLocaleString()} of uncertain inventory is concentrated in <strong>{data.targetCountSkusCount} high-value SKUs</strong>.
        </span>
        <Link href="/actions?case_type=INVENTORY_UNCERTAINTY">
          <Button variant="secondary" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
            Assign Verification Counts
          </Button>
        </Link>
      </div>
    </div>
  );
};
