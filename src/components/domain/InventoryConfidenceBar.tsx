'use client';

// /src/components/domain/InventoryConfidenceBar.tsx
// SmartStock Experience V1 — Explainable Inventory Confidence Component

import React from 'react';

export interface ConfidenceDimension {
  label: string;
  status: 'healthy' | 'warning' | 'critical';
  detail: string;
}

export interface InventoryConfidenceBarProps {
  score: number; // 0 - 100
  showBreakdown?: boolean;
  dimensions?: ConfidenceDimension[];
  className?: string;
}

export const InventoryConfidenceBar: React.FC<InventoryConfidenceBarProps> = ({
  score,
  showBreakdown = false,
  dimensions = [
    { label: 'POS feed integrity', status: 'healthy', detail: 'Real-time webhooks active' },
    { label: 'SAP ERP reconciliation', status: 'healthy', detail: 'Matched at 08:00 checkpoint' },
    { label: 'Physical count verification', status: 'warning', detail: 'Counted 3 days ago' },
    { label: 'Sequence continuity', status: 'healthy', detail: 'Zero dropped events' },
  ],
  className = '',
}) => {
  const level = score >= 85 ? 'HIGH' : score >= 65 ? 'MEDIUM' : 'LOW';
  const color =
    level === 'HIGH' ? 'bg-[#039855]' : level === 'MEDIUM' ? 'bg-[#DC6803]' : 'bg-[#D92D20]';
  const textColor =
    level === 'HIGH' ? 'text-[#027A48]' : level === 'MEDIUM' ? 'text-[#B54708]' : 'text-[#B42318]';

  return (
    <div className={`space-y-2 select-none ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#475467] font-medium">Inventory Confidence</span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-semibold text-[#101828]">{score}%</span>
          <span className={`text-[10px] font-semibold ${textColor}`}>{level}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-[#EAECF0] h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
        />
      </div>

      {/* Dimensional Breakdown (Why?) */}
      {showBreakdown && (
        <div className="pt-2 space-y-1.5 text-[11px] border-t border-[#F2F4F7]">
          {dimensions.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-[#475467]">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    d.status === 'healthy'
                      ? 'bg-[#039855]'
                      : d.status === 'warning'
                      ? 'bg-[#DC6803]'
                      : 'bg-[#D92D20]'
                  }`}
                />
                <span>{d.label}</span>
              </span>
              <span className="text-[#667085] text-[10px]">{d.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
