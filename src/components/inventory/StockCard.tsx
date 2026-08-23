// /src/components/inventory/StockCard.tsx

import React, { useState } from 'react';
import { statusColors } from '@/theme/tokens';
import { ChevronRight, TrendingDown, TrendingUp, CheckCircle, AlertTriangle, AlertOctagon, Flame, Clock, CloudOff, CheckCircle2 } from 'lucide-react';

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  CheckCircle, AlertTriangle, AlertOctagon, Flame, Clock, CloudOff, CloudCheck: CheckCircle2
};

interface Props {
  item: {
    sku: string;
    description: string;
    current_calculated_stock: number;
    stock_status: keyof typeof statusColors;
    runout_days: number | null;
    forecast_velocity_daily: number | null;
    uom: string;
    unit_cost: number | null;
  };
}

export function StockCard({ item }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const colors = statusColors[item.stock_status] || statusColors.HEALTHY;
  const StatusIcon = icons[colors.icon] || CheckCircle;

  const velocityTrend = item.forecast_velocity_daily && item.forecast_velocity_daily > 0.5
    ? 'high'
    : item.forecast_velocity_daily && item.forecast_velocity_daily > 0
    ? 'medium'
    : 'low';

  return (
    <>
      <button
        onClick={() => setDetailOpen(!detailOpen)}
        className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 shadow-sm active:scale-[0.98] transition-transform"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-slate-500">{item.sku}</span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                <StatusIcon className="w-3 h-3" />
                {item.stock_status.replace(/_/g, ' ')}
              </span>
            </div>
            <h3 className="font-semibold text-slate-900 truncate">{item.description}</h3>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 mt-1" />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">
              {Math.floor(item.current_calculated_stock)}
            </p>
            <p className="text-xs text-slate-500">{item.uom} on shelf</p>
          </div>
          
          <div className="text-center border-l border-slate-100">
            <p className={`text-2xl font-bold ${item.runout_days !== null && item.runout_days <= 2 ? 'text-red-600' : 'text-slate-900'}`}>
              {item.runout_days !== null ? item.runout_days.toFixed(1) : '—'}
            </p>
            <p className="text-xs text-slate-500">days left</p>
          </div>

          <div className="text-center border-l border-slate-100">
            <div className="flex items-center justify-center gap-1">
              {velocityTrend === 'high' && <TrendingUp className="w-5 h-5 text-red-500" />}
              {velocityTrend === 'medium' && <TrendingUp className="w-5 h-5 text-amber-500" />}
              {velocityTrend === 'low' && <TrendingDown className="w-5 h-5 text-green-500" />}
              <span className="text-lg font-bold text-slate-900">
                {item.forecast_velocity_daily?.toFixed(1) || '—'}
              </span>
            </div>
            <p className="text-xs text-slate-500">/day velocity</p>
          </div>
        </div>
      </button>
    </>
  );
}
