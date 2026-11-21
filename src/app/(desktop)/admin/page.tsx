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
  Cpu,
  Network,
  FolderTree,
  KeyRound,
  ScrollText,
  MonitorSmartphone,
  Warehouse,
  ListChecks,
  FileBarChart,
  BookOpen
} from 'lucide-react';

export default function AdminHubPage() {
  const adminModules = [
    {
      title: 'Org Structure',
      description: 'Company codes, stores/plants, sales & purchase organizations, distribution channels, buyers and warehouse differentiators.',
      href: '/admin/org-structure',
      icon: Network,
      badge: 'SAP aligned',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'Category / MC Grouping',
      description: 'Department → Category → Merchandise Category hierarchy with buyer ownership and roll-ups.',
      href: '/admin/categories',
      icon: FolderTree,
      badge: 'Master Data',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'Roles & Authorizations',
      description: 'Role catalog, role × module access matrix (view / edit / approve) and user role assignment.',
      href: '/admin/roles',
      icon: KeyRound,
      badge: '9 Roles',
      badgeStatus: 'healthy' as const,
    },
    {
      title: 'Success & Error Logs',
      description: 'Transaction outcomes per module — POS, SAP, bin movements, counts, tasks — with error messages.',
      href: '/admin/transaction-logs',
      icon: ScrollText,
      badge: 'Module-wise',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'Back-Store Stock Mapping',
      description: 'Shelf ↔ back-store bin mapping, bin utilisation and bin movements.',
      href: '/backstore',
      icon: Warehouse,
      badge: 'Bins',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'Daily Tasks & Communication',
      description: 'Cleaning rounds, bin movements, replenishment tasks, announcements and shift notes.',
      href: '/tasks',
      icon: ListChecks,
      badge: 'Store teams',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'Reports & Exports',
      description: 'Operational reports with charts; export to Excel, CSV and PDF.',
      href: '/reports',
      icon: FileBarChart,
      badge: '7 Reports',
      badgeStatus: 'healthy' as const,
    },
    {
      title: 'Architecture & Database',
      description: 'Solution layers, PostgreSQL schema domains and key design decisions.',
      href: '/admin/architecture',
      icon: Database,
      badge: 'PostgreSQL',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'Devices & Languages',
      description: 'Device / OS / browser compatibility and multi-language support (incl. RTL).',
      href: '/admin/compatibility',
      icon: MonitorSmartphone,
      badge: '6 Languages',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'Glossary',
      description: 'Shared terminology with SAP equivalents.',
      href: '/glossary',
      icon: BookOpen,
      badge: 'Reference',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'POS Control Tower',
      description: 'Real-time telemetry and feed health for Shopify, Square, and Lightspeed X-Series.',
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
      badge: 'Configure',
      badgeStatus: 'neutral' as const,
    },
    {
      title: 'POS Stream Reconciliation',
      description: 'Automated ledger discrepancy matching between physical store POS and SAP S/4HANA.',
      href: '/admin/reconciliation',
      icon: RefreshCw,
      badge: 'Open',
      badgeStatus: 'neutral' as const,
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
      title: 'Audit Logs',
      description: 'Who did which transaction, in which module, and when — filterable and exportable.',
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
