'use client';

// /src/components/domain/AnalyticsQualityControlTower.tsx
// SmartStock Intelligence RC1 — Analytics Data Quality & Observability Control Tower

import React from 'react';
import { Badge } from '../ui/Badge';
import { ShieldCheck, CheckCircle2, RefreshCw, Activity, AlertTriangle, Database } from 'lucide-react';

export const AnalyticsQualityControlTower: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#EAECF0] pb-3">
        <div className="flex items-center gap-2.5">
          <Database className="w-5 h-5 text-[#14706B]" />
          <div>
            <h3 className="text-sm font-semibold text-[#101828]">Analytical Data Quality & Observability</h3>
            <p className="text-xs text-[#667085]">
              Health monitoring of incremental export watermarks, SCD dimensions, and late fact processing.
            </p>
          </div>
        </div>

        <Badge status="healthy" size="sm">
          Analytics Pipeline: Healthy
        </Badge>
      </div>

      {/* Quality Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs text-center">
        <div className="p-3.5 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] font-sans uppercase text-[#667085] block">Export Freshness</span>
          <strong className="text-sm text-[#039855]">2.1 min ago</strong>
        </div>

        <div className="p-3.5 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] font-sans uppercase text-[#667085] block">Dimension Mapping</span>
          <strong className="text-sm text-[#101828]">99.8%</strong>
        </div>

        <div className="p-3.5 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] font-sans uppercase text-[#667085] block">Late Records Reprocessed</span>
          <strong className="text-sm text-[#101828]">18 / 24h</strong>
        </div>

        <div className="p-3.5 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
          <span className="text-[10px] font-sans uppercase text-[#667085] block">Metric Test Failures</span>
          <strong className="text-sm text-[#039855]">0 Failures</strong>
        </div>
      </div>
    </div>
  );
};
