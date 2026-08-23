'use client';

// /src/hooks/useNavItems.tsx
// SmartStock Experience — Complete Role-Aware Navigation Matrix

import {
  Activity,
  Home,
  AlertCircle,
  Package,
  Boxes,
  RefreshCw,
  BarChart2,
  Settings,
  Shield,
  Smartphone,
  CheckCircle2,
  Clock,
  Eye,
  Truck,
  Users,
  Building,
  FileCheck
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: any;
  badge?: string | number;
  badgeType?: 'critical' | 'neutral' | 'healthy';
}

export function useNavItems(role: string): NavItem[] {
  // Base operational items available to store managers and executives
  const coreOperationalItems: NavItem[] = [
    { label: 'Intelligent Radar', href: '/dashboard', icon: Activity, badge: 'LIVE', badgeType: 'healthy' },
    { label: 'Operations Home', href: '/home', icon: Home },
    { label: 'Actions Matrix', href: '/actions', icon: AlertCircle, badge: '12', badgeType: 'critical' },
    { label: 'Inventory Ledger', href: '/ledger', icon: Boxes },
    { label: 'Cycle Counts', href: '/counts', icon: CheckCircle2, badge: '5', badgeType: 'neutral' },
    { label: 'FEFO Expiry', href: '/fefo', icon: Clock, badge: '3', badgeType: 'critical' },
    { label: 'Shelf Health Vision', href: '/shelf-health', icon: Eye },
    { label: 'Floor Staff PWA', href: '/floor', icon: Smartphone },
    { label: 'Procurement Hub', href: '/procurement', icon: Truck, badge: '2', badgeType: 'neutral' },
    { label: 'Executive Analytics', href: '/insights', icon: BarChart2 },
    { label: 'Admin Hub', href: '/admin', icon: Settings },
  ];

  switch (role) {
    case 'floor_worker':
    case 'floor_staff':
      return [
        { label: 'Floor Tasks', href: '/floor', icon: Smartphone, badge: '6', badgeType: 'critical' },
        { label: 'Barcode Scanner', href: '/floor/scan', icon: Package },
        { label: 'Guided Cycle Count', href: '/floor/count', icon: CheckCircle2 },
        { label: 'Damage Registration', href: '/floor/damage', icon: AlertCircle },
        { label: 'Vision Shelf Health', href: '/shelf-health', icon: Eye },
      ];

    case 'regional_manager':
      return [
        { label: 'Intelligent Radar', href: '/dashboard', icon: Activity, badge: 'LIVE', badgeType: 'healthy' },
        { label: 'Overview', href: '/home', icon: Home },
        { label: 'Actions Matrix', href: '/actions', icon: AlertCircle, badge: '12', badgeType: 'critical' },
        { label: 'Multi-Store Ledger', href: '/ledger', icon: Boxes },
        { label: 'Network Inventory', href: '/inventory', icon: Package },
        { label: 'Executive Analytics', href: '/insights', icon: BarChart2 },
        { label: 'POS Control Tower', href: '/admin/pos-control-tower', icon: Shield },
      ];

    case 'supply_chain':
      return [
        { label: 'Intelligent Radar', href: '/dashboard', icon: Activity },
        { label: 'Network Inventory', href: '/inventory', icon: Package },
        { label: 'Multi-Store Ledger', href: '/ledger', icon: Boxes },
        { label: 'Replenishment', href: '/replenishment', icon: RefreshCw, badge: '4', badgeType: 'critical' },
        { label: 'Procurement Hub', href: '/procurement', icon: Truck },
        { label: 'FEFO Expiry', href: '/fefo', icon: Clock },
        { label: 'Supply Analytics', href: '/insights', icon: BarChart2 },
      ];

    case 'integration_admin':
      return [
        { label: 'POS Control Tower', href: '/admin/pos-control-tower', icon: Shield, badge: 'LIVE', badgeType: 'healthy' },
        { label: 'Connector Registry', href: '/admin/pos-connections', icon: Settings },
        { label: 'POS Reconciliation', href: '/admin/reconciliation', icon: RefreshCw },
        { label: 'Dead-Letter Queue', href: '/admin/dead-letter', icon: AlertCircle },
        { label: 'Quarantine Manager', href: '/admin/quarantine', icon: Shield },
        { label: 'Decision Governance', href: '/admin/decision-governance', icon: FileCheck },
        { label: 'Admin Hub', href: '/admin', icon: Settings },
      ];

    case 'system_admin':
      return [
        { label: 'Intelligent Radar', href: '/dashboard', icon: Activity },
        { label: 'Admin Hub', href: '/admin', icon: Settings },
        { label: 'User Directory', href: '/admin/users', icon: Users },
        { label: 'Store Hierarchy', href: '/admin/stores', icon: Building },
        { label: 'POS Control Tower', href: '/admin/pos-control-tower', icon: Shield },
        { label: 'Decision Policies', href: '/admin/policies', icon: FileCheck },
        { label: 'Audit Log & SLA', href: '/admin/audit', icon: BarChart2 },
      ];

    case 'store_manager':
    default:
      return coreOperationalItems;
  }
}
