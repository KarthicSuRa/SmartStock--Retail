// /src/app/(dashboard)/manager/procurement/page.tsx

'use client';

import React, { useState } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { supabase } from '@/lib/supabase';
import { Sparkles, Send, Zap, Package } from 'lucide-react';

interface StagedItem {
  id: string;
  sku: string;
  description: string;
  qty_rounded: number;
  uom: string;
  estimated_total_price: number;
  currency: string;
  fulfillment_method: 'STO' | 'EXTERNAL_PR' | 'EMERGENCY_PO';
  vendor_name?: string;
  source_store_name?: string;
  urgency_reason: string;
  status: string;
}

export default function ProcurementControlCenterPage() {
  const { tenantId, perms } = useStoreContext();
  const [activeTab, setActiveTab] = useState('staged');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([
    {
      id: 'stg-1',
      sku: 'SKU-7728',
      description: 'Organic Oat Milk 1L',
      qty_rounded: 120,
      uom: 'EA',
      estimated_total_price: 264.00,
      currency: 'EUR',
      fulfillment_method: 'EXTERNAL_PR',
      vendor_name: 'Metro Wholesale B.V.',
      urgency_reason: 'Stockout in 1.4 days',
      status: 'staged'
    },
    {
      id: 'stg-2',
      sku: 'SKU-4912',
      description: 'Whole Grain Bread 500g',
      qty_rounded: 50,
      uom: 'EA',
      estimated_total_price: 85.00,
      currency: 'EUR',
      fulfillment_method: 'STO',
      source_store_name: 'Rotterdam Centraal',
      urgency_reason: 'Lateral excess available',
      status: 'staged'
    }
  ]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedItems(next);
  };

  const approveSelected = async () => {
    const ids = Array.from(selectedItems);
    await supabase.from('staged_prs').update({ status: 'approved' }).in('id', ids);
    alert(`${ids.length} items approved for daily OData $batch execution!`);
    setSelectedItems(new Set());
  };

  const executeEmergency = async (itemId: string) => {
    if (!perms.canEmergencyPO) {
      alert('You need emergency PO authorization privileges.');
      return;
    }

    const res = await fetch('/supabase/functions/erp-emergency-po', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staged_pr_id: itemId,
        manager_user_id: 'mgr-001',
        business_justification: 'Critical stockout — immediate customer impact',
      }),
    });

    if (res.ok) {
      alert('Emergency PO posted directly to SAP!');
    } else {
      alert('Emergency PO execution failed.');
    }
  };

  const totalYield = stagedItems.reduce((sum, i) => sum + (i.estimated_total_price || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Procurement Control Center</h1>
            <p className="text-sm text-slate-500">Review, approve, and execute staged SAP procurement</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Total Batch Yield</p>
            <p className="text-2xl font-bold text-green-600 flex items-center gap-1">
              <Sparkles className="w-5 h-5 text-green-500" />
              €{totalYield.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex border-b border-slate-200 gap-6">
          <button
            onClick={() => setActiveTab('staged')}
            className={`pb-3 text-sm font-semibold border-b-2 ${activeTab === 'staged' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}
          >
            Staged Recommendations ({stagedItems.length})
          </button>
        </div>

        <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedItems.size === stagedItems.length && stagedItems.length > 0}
              onChange={(e) => {
                setSelectedItems(e.target.checked ? new Set(stagedItems.map(i => i.id)) : new Set());
              }}
              className="w-4 h-4 rounded text-slate-900"
            />
            <span className="text-sm font-medium text-slate-700">{selectedItems.size} selected</span>
          </div>
          <button
            onClick={approveSelected}
            disabled={selectedItems.size === 0}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-white ${
              selectedItems.size > 0 ? 'bg-slate-900 hover:bg-slate-800' : 'bg-slate-300 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
            Approve for Batch Execution
          </button>
        </div>

        <div className="space-y-4">
          {stagedItems.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-xl border p-4 transition-colors ${
                selectedItems.has(item.id) ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  checked={selectedItems.has(item.id)}
                  onChange={() => toggleSelection(item.id)}
                  className="mt-1 w-4 h-4 text-slate-900 rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-slate-500">{item.sku}</p>
                      <h3 className="font-semibold text-slate-900">{item.description}</h3>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                      {item.fulfillment_method}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-3 text-sm">
                    <div>
                      <p className="text-slate-500">Qty</p>
                      <p className="font-bold text-slate-900">{item.qty_rounded} {item.uom}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Estimated Value</p>
                      <p className="font-bold text-slate-900">€{item.estimated_total_price.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Source</p>
                      <p className="font-bold text-slate-900 truncate">
                        {item.fulfillment_method === 'STO' ? item.source_store_name : item.vendor_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Urgency</p>
                      <p className="font-medium text-red-600 truncate">{item.urgency_reason}</p>
                    </div>
                  </div>

                  {item.fulfillment_method !== 'STO' && perms.canEmergencyPO && (
                    <button
                      onClick={() => executeEmergency(item.id)}
                      className="mt-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Emergency PO Bypass (Immediate SAP Post)
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
