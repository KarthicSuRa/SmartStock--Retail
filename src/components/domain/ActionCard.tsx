'use client';

// /src/components/domain/ActionCard.tsx
// SmartStock Experience V1 — Operational Action & Exception Row Component

import React from 'react';
import { Badge, StatusVariant } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ChevronRight, Clock, AlertTriangle } from 'lucide-react';

export interface ActionItem {
  id: string;
  sku: string;
  productName: string;
  category: string;
  storeName: string;
  caseType: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  exposure: number;
  dueIn: string;
  confidence: number;
  sellableQty: number;
  sapQty: number;
  recommendedAction: string;
  recommendationReason: string;
  whyThisRecommendation?: string[];
}

export interface ActionCardProps {
  action: ActionItem;
  onReview: (action: ActionItem) => void;
  className?: string;
}

export const ActionCard: React.FC<ActionCardProps> = ({ action, onReview, className = '' }) => {
  const statusMap: Record<string, StatusVariant> = {
    CRITICAL: 'critical',
    HIGH: 'warning',
    MEDIUM: 'info',
    LOW: 'neutral',
  };

  const status = statusMap[action.severity] || 'neutral';

  return (
    <div
      onClick={() => onReview(action)}
      className={`op-card-interactive p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer select-none ${className}`}
    >
      <div className="space-y-1.5 flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={status} size="sm">
            {action.severity}
          </Badge>
          <span className="font-mono text-xs font-semibold text-[#101828]">{action.sku}</span>
          <span className="text-xs text-[#667085] hidden sm:inline">· {action.storeName}</span>
          <span className="text-xs text-[#667085]">· Sellable: <strong className="text-[#101828] font-mono">{action.sellableQty}</strong></span>
          <span className="text-xs text-[#667085]">· Confidence: <strong className="text-[#101828] font-mono">{action.confidence}%</strong></span>
        </div>

        <h3 className="text-sm font-semibold text-[#101828] truncate">{action.productName}</h3>
        <p className="text-xs text-[#475467] line-clamp-1">{action.recommendationReason}</p>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-[#F2F4F7]">
        {action.exposure > 0 && (
          <div className="text-left sm:text-right">
            <span className="text-[10px] uppercase font-medium text-[#667085] block">Sales Exposure</span>
            <span className="text-xs font-semibold font-mono text-[#D92D20]">
              €{action.exposure.toLocaleString()}
            </span>
          </div>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onReview(action);
          }}
          rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
        >
          Review
        </Button>
      </div>
    </div>
  );
};
