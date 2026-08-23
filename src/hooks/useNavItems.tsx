'use client';

// /src/hooks/useNavItems.tsx
// SmartStock Experience V1 — Role-Based Navigation Matrix

import { Home, AlertCircle, Package, RefreshCw, BarChart2, Settings, Shield, Smartphone } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: any;
  badge?: string | number;
  badgeType?: 'critical' | 'neutral';
}

export function useNavItems(role: string): NavItem[] {
  switch (role) {
    case 'floor_worker':
      return [
        { label: 'Tasks', href: '/floor', icon: Smartphone, badge: '6' },
        { label: 'Scan', href: '/floor/scan', icon: Package },
      ];

    case 'regional_manager':
      return [
        { label: 'Home', href: '/home', icon: Home },
        { label: 'Actions', href: '/actions', icon: AlertCircle, badge: '12', badgeType: 'critical' },
        { label: 'Network', href: '/inventory', icon: Package },
        { label: 'Insights', href: '/insights', icon: BarChart2 },
      ];

    case 'supply_chain':
      return [
        { label: 'Home', href: '/home', icon: Home },
        { label: 'Inventory', href: '/inventory', icon: Package },
        { label: 'Replenishment', href: '/replenishment', icon: RefreshCw, badge: '4' },
        { label: 'Insights', href: '/insights', icon: BarChart2 },
      ];

    case 'integration_admin':
      return [
        { label: 'Home', href: '/home', icon: Home },
        { label: 'Integrations', href: '/admin/pos-control-tower', icon: Shield },
        { label: 'Reconciliation', href: '/admin/reconciliation', icon: RefreshCw },
        { label: 'Configuration', href: '/admin', icon: Settings },
      ];

    case 'system_admin':
      return [
        { label: 'Users', href: '/admin/users', icon: Settings },
        { label: 'Stores', href: '/admin/stores', icon: Settings },
        { label: 'Integrations', href: '/admin/pos-control-tower', icon: Shield },
        { label: 'Policies', href: '/admin/policies', icon: Settings },
        { label: 'Audit', href: '/admin/audit', icon: BarChart2 },
      ];

    case 'store_manager':
    default:
      return [
        { label: 'Home', href: '/home', icon: Home },
        { label: 'Actions', href: '/actions', icon: AlertCircle, badge: '12', badgeType: 'critical' },
        { label: 'Inventory', href: '/inventory', icon: Package },
        { label: 'Replenishment', href: '/replenishment', icon: RefreshCw, badge: '2' },
        { label: 'Insights', href: '/insights', icon: BarChart2 },
        { label: 'Admin', href: '/admin', icon: Settings },
      ];
  }
}
