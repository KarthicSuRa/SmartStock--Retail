'use client';

// /src/components/domain/InsightCard.tsx
// SmartStock Intelligence & Analytics V1 — Actionable Business Insight Card

import React from 'react';
import Link from 'next/link';
import { Badge, StatusVariant } from '../ui/Badge';
import { Button } from '../ui/Button';
import { InsightItem } from '@/lib/analytics/insight-engine';
import { ArrowRight, AlertTriangle, TrendingUp, Sparkles } from 'lucide-react';

export const InsightCard: React.FC<{ insight: InsightItem; className?: string }> = ({
  insight,
  className = '',
}) => {
  const statusMap: Record<string, StatusVariant> = {
    CRITICAL: 'critical',
    HIGH: 'degraded',
    MEDIUM: 'pending',
  };

  return (
    <div className={`op-card-interactive p-5 bg-white border border-[#E4E7EC] rounded-[8px] space-y-3 select-none ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge status={statusMap[insight.significance] || 'neutral'} size="sm">
              {insight.significance}
            </Badge>
            <span className="text-[10px] font-mono text-[#667085] uppercase font-bold">
              {insight.scopeType}: {insight.scopeId}
            </span>
            <span className="text-[11px] font-mono text-[#667085] hidden sm:inline">
              · {insight.generatedAt}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-[#101828]">{insight.title}</h3>
        </div>

        {insight.estimatedBusinessImpactEur > 0 && (
          <div className="text-right font-mono flex-shrink-0">
            <span className="text-[10px] uppercase font-semibold text-[#667085] block">Impact</span>
            <span className="text-sm font-bold text-[#D92D20]">
              €{insight.estimatedBusinessImpactEur.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Explanation & Data */}
      <p className="text-xs text-[#475467] leading-relaxed bg-[#F9FAFB] p-3 rounded-[6px] border border-[#EAECF0]">
        {insight.explanation}
      </p>

      {/* Recommended Action & Trigger */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
        <div className="text-xs text-[#14706B] font-medium flex items-center gap-1.5">
          <span>💡 <strong>Recommendation:</strong> {insight.recommendedAction}</span>
        </div>

        <Link href={insight.actionRoute}>
          <Button variant="secondary" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
            Investigate
          </Button>
        </Link>
      </div>
    </div>
  );
};
