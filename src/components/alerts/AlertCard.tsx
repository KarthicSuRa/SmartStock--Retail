// /src/components/alerts/AlertCard.tsx

import React, { useState } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { supabase } from '@/lib/supabase';
import { statusColors } from '@/theme/tokens';
import { CheckCircle, Eye, Truck } from 'lucide-react';

interface Props {
  item: any;
  showActions: boolean;
}

export function AlertCard({ item, showActions }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const { activeStoreId } = useStoreContext();
  const colors = statusColors[item.stock_status as keyof typeof statusColors] || statusColors.CRITICAL_RISK;

  const acknowledge = async () => {
    await supabase.from('reorder_alerts').update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
    }).eq('sku', item.sku).eq('store_id', activeStoreId);
    setAcknowledged(true);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 border-l-4" style={{ borderLeftColor: colors.border }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: colors.bg, color: colors.text }}>
              {(item.stock_status || 'CRITICAL_RISK').replace(/_/g, ' ')}
            </span>
            {item.runout_days !== null && item.runout_days !== undefined && (
              <span className="text-xs font-bold text-red-600">
                {Number(item.runout_days).toFixed(1)} days left
              </span>
            )}
          </div>
          <h3 className="font-semibold text-slate-900">{item.description}</h3>
          <p className="text-sm text-slate-500">SKU: {item.sku} • Current: {item.current_calculated_stock} {item.uom || 'EA'}</p>
          
          {item.recommended_method && (
            <div className="flex items-center gap-2 mt-2 text-sm">
              <Truck className="w-4 h-4 text-slate-400" />
              <span className="text-slate-700">
                Recommend: {item.recommended_method} 
                {item.recommended_qty ? ` of ${item.recommended_qty} ${item.uom || 'EA'}` : ''}
              </span>
            </div>
          )}
        </div>

        {showActions && !acknowledged && (
          <div className="flex flex-col gap-2">
            <button
              onClick={acknowledge}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium flex items-center gap-1"
            >
              <Eye className="w-3 h-3" />
              Ack
            </button>
            {item.staged_pr_id && (
              <button className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Review PR
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
