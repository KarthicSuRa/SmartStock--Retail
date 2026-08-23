'use client';

// /src/components/domain/CaseTimeline.tsx
// SmartStock Experience RC1 — Flagship Operational Case End-to-End Timeline

import React, { useState } from 'react';
import { Badge, StatusVariant } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Code, CheckCircle2, ChevronDown, ChevronUp, Clock, ShieldCheck, User } from 'lucide-react';

export interface CaseLifecycleStep {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  actor: string;
  status: 'completed' | 'processing' | 'pending' | 'failed';
  technicalDetails?: {
    eventType?: string;
    correlationId?: string;
    sapDocNumber?: string;
    payloadSnippet?: string;
    latencyMs?: number;
  };
}

export interface CaseTimelineProps {
  caseId: string;
  sku: string;
  productName: string;
  steps?: CaseLifecycleStep[];
  className?: string;
}

export const CaseTimeline: React.FC<CaseTimelineProps> = ({
  caseId,
  sku,
  productName,
  steps = [
    {
      id: 'step-1',
      timestamp: '10:21',
      title: 'Stockout Risk Detected',
      description: 'Projected stockout in 2h 18m at sales velocity 0.8 units/hr. Sellable inventory: 4.',
      actor: 'Radar Engine',
      status: 'completed',
      technicalDetails: { eventType: 'CASE_CREATED', correlationId: 'corr_99812_01', latencyMs: 14 },
    },
    {
      id: 'step-2',
      timestamp: '10:22',
      title: 'Inventory Confidence Evaluated',
      description: 'Confidence scored at 67% due to 3-day count age.',
      actor: 'Confidence Engine',
      status: 'completed',
      technicalDetails: { eventType: 'CONFIDENCE_EVALUATED', latencyMs: 8 },
    },
    {
      id: 'step-3',
      timestamp: '10:24',
      title: 'Verification Count Assigned to Floor Staff',
      description: 'Assigned to Mia Johnson on Floor PWA.',
      actor: 'Sarah (Store Manager)',
      status: 'completed',
    },
    {
      id: 'step-4',
      timestamp: '10:31',
      title: 'Physical Count Verified on Shelf',
      description: 'Physical count confirmed: 4 units present.',
      actor: 'Mia Johnson (Floor)',
      status: 'completed',
      technicalDetails: { eventType: 'CYCLE_COUNT_SUBMITTED', latencyMs: 120 },
    },
    {
      id: 'step-5',
      timestamp: '10:35',
      title: 'Internal Balancing Transfer Recommended',
      description: 'Transfer 12 units from Amsterdam Zuid (Store 1002 has 3.8 DOS surplus).',
      actor: 'Replenishment Engine',
      status: 'completed',
    },
    {
      id: 'step-6',
      timestamp: '10:37',
      title: 'Transfer Approved by Store Manager',
      description: 'Authorized 12-unit transfer from Amsterdam Zuid.',
      actor: 'Sarah (Store Manager)',
      status: 'completed',
    },
    {
      id: 'step-7',
      timestamp: '10:39',
      title: 'SAP Stock Transfer Order Confirmed',
      description: 'SAP S/4HANA document created: STO 4500018291.',
      actor: 'SAP OData Bridge',
      status: 'completed',
      technicalDetails: {
        eventType: 'ERP_DOCUMENT_POSTED',
        sapDocNumber: '4500018291',
        payloadSnippet: '{"Plant":"1001","SupplyingPlant":"1002","Material":"AP-PRO-USB-C","Quantity":12}',
        latencyMs: 380,
      },
    },
    {
      id: 'step-8',
      timestamp: '12:22',
      title: 'Transfer Inbound Received & Reconciled',
      description: '12 units received at Store 1001. Sellable stock updated to 16. Case resolved.',
      actor: 'SmartStock Engine',
      status: 'completed',
    },
  ],
  className = '',
}) => {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className={`op-card p-5 bg-white border border-[#E4E7EC] rounded-[8px] space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EAECF0] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold uppercase text-[#667085]">
              Case Lifecycle Trace
            </span>
            <span className="font-mono text-xs font-semibold text-[#14706B]">{caseId}</span>
          </div>
          <h3 className="text-sm font-semibold text-[#101828] mt-0.5">
            {productName} <span className="text-[#667085] font-normal">({sku})</span>
          </h3>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTechnical((prev) => !prev)}
          leftIcon={<Code className="w-3.5 h-3.5" />}
        >
          {showTechnical ? 'Hide Technical Diagnostics' : 'Show Technical Diagnostics'}
        </Button>
      </div>

      {/* Stepped Timeline */}
      <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-[#E4E7EC]">
        {steps.map((step) => (
          <div key={step.id} className="relative group space-y-1">
            {/* Dot */}
            <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-[#039855] ring-4 ring-[#EDFDF5]" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-[#667085]">{step.timestamp}</span>
                <span className="text-xs font-semibold text-[#101828]">{step.title}</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#F2F4F7] text-[#475467]">
                {step.actor}
              </span>
            </div>

            <p className="text-xs text-[#475467] leading-relaxed pl-0.5">{step.description}</p>

            {/* Technical Diagnostics Block */}
            {showTechnical && step.technicalDetails && (
              <div className="mt-2 p-2.5 rounded-[4px] bg-[#0C111D] text-[#A6F4C5] font-mono text-[10px] space-y-1 overflow-x-auto">
                <div className="flex justify-between text-[#98A2B3]">
                  <span>Event: {step.technicalDetails.eventType}</span>
                  {step.technicalDetails.latencyMs && <span>Latency: {step.technicalDetails.latencyMs}ms</span>}
                </div>
                {step.technicalDetails.correlationId && (
                  <div className="text-[#B2DDFF]">Correlation: {step.technicalDetails.correlationId}</div>
                )}
                {step.technicalDetails.sapDocNumber && (
                  <div className="text-[#FEDF89]">SAP Document: {step.technicalDetails.sapDocNumber}</div>
                )}
                {step.technicalDetails.payloadSnippet && (
                  <div className="text-[#98A2B3] truncate">{step.technicalDetails.payloadSnippet}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
