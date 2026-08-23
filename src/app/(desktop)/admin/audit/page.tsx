'use client';

// /src/app/(desktop)/admin/audit/page.tsx
// SmartStock Experience — Immutable Audit Trail & SLA Telemetry

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { ShieldCheck, Clock } from 'lucide-react';

export default function AuditTrailPage() {
  const auditLogs = [
    { ts: '13:30:12 UTC', user: 'System Worker', event: 'POS Ingestion Stream Batch #4102 Applied', entity: 'Ledger MAT-20349', status: 'Success' },
    { ts: '13:28:44 UTC', user: 'Sarah Jenkins', event: 'STO Transfer Approval (12 Units)', entity: 'Amsterdam Central -> Zuid', status: 'Approved' },
    { ts: '13:25:01 UTC', user: 'OData Sync Worker', event: 'SAP S/4HANA Idempotent Flush (24 records)', entity: 'Outbox Batch #892', status: 'Reconciled' },
    { ts: '13:20:19 UTC', user: 'System Worker', event: 'Monotonic Watermark Checkpoint Verified', entity: 'Watermark #602', status: 'Verified' },
  ];

  return (
    <div className="space-y-6">
      <div className="op-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#14706B]">
        <div>
          <div className="flex items-center gap-2">
            <Badge status="healthy" size="sm">Immutable Append-Only Log</Badge>
            <span className="text-xs font-mono text-[#667085]">SOC2 & GDPR Article 30 Compliant</span>
          </div>
          <h1 className="text-xl font-bold text-[#101828] tracking-tight mt-1">Audit Trail & Compliance Log</h1>
          <p className="text-xs text-[#475467]">Cryptographically sealed event ledger records for all inventory transitions and approvals.</p>
        </div>
      </div>

      <div className="op-card bg-white overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#EAECF0] bg-[#F9FAFB] text-[#667085]">
              <th className="py-3 px-4 font-semibold">Timestamp</th>
              <th className="py-3 px-4 font-semibold">Actor</th>
              <th className="py-3 px-4 font-semibold">Action / Event</th>
              <th className="py-3 px-4 font-semibold">Target Entity</th>
              <th className="py-3 px-4 font-semibold">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAECF0]">
            {auditLogs.map((log, i) => (
              <tr key={i} className="hover:bg-[#F9FAFB]">
                <td className="py-3 px-4 font-mono text-[#667085]">{log.ts}</td>
                <td className="py-3 px-4 font-semibold text-[#101828]">{log.user}</td>
                <td className="py-3 px-4 text-[#344054]">{log.event}</td>
                <td className="py-3 px-4 font-mono text-[#475467]">{log.entity}</td>
                <td className="py-3 px-4">
                  <Badge status="healthy" size="sm">{log.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
