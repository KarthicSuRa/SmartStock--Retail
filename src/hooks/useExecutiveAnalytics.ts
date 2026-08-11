// /src/hooks/useExecutiveAnalytics.ts

import { useEffect, useState } from 'react';

interface ProtectedRevenue {
  month: string;
  total_revenue_at_risk: number;
  total_protected_revenue: number;
  prevention_yield_pct: number;
  alerts_prevented: number;
}

interface VendorScorecard {
  vendor_id: string;
  vendor_name: string;
  reliability_score: number;
  on_time_pct: number;
  avg_drift_days: number;
  total_procurement_value: number;
}

interface StoreHealth {
  store_id: string;
  store_name: string;
  critical_skus: number;
  sync_accuracy_pct: number;
  pending_procurement_value: number;
}

export function useExecutiveAnalytics(tenantId: string) {
  const [protectedRevenue, setProtectedRevenue] = useState<ProtectedRevenue[]>([]);
  const [vendorScores, setVendorScores] = useState<VendorScorecard[]>([]);
  const [storeHealth, setStoreHealth] = useState<StoreHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      try {
        const response = await fetch('/supabase/functions/analytics-refresh', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId
          },
          body: JSON.stringify({ tenant_id: tenantId, views: ['all'] })
        });

        if (response.ok) {
          // Set mock dashboard stats if RPC returns ok
          setProtectedRevenue([
            { month: '2026-08-01', total_revenue_at_risk: 45000, total_protected_revenue: 38200, prevention_yield_pct: 84.8, alerts_prevented: 12 },
            { month: '2026-07-01', total_revenue_at_risk: 52000, total_protected_revenue: 46800, prevention_yield_pct: 90.0, alerts_prevented: 15 }
          ]);

          setVendorScores([
            { vendor_id: 'v1', vendor_name: 'Metro Wholesale', reliability_score: 94.5, on_time_pct: 96.0, avg_drift_days: 0.2, total_procurement_value: 120000 },
            { vendor_id: 'v2', vendor_name: 'Global Foods B.V.', reliability_score: 82.1, on_time_pct: 84.0, avg_drift_days: 1.8, total_procurement_value: 85000 }
          ]);

          setStoreHealth([
            { store_id: '1001', store_name: 'Amsterdam Flagship', critical_skus: 2, sync_accuracy_pct: 99.1, pending_procurement_value: 14500 },
            { store_id: '1002', store_name: 'Rotterdam Centraal', critical_skus: 0, sync_accuracy_pct: 98.7, pending_procurement_value: 8200 }
          ]);
        }
      } catch (err) {
        console.error('Analytics fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [tenantId]);

  const totalProtected = protectedRevenue.reduce((sum, r) => sum + (r.total_protected_revenue || 0), 0);
  const avgYield = protectedRevenue.length > 0 
    ? protectedRevenue.reduce((sum, r) => sum + (r.prevention_yield_pct || 0), 0) / protectedRevenue.length 
    : 0;

  return {
    protectedRevenue,
    vendorScores,
    storeHealth,
    loading,
    totalProtected,
    avgYield
  };
}
