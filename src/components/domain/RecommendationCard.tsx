'use client';

// /src/components/domain/RecommendationCard.tsx
// SmartStock Experience V1 — Comparison-Driven Replenishment Option Card

import React from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Check, Truck, Clock, DollarSign } from 'lucide-react';

export interface ReplenishmentOption {
  id: string;
  sourceType: 'INTERNAL_TRANSFER' | 'DC_REPLENISHMENT' | 'VENDOR_PO';
  sourceName: string;
  quantity: number;
  estimatedArrival: string;
  transferCost: number;
  sourceRemainingDOS?: number;
  moq?: number;
  isRecommended: boolean;
  whyThisOption: string[];
}

export interface RecommendationCardProps {
  option: ReplenishmentOption;
  onSelect: (option: ReplenishmentOption) => void;
  isSelected?: boolean;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  option,
  onSelect,
  isSelected = false,
}) => {
  return (
    <div
      onClick={() => onSelect(option)}
      className={`op-card-interactive p-5 space-y-4 cursor-pointer select-none relative ${
        option.isRecommended
          ? 'border-[#14706B] ring-1 ring-[#14706B] bg-[#E8F4F3]/30'
          : isSelected
          ? 'border-[#344054] bg-[#F9FAFB]'
          : 'border-[#E4E7EC] bg-white'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold uppercase text-[#667085]">
              {option.sourceType.replace(/_/g, ' ')}
            </span>
            {option.isRecommended && (
              <Badge status="healthy" size="sm">
                Recommended
              </Badge>
            )}
          </div>
          <h3 className="text-sm font-semibold text-[#101828] mt-1">{option.sourceName}</h3>
        </div>

        <div className="text-right">
          <span className="text-base font-bold font-mono text-[#101828]">
            {option.quantity} <span className="text-xs text-[#667085] font-normal">Units</span>
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 py-2 border-y border-[#EAECF0] text-center text-xs font-mono">
        <div>
          <span className="text-[10px] text-[#667085] font-sans block">Arrival</span>
          <span className="font-semibold text-[#101828]">{option.estimatedArrival}</span>
        </div>
        <div>
          <span className="text-[10px] text-[#667085] font-sans block">Transfer Cost</span>
          <span className="font-semibold text-[#101828]">€{option.transferCost}</span>
        </div>
        <div>
          <span className="text-[10px] text-[#667085] font-sans block">
            {option.sourceRemainingDOS ? 'Source DOS' : 'MOQ'}
          </span>
          <span className="font-semibold text-[#101828]">
            {option.sourceRemainingDOS ? `${option.sourceRemainingDOS}d` : option.moq}
          </span>
        </div>
      </div>

      {/* Why This Option? */}
      <div className="space-y-1.5 text-xs text-[#475467]">
        {option.whyThisOption.map((reason, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="text-[#14706B] font-bold">•</span>
            <span>{reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
