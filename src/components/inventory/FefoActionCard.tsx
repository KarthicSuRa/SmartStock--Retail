'use client';

import { useState } from 'react';
import { Truck, CheckCircle } from 'lucide-react';

interface Props {
  item: {
    sku: string;
    description: string;
    batch_number: string;
    expiry_date: string;
    remaining_qty: number;
    days_until_expiry: number;
    excess_at_risk: number;
    value_at_risk: number;
    priority: string;
    targets: Array<{ store_id: string; store_name: string; transfer_qty: number }>;
  };
  onTransfer: (targetStoreId: string, qty: number) => void;
}

export function FefoActionCard({ item, onTransfer }: Props) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const priorityColors: Record<string, string> = {
    URGENT: 'bg-red-100 text-red-800 border-red-300',
    HIGH: 'bg-amber-100 text-amber-800 border-amber-300',
    MEDIUM: 'bg-blue-100 text-blue-800 border-blue-300',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-purple-500 p-4 shadow-xs">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${priorityColors[item.priority] || priorityColors.MEDIUM}`}>
              {item.priority}
            </span>
            <span className="text-xs font-mono text-slate-500">{item.sku}</span>
          </div>
          <h3 className="font-semibold text-slate-900 text-sm">{item.description}</h3>
          <p className="text-xs text-slate-500">Batch: {item.batch_number}</p>
          
          <div className="grid grid-cols-3 gap-2 mt-3 text-xs bg-slate-50 p-2 rounded-lg">
            <div>
              <p className="text-slate-500">Expires</p>
              <p className="font-bold text-red-700">{item.days_until_expiry}d</p>
            </div>
            <div>
              <p className="text-slate-500">At Risk</p>
              <p className="font-bold text-slate-900">{item.excess_at_risk} units</p>
            </div>
            <div>
              <p className="text-slate-500">Write-off Value</p>
              <p className="font-bold text-red-600">€{(item.value_at_risk || 0).toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-slate-700">Rebalance to Sister Store:</p>
        {item.targets?.slice(0, 3).map((target) => (
          <div 
            key={target.store_id}
            onClick={() => setSelectedTarget(target.store_id)}
            className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
              selectedTarget === target.store_id 
                ? 'bg-purple-50 border-purple-400' 
                : 'bg-white border-slate-200 hover:border-purple-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-medium">{target.store_name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-600 font-bold">{target.transfer_qty} units</span>
              {selectedTarget === target.store_id && <CheckCircle className="w-4 h-4 text-purple-600" />}
            </div>
          </div>
        ))}
      </div>

      <button 
        className="w-full mt-3 py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm transition-all"
        disabled={!selectedTarget}
        onClick={() => {
          const target = item.targets.find(t => t.store_id === selectedTarget);
          if (target) onTransfer(selectedTarget, target.transfer_qty);
        }}
      >
        Create Inter-Store STO Transfer
      </button>
    </div>
  );
}
