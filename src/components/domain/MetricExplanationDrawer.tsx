'use client';

// /src/components/domain/MetricExplanationDrawer.tsx
// SmartStock Intelligence RC1 — "Explain This Number" Lineage & Governance Drawer

import React from 'react';
import { Drawer } from '../ui/Drawer';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { MetricDefinition } from '@/lib/analytics/metric-catalog';
import { Code, Clock, User, ShieldCheck, Database } from 'lucide-react';

export interface MetricExplanationData {
  metric: MetricDefinition;
  currentValue: string;
  comparisonDelta?: string;
  sourceFactTable: string;
  freshnessTimestamp: string;
  topContributors?: { name: string; contribution: string }[];
}

export interface MetricExplanationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  explanationData: MetricExplanationData | null;
}

export const MetricExplanationDrawer: React.FC<MetricExplanationDrawerProps> = ({
  isOpen,
  onClose,
  explanationData,
}) => {
  if (!explanationData) return null;

  const { metric, currentValue, comparisonDelta, sourceFactTable, freshnessTimestamp, topContributors } =
    explanationData;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Explain: ${metric.name}`}
      subtitle={`Metric Version: ${metric.version} · Category: ${metric.category.toUpperCase()}`}
      badge={
        <Badge status="healthy" size="sm">
          Authoritative Metric
        </Badge>
      }
    >
      <div className="space-y-6 text-xs">
        {/* Value Snapshot */}
        <div className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] flex items-center justify-between">
          <div>
            <span className="text-[#667085] text-[11px] block">Current Network Value</span>
            <span className="text-xl font-bold font-mono text-[#101828]">{currentValue}</span>
          </div>
          {comparisonDelta && (
            <span className="text-xs font-mono font-semibold px-2 py-1 rounded bg-[#EDFDF5] text-[#027A48] border border-[#A6F4C5]">
              {comparisonDelta}
            </span>
          )}
        </div>

        {/* Business Definition */}
        <div className="space-y-1.5">
          <h4 className="font-semibold text-[#101828] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#14706B]" />
            <span>Formal Business Definition</span>
          </h4>
          <p className="text-[#475467] leading-relaxed p-3 bg-white rounded-[6px] border border-[#EAECF0]">
            {metric.businessDefinition}
          </p>
        </div>

        {/* Authoritative SQL Formula */}
        <div className="space-y-1.5">
          <h4 className="font-semibold text-[#101828] flex items-center gap-1.5">
            <Code className="w-4 h-4 text-[#14706B]" />
            <span>Authoritative Server-Side SQL Expression</span>
          </h4>
          <pre className="p-3 bg-[#0C111D] text-[#A6F4C5] rounded-[6px] font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
            {metric.formula}
          </pre>
        </div>

        {/* Governance & Lineage Metadata */}
        <div className="p-4 rounded-[6px] bg-[#F2F4F7] border border-[#EAECF0] space-y-2 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="text-[#667085] flex items-center gap-1 font-sans">
              <Database className="w-3.5 h-3.5" /> Source Fact Table:
            </span>
            <strong className="text-[#101828]">{sourceFactTable}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] flex items-center gap-1 font-sans">
              <Clock className="w-3.5 h-3.5" /> Pipeline Freshness:
            </span>
            <strong className="text-[#039855]">{freshnessTimestamp}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-[#667085] flex items-center gap-1 font-sans">
              <User className="w-3.5 h-3.5" /> Business Owner:
            </span>
            <strong className="text-[#101828] font-sans">{metric.owner}</strong>
          </div>
        </div>

        {/* Top Contributors if Available */}
        {topContributors && topContributors.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-[#101828]">Primary Regional Contributors</h4>
            <div className="divide-y divide-[#EAECF0] border border-[#EAECF0] rounded-[6px] bg-white">
              {topContributors.map((c, i) => (
                <div key={i} className="p-2.5 flex justify-between items-center text-xs">
                  <span className="text-[#101828] font-medium">{c.name}</span>
                  <span className="font-mono text-[#667085] font-semibold">{c.contribution}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
};
