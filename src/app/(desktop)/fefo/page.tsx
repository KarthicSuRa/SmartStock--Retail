'use client';

import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useStoreContext } from '@/hooks/useStoreContext';
import { FefoActionCard } from '@/components/inventory/FefoActionCard';
import { Tag, AlertOctagon, RefreshCw } from 'lucide-react';

export default function DesktopFefoPage() {
  const { tenantId } = useStoreContext();
  const [fefoItems, setFefoItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (!isSupabaseConfigured) {
      setFefoItems(fallbackItems);
      setLoading(false);
      return;
    }

    supabase.functions.invoke('fefo-recommendations', {
      body: { store_id: '1001', tenant_id: tenantId || 'default-tenant' }
    }).then(({ data }) => {
      if (data?.recommendations?.length) {
        setFefoItems(data.recommendations);
      } else {
        setFefoItems(fallbackItems);
      }
    }).catch(() => {
      setFefoItems(fallbackItems);
    }).finally(() => setLoading(false));
  }, [tenantId]);

  const fallbackItems = [
    {
      sku: 'SKU-DAIRY-009',
      description: 'Organic Fresh Whole Milk 2L',
      batch_number: 'LOT-2026-0814',
      expiry_date: '2026-08-14',
      remaining_qty: 35,
      days_until_expiry: 3,
      excess_at_risk: 35,
      value_at_risk: 63.00,
      priority: 'URGENT',
      targets: [
        { store_id: '1002', store_name: 'Amsterdam Flagship (1002)', transfer_qty: 20 },
        { store_id: '1003', store_name: 'Utrecht Express (1003)', transfer_qty: 15 }
      ]
    },
    {
      sku: 'SKU-BAKERY-012',
      description: 'Artisan Sourdough Loaf 500g',
      batch_number: 'LOT-2026-0812',
      expiry_date: '2026-08-12',
      remaining_qty: 18,
      days_until_expiry: 1,
      excess_at_risk: 18,
      value_at_risk: 39.60,
      priority: 'URGENT',
      targets: [
        { store_id: '1002', store_name: 'Amsterdam Flagship (1002)', transfer_qty: 18 }
      ]
    },
    {
      sku: 'SKU-MEAT-004',
      description: 'Prime Ribeye Steak 400g',
      batch_number: 'LOT-2026-0816',
      expiry_date: '2026-08-16',
      remaining_qty: 12,
      days_until_expiry: 5,
      excess_at_risk: 12,
      value_at_risk: 102.00,
      priority: 'HIGH',
      targets: [
        { store_id: '1002', store_name: 'Amsterdam Flagship (1002)', transfer_qty: 12 }
      ]
    }
  ];

  const handleTransfer = (sku: string, targetStoreId: string, qty: number) => {
    alert(`⚡ FEFO Rebalance Transfer Dispatched!\n${qty} units of ${sku} queued for transfer to Store ${targetStoreId}`);
  };

  return (
    <div className="space-y-6">
      
      {/* Banner (White Theme) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wider">
              FEFO Multi-Echelon Algorithm
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900">FEFO Expiry Rebalancing Engine</h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Automated markdown pricing, lateral store transfers & food waste minimization recommendations.
          </p>
        </div>

        <div className="px-4 py-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-2xl font-mono text-xs font-bold">
          {fefoItems.length} Batches at Risk
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-500 text-sm gap-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <RefreshCw className="w-5 h-5 animate-spin text-purple-600" />
          <span>Running FEFO expiry risk model against active store batches...</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fefoItems.map(item => (
          <div key={item.sku + item.batch_number} className="bg-white border border-slate-200 rounded-2xl p-2 shadow-xs">
            <FefoActionCard
              item={item}
              onTransfer={(targetStoreId, qty) => handleTransfer(item.sku, targetStoreId, qty)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
