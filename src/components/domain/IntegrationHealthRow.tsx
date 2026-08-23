'use client';

// /src/components/domain/IntegrationHealthRow.tsx
// SmartStock Experience V1 — Unified Integration Health Row Component

import React from 'react';
import { Badge, StatusVariant } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ChevronRight, RefreshCw, Activity, ShieldCheck, AlertTriangle } from 'lucide-react';

export interface IntegrationHealthData {
  id: string;
  name: string;
  type: 'POS' | 'ERP' | 'FILE_FEED';
  targetSystem: string;
  status: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'FAILED';
  lastEventTime: string;
  lastReconciledTime: string;
  feedConfidence: number;
  mappingRate: number;
  activeErrors: number;
  isShadowMode?: boolean;
}

export interface IntegrationHealthRowProps {
  integration: IntegrationHealthData;
  onInspect: (integration: IntegrationHealthData) => void;
}

export const IntegrationHealthRow: React.FC<IntegrationHealthRowProps> = ({
  integration,
  onInspect,
}) => {
  const statusMap: Record<string, StatusVariant> = {
    HEALTHY: 'healthy',
    DEGRADED: 'warning',
    STALE: 'warning',
    FAILED: 'critical',
  };

  return (
    <div
      onClick={() => onInspect(integration)}
      className="op-card-interactive p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer select-none"
    >
      <div className="space-y-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge status={statusMap[integration.status] || 'neutral'} size="sm">
            {integration.status}
          </Badge>
          {integration.isShadowMode && (
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-[#F2F4F7] text-[#475467] border border-[#D0D5DD]">
              SHADOW MODE
            </span>
          )}
          <span className="text-xs font-semibold text-[#101828]">{integration.name}</span>
          <span className="text-xs text-[#667085] hidden sm:inline">({integration.targetSystem})</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-[#667085] pt-0.5">
          <span>Last Event: <strong className="text-[#101828]">{integration.lastEventTime}</strong></span>
          <span>Reconciliation: <strong className="text-[#101828]">{integration.lastReconciledTime}</strong></span>
          <span>Feed Quality: <strong className="text-[#039855] font-mono">{integration.feedConfidence}%</strong></span>
          <span>Mappings: <strong className="text-[#101828] font-mono">{integration.mappingRate}%</strong></span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto justify-end">
        {integration.activeErrors > 0 && (
          <span className="text-xs font-semibold font-mono text-[#D92D20] bg-[#FEF3F2] px-2 py-0.5 rounded border border-[#FECDCA]">
            {integration.activeErrors} errors
          </span>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onInspect(integration);
          }}
          rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
        >
          Details
        </Button>
      </div>
    </div>
  );
};
