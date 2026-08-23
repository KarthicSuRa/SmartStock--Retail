'use client';

// /src/components/domain/NetworkImbalanceWidget.tsx
// SmartStock Intelligence & Analytics V1 — Supply Chain Network Imbalance Widget

import React from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import Link from 'next/link';

export const NetworkImbalanceWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[#EAECF0] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#101828]">Network Stock Imbalance Opportunity</h3>
          <p className="text-xs text-[#667085]">
            Comparison of surplus working capital vs acute store-level stockout exposures.
          </p>
        </div>
        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[#E8F4F3] text-[#14706B]">
          63% Transfer Potential
        </span>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        <div className="p-4 rounded-[6px] bg-[#F2F4F7] border border-[#EAECF0] space-y-1">
          <span className="text-[10px] uppercase font-sans text-[#667085] font-semibold block">
            Excess Inventory (&gt;30 Days Supply)
          </span>
          <span className="text-xl font-bold text-[#101828]">€2,840,000</span>
          <p className="text-[11px] font-sans text-[#667085]">
            Trapped across 14 stores with slow velocity.
          </p>
        </div>

        <div className="p-4 rounded-[6px] bg-[#FEF3F2] border border-[#FECDCA] space-y-1">
          <span className="text-[10px] uppercase font-sans text-[#D92D20] font-semibold block">
            Sales Exposure (&lt;1 Day Supply)
          </span>
          <span className="text-xl font-bold text-[#D92D20]">€420,000</span>
          <p className="text-[11px] font-sans text-[#B42318]">
            Immediate weekend stockout risk across 8 flagship locations.
          </p>
        </div>
      </div>

      <div className="p-3 bg-[#E8F4F3] border border-[#14706B]/20 rounded-[6px] flex items-center justify-between text-xs text-[#14706B]">
        <span>
          <strong>Transfer Opportunity:</strong> 812 of 1,284 stockout cases could be fulfilled from sister stores before runout.
        </span>
        <Link href="/replenishment">
          <Button variant="primary" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
            Review STO Transfers
          </Button>
        </Link>
      </div>
    </div>
  );
};
