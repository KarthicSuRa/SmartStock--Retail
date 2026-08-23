'use client';

// /src/app/(desktop)/admin/layout.tsx
// SmartStock Experience V1 — Admin & Integration Navigation Shell

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, RefreshCw, Layers, AlertTriangle, ShieldAlert, Settings, FileText, Cpu, Globe2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const adminTabs = [
    { label: 'Decision Governance', href: '/admin/decision-governance', icon: Cpu },
    { label: 'Context Intelligence', href: '/admin/context-intelligence', icon: Globe2 },
    { label: 'POS Control Tower', href: '/admin/pos-control-tower', icon: Shield },
    { label: 'Reconciliation', href: '/admin/reconciliation', icon: RefreshCw },
    { label: 'POS Mapping Studio', href: '/admin/pos-connections/new', icon: Layers },
    { label: 'Quarantined Events', href: '/admin/quarantine', icon: ShieldAlert },
    { label: 'Dead Letter Queue', href: '/admin/dead-letter', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Header */}
      <div className="border-b border-[#E4E7EC] pb-3 flex items-center justify-between overflow-x-auto">
        <div className="flex items-center gap-1">
          {adminTabs.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors flex items-center gap-2 ${
                  active
                    ? 'bg-[#14706B] text-white font-semibold'
                    : 'text-[#475467] hover:bg-[#F2F4F7] hover:text-[#101828]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
