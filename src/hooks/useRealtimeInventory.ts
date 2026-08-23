// /src/hooks/useRealtimeInventory.ts

import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useStoreContext } from './useStoreContext';

export interface LiveStockItem {
  sku: string;
  description: string;
  current_calculated_stock: number;
  stock_status: 'HEALTHY' | 'REPLENISHMENT_NEEDED' | 'CRITICAL_RISK' | 'STOCKOUT_IMMINENT' | 'EXPIRY_RISK';
  runout_days: number | null;
  forecast_velocity_daily: number | null;
  uom: string;
  unit_cost: number | null;
  last_movement_at: string | null;
  ean_gtin?: string;
}

const mockInventoryItems: LiveStockItem[] = [
  {
    sku: 'SKU-DRINK-001',
    description: 'Coca Cola Zero 330ml Can (24 Pack)',
    current_calculated_stock: 12,
    stock_status: 'CRITICAL_RISK',
    runout_days: 0.6,
    forecast_velocity_daily: 18.5,
    uom: 'CS',
    unit_cost: 14.50,
    last_movement_at: new Date().toISOString()
  },
  {
    sku: 'SKU-SNACK-004',
    description: 'Doritos Tangy Cheese 150g (12 Pack)',
    current_calculated_stock: 8,
    stock_status: 'CRITICAL_RISK',
    runout_days: 0.7,
    forecast_velocity_daily: 12.0,
    uom: 'CS',
    unit_cost: 8.00,
    last_movement_at: new Date().toISOString()
  },
  {
    sku: 'SKU-DAIRY-009',
    description: 'Organic Fresh Whole Milk 2L',
    current_calculated_stock: 35,
    stock_status: 'REPLENISHMENT_NEEDED',
    runout_days: 1.4,
    forecast_velocity_daily: 24.0,
    uom: 'CS',
    unit_cost: 2.25,
    last_movement_at: new Date().toISOString()
  },
  {
    sku: 'SKU-BAKERY-012',
    description: 'Artisan Sourdough Loaf 500g',
    current_calculated_stock: 45,
    stock_status: 'HEALTHY',
    runout_days: 4.2,
    forecast_velocity_daily: 10.0,
    uom: 'PC',
    unit_cost: 3.10,
    last_movement_at: new Date().toISOString()
  },
  {
    sku: 'SKU-MEAT-004',
    description: 'Prime Ribeye Steak 400g',
    current_calculated_stock: 22,
    stock_status: 'HEALTHY',
    runout_days: 5.5,
    forecast_velocity_daily: 4.0,
    uom: 'PC',
    unit_cost: 12.50,
    last_movement_at: new Date().toISOString()
  }
];

export function useRealtimeInventory(filter?: { status?: string[]; search?: string }) {
  const { activeStoreId, tenantId } = useStoreContext();
  const [items, setItems] = useState<LiveStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchInventory = useCallback(async () => {
    setLoading(true);

    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('live_inventory_ledger')
          .select('*')
          .eq('tenant_id', tenantId || '1001')
          .eq('store_id', activeStoreId || '1001');

        if (filter?.status?.length) {
          query = query.in('stock_status', filter.status);
        }

        if (filter?.search) {
          query = query.or(`sku.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
        }

        const { data, error } = await query.order('stock_status', { ascending: false }).limit(200);

        if (!error && data && data.length > 0) {
          setItems(data as LiveStockItem[]);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('Realtime inventory fetch fallback triggered:', e);
      }
    }

    // Fallback to rich mock telemetry
    let filteredMock = [...mockInventoryItems];
    if (filter?.status?.length) {
      filteredMock = filteredMock.filter(i => filter.status!.includes(i.stock_status));
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      filteredMock = filteredMock.filter(i => i.sku.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    setItems(filteredMock);
    setLoading(false);
  }, [activeStoreId, tenantId, filter?.status?.join(','), filter?.search]);

  useEffect(() => {
    fetchInventory();

    if (isSupabaseConfigured && activeStoreId) {
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
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [activeStoreId, tenantId, fetchInventory]);

  return { items, loading, lastUpdate, refetch: fetchInventory };
}
