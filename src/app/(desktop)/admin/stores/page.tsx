'use client';

// /src/app/(desktop)/admin/stores/page.tsx
// SmartStock Experience — Store Hierarchy & Storage Locations

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Building, MapPin, Layers } from 'lucide-react';

export default function StoreHierarchyPage() {
  const stores = [
    { code: '1001', name: 'Amsterdam Central', type: 'Flagship Store', lgorts: ['0001 (Sales Floor)', '0002 (Backroom Stock)', '0003 (Defect/Quarantine)'], status: 'Online' },
    { code: '1002', name: 'Rotterdam Centraal', type: 'High Street Store', lgorts: ['0001 (Sales Floor)', '0002 (Backroom Stock)'], status: 'Online' },
    { code: '1004', name: 'Utrecht Station', type: 'Express Store', lgorts: ['0001 (Sales Floor)', '0002 (Transit Buffer)'], status: 'Online' },
  ];

  return (
    <div className="space-y-6">
      <div className="op-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#14706B]">
        <div>
          <div className="flex items-center gap-2">
            <Badge status="healthy" size="sm">SAP Topology Synchronized</Badge>
          </div>
          <h1 className="text-xl font-bold text-[#101828] tracking-tight mt-1">Store Network & Storage Locations</h1>
          <p className="text-xs text-[#475467]">SAP Plants (WERKS) and Storage Locations (LGORT) configured for real-time inventory management.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stores.map((s) => (
          <div key={s.code} className="op-card p-5 bg-white space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#14706B] px-2 py-0.5 bg-[#E8F4F3] rounded">
                PLANT {s.code}
              </span>
              <Badge status="healthy" size="sm">{s.status}</Badge>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#101828]">{s.name}</h3>
              <p className="text-xs text-[#667085]">{s.type}</p>
            </div>
            <div className="space-y-1.5 pt-2 border-t border-[#EAECF0]">
              <span className="text-[11px] font-semibold text-[#667085] block uppercase tracking-wider">Storage Locations:</span>
              {s.lgorts.map((loc, idx) => (
                <div key={idx} className="text-xs font-mono text-[#344054] bg-[#F9FAFB] px-2 py-1 rounded border border-[#EAECF0]">
                  • {loc}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
