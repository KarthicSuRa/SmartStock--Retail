// /src/hooks/useRealtimeInventory.ts

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useStoreContext } from './useStoreContext';

export interface LiveStockItem {
  sku: string;
  description: string;
  current_calculated_stock: number;
  stock_status: 'HEALTHY' | 'REPLENISHMENT_NEEDED' | 'CRITICAL_RISK' | 'STOCKOUT_IMMIMENT' | 'EXPIRY_RISK';
  runout_days: number | null;
  forecast_velocity_daily: number | null;
  uom: string;
  unit_cost: number | null;
  last_movement_at: string | null;
  ean_gtin?: string;
}

export function useRealtimeInventory(filter?: { status?: string[]; search?: string }) {
  const { activeStoreId, tenantId } = useStoreContext();
  const [items, setItems] = useState<LiveStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchInventory = useCallback(async () => {
    if (!activeStoreId || !tenantId) return;
    setLoading(true);

    let query = supabase
      .from('live_inventory_ledger')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('store_id', activeStoreId);

    if (filter?.status?.length) {
      query = query.in('stock_status', filter.status);
    }

    if (filter?.search) {
      query = query.or(`sku.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
    }

    const { data, error } = await query.order('stock_status', { ascending: false }).limit(200);

    if (error) console.error('Inventory fetch error:', error);
    else setItems(data || []);
    
    setLoading(false);
  }, [activeStoreId, tenantId, filter?.status?.join(','), filter?.search]);

  useEffect(() => {
    if (!activeStoreId || !tenantId) return;

    const channel = supabase
      .channel(`store-${activeStoreId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_movements',
          filter: `store_id=eq.${activeStoreId}`,
        },
        () => {
          setLastUpdate(new Date());
          fetchInventory();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stock_baselines',
          filter: `store_id=eq.${activeStoreId}`,
        },
        () => {
          setLastUpdate(new Date());
          fetchInventory();
        }
      )
      .subscribe();

    fetchInventory();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeStoreId, tenantId, fetchInventory]);

  return { items, loading, lastUpdate, refetch: fetchInventory };
}
