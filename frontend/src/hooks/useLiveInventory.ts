import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface LiveInventoryItem {
  sap_plant_code: string;
  sap_storage_loc: string;
  sku: string;
  product_name: string;
  uom: string;
  sap_baseline_qty: number;
  pos_live_deductions: number;
  current_calculated_stock: number;
  last_sap_sync_at: string;
  updated_at: string;
}

export interface ReplenishmentAlert {
  sku: string;
  product_name: string;
  sap_plant_code: string;
  sap_storage_loc: string;
  uom: string;
  sap_baseline_qty: number;
  pos_live_deductions: number;
  current_calculated_stock: number;
  daily_velocity: number;
  units_sold_7d: number;
  last_sale_at: string | null;
  run_out_horizon_days: number | null;
  replenishment_status: 'CRITICAL_RISK' | 'REPLENISHMENT_NEEDED' | 'STOCK_OK';
  last_sap_sync_at: string;
  updated_at: string;
}

export function useLiveInventory() {
  const [inventory, setInventory] = useState<LiveInventoryItem[]>([]);
  const [alerts, setAlerts] = useState<ReplenishmentAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial ledger and alerts view data
  const fetchInventoryData = async () => {
    try {
      setLoading(true);
      const [ledgerRes, alertsRes] = await Promise.all([
        supabase
          .from('live_inventory_ledger')
          .select('*')
          .order('sku', { ascending: true }),
        supabase
          .from('v_replenishment_alerts')
          .select('*')
          .order('run_out_horizon_days', { ascending: true })
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      if (alertsRes.error) throw alertsRes.error;

      setInventory(ledgerRes.data || []);
      setAlerts(alertsRes.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch initial inventory baseline:', err);
      setError(err.message || 'Error fetching inventory data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();

    // Establish realtime WebSocket subscription to database changes on the source table
    // Re-fetching the view when the source table updates solves view replication limits
    const channel = supabase
      .channel('live-ledger-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_inventory_ledger',
        },
        async (payload) => {
          console.log('Realtime ledger update received, running background query on replenishment metrics:', payload);
          try {
            // Background SELECT query against our v_replenishment_alerts analytical view and ledger table
            const [ledgerRes, alertsRes] = await Promise.all([
              supabase
                .from('live_inventory_ledger')
                .select('*')
                .order('sku', { ascending: true }),
              supabase
                .from('v_replenishment_alerts')
                .select('*')
                .order('run_out_horizon_days', { ascending: true })
            ]);

            if (ledgerRes.error) throw ledgerRes.error;
            if (alertsRes.error) throw alertsRes.error;

            // Update React memory state parameters directly to trigger seamless real-time render updates
            setInventory(ledgerRes.data || []);
            setAlerts(alertsRes.data || []);
          } catch (err) {
            console.error('Background real-time sync query failed:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log(`Realtime ledger channel status: ${status}`);
      });

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { inventory, alerts, loading, error, refresh: fetchInventoryData };
}

