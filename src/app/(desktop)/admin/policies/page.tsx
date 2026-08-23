'use client';

// /src/app/(desktop)/admin/policies/page.tsx
// SmartStock Experience — Decision Policies & Governance Rules

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Sliders, ShieldCheck } from 'lucide-react';

export default function PoliciesPage() {
  const policies = [
    { name: 'Stockout Lead-Time Multiplier', threshold: '2.5 Days', scope: 'High Velocity SKUs', status: 'Enforced' },
    { name: 'FEFO Markdown Trigger Window', threshold: '48 Hours to Expiry', scope: 'Perishables / Dairy', status: 'Enforced' },
    { name: 'POS Re-injection Quarantine Threshold', threshold: '3 Schema Failures / min', scope: 'All Connectors', status: 'Enforced' },
    { name: 'SAP Outbox Batch Dispatch Cadence', threshold: 'Every 5 Minutes', scope: 'Global OData Gateway', status: 'Enforced' },
  ];

  return (
    <div className="space-y-6">
      <div className="op-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#14706B]">
        <div>
          <div className="flex items-center gap-2">
            <Badge status="healthy" size="sm">Policy Engine Active</Badge>
          </div>
          <h1 className="text-xl font-bold text-[#101828] tracking-tight mt-1">Autonomous Decision Policies</h1>
          <p className="text-xs text-[#475467]">Configure dynamic thresholds, ML guardrails, and automated procurement rules.</p>
        </div>
      </div>

      <div className="op-card bg-white divide-y divide-[#EAECF0]">
        {policies.map((p, idx) => (
          <div key={idx} className="p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#101828]">{p.name}</h3>
              <p className="text-xs text-[#667085]">Scope: {p.scope} · Value: <strong className="font-mono text-[#101828]">{p.threshold}</strong></p>
            </div>
            <Badge status="healthy" size="sm">{p.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
