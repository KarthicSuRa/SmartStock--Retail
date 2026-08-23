'use client';

// /src/app/(desktop)/admin/page.tsx
// SmartStock Experience — Admin & Integration Control Center

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import {
  Shield,
  Layers,
  RefreshCw,
  AlertTriangle,
  FileText,
  Sliders,
  Users,
  Building,
  ArrowRight,
  Database,
  CheckCircle2,
  Lock,
  Cpu
} from 'lucide-react';

export default function AdminHubPage() {
  const adminModules = [
    {
      title: 'POS Control Tower',
      description: 'Real-time telemetry and feed health for Shopify, Square, Clover, and Lightspeed.',
      href: '/admin/pos-control-tower',
      icon: Shield,
      badge: 'Live Feeds',
      badgeStatus: 'healthy' as const,
    },
    {
      title: 'POS Connector Registry',
      description: 'Configure and provision point-of-sale connectors, authentication keys, and webhooks.',
      href: '/admin/pos-connections',
      icon: Layers,
      badge: '4 Active',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'POS Stream Reconciliation',
      description: 'Automated ledger discrepancy matching between physical store POS and SAP S/4HANA.',
      href: '/admin/reconciliation',
      icon: RefreshCw,
      badge: '99.8% Match',
      badgeStatus: 'healthy' as const,
    },
    {
      title: 'Quarantine & Dead-Letter Isolation',
      description: 'Isolate malformed payloads, payload schema violations, and review replay audit trails.',
      href: '/admin/quarantine',
      icon: AlertTriangle,
      badge: '0 Blocked',
      badgeStatus: 'healthy' as const,
    },
    {
      title: 'Decision Governance & ML Policies',
      description: 'Tune automated reorder thresholds, confidence calibration weights, and approval hierarchies.',
      href: '/admin/decision-governance',
      icon: Sliders,
      badge: 'SOC2 / CoSo',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'Context Intelligence & External Feeds',
      description: 'Manage geospatial weather, local events, and macro promotional multipliers for demand models.',
      href: '/admin/context-intelligence',
      icon: Cpu,
      badge: 'Active',
      badgeStatus: 'healthy' as const,
    },
    {
      title: 'User Access & Separation of Duties',
      description: 'Manage roles, floor worker permissions, and two-person approval requirements.',
      href: '/admin/users',
      icon: Users,
      badge: 'RBAC Active',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'Store Network & Storage Locations',
      description: 'Manage SAP plant codes, storage locations (LGORT), and distribution routing topology.',
      href: '/admin/stores',
      icon: Building,
      badge: '3 Stores',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'System Audit Logs & SLA Health',
      description: 'Immutable ledger audit trail, event watermark tracking, and 99.99% uptime telemetry.',
      href: '/admin/audit',
      icon: FileText,
      badge: 'Immutable',
      badgeStatus: 'healthy' as const,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="op-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#14706B]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge status="healthy" size="sm">
              Enterprise Admin Active
            </Badge>
            <span className="text-xs font-mono text-[#667085]">Tenant: default-tenant</span>
          </div>
          <h1 className="text-xl font-bold text-[#101828] tracking-tight">System & Integration Administration</h1>
          <p className="text-xs text-[#475467]">
            Central command for POS gateways, SAP S/4HANA OData bridges, decision governance, and compliance audit logs.
          </p>
        </div>

        <Link
          href="/admin/pos-control-tower"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#14706B] hover:bg-[#0E5652] text-white text-xs font-bold rounded-lg transition-all shadow-sm"
        >
          <span>Open POS Control Tower</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Grid of Admin Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminModules.map((module) => {
          const Icon = module.icon;
          return (
            <Link
              key={module.href}
              href={module.href}
              className="op-card-interactive p-5 bg-white flex flex-col justify-between space-y-4 group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-lg bg-[#E8F4F3] text-[#14706B] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <Badge status={module.badgeStatus} size="sm">
                    {module.badge}
                  </Badge>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#101828] group-hover:text-[#14706B] transition-colors">
                    {module.title}
                  </h3>
                  <p className="text-xs text-[#475467] mt-1 line-clamp-2 leading-relaxed">
                    {module.description}
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-1 text-xs font-semibold text-[#14706B] group-hover:translate-x-1 transition-transform">
                <span>Manage module</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
