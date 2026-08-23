'use client';

// /src/app/(desktop)/admin/dead-letter/page.tsx
// SmartStock LiveRetail V2 — Dead Letter Outbox Management & Manual Recovery

import React, { useState, useEffect } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  AlertTriangle, RotateCcw, CheckCircle2, XCircle,
  FileText, ShieldAlert, RefreshCw, Edit3
} from 'lucide-react';

interface DeadLetterItem {
  id: string;
  job_type: string;
  reference_type: string;
  reference_id: string;
  error_message: string;
  attempts: number;
  payload: Record<string, any>;
  failed_at: string;
}

export default function DeadLetterConsolePage() {
  const { tenantId } = useStoreContext();
  const [items, setItems] = useState<DeadLetterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDeadLetters();
  }, [tenantId]);

  const fetchDeadLetters = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data } = await supabase
          .from('integration_outbox')
          .select('*')
          .eq('status', 'DEAD_LETTER')
          .order('updated_at', { ascending: false });

        if (data && data.length > 0) {
          setItems(data.map((d: any) => ({
            id: d.id,
            job_type: d.job_type,
            reference_type: d.reference_type,
            reference_id: d.reference_id,
            error_message: d.last_error || 'Maximum retry limit exceeded',
            attempts: d.attempts || 5,
            payload: d.payload || {},
            failed_at: d.updated_at,
          })));
          setLoading(false);
          return;
        }
      }

      // Mock dead letter items for local development / unconfigured state
      const mockItems: DeadLetterItem[] = [
        {
          id: 'dl-01',
          job_type: 'CREATE_SAP_PO',
          reference_type: 'PURCHASE_ORDER',
          reference_id: 'PO-REC-8841',
          error_message: 'ME 085: Vendor VEND-9999 is blocked for purchasing organization 1000',
          attempts: 5,
          payload: { Material: 'MAT-20349', Supplier: 'VEND-9999', Quantity: 120 },
          failed_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
        },
        {
          id: 'dl-02',
          job_type: 'POST_SAP_SCRAP',
          reference_type: 'SCRAP_ADJUSTMENT',
          reference_id: 'SCRAP-00291',
          error_message: 'M7 021: Storage location 0099 not maintained in plant 1001',
          attempts: 5,
          payload: { Material: 'MAT-00918', Plant: '1001', StorageLocation: '0099', Quantity: 4 },
          failed_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
        },
      ];
      setItems(mockItems);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (item: DeadLetterItem) => {
    setRetryingId(item.id);
    try {
      if (isSupabaseConfigured) {
        // Reset status to RETRYING and reset attempts
        await supabase
          .from('integration_outbox')
          .update({
            status: 'RETRYING',
            attempts: 0,
            last_error: null,
            next_retry_at: new Date().toISOString(),
          })
          .eq('id', item.id);
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 text-white rounded-3xl p-6 shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-extrabold uppercase">
              Dead Letter Outbox Queue
            </span>
            <span className="text-xs text-slate-400">{items.length} Jobs Requiring Review</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-2">Integration Dead Letter Queue</h1>
          <p className="text-xs text-slate-400 mt-1">
            Outbound ERP postings that exceeded maximum retry attempts or encountered business validation rejections.
          </p>
        </div>

        <button
          onClick={fetchDeadLetters}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-2 border border-white/10"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Cards */}
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">Zero Dead Letter Items</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            All outbound SAP STO and Scrap integration messages have been successfully posted and acknowledged.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-rose-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-start justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-extrabold">
                    {item.job_type}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-900">{item.reference_id}</span>
                  <span className="text-xs text-slate-400 font-mono">({item.attempts} attempts)</span>
                </div>

                <p className="text-xs text-rose-900 font-semibold">{item.error_message}</p>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 font-mono text-[11px] text-slate-600">
                  <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                </div>

                <span className="text-[11px] text-slate-400 font-mono block">
                  Last Failed: {new Date(item.failed_at).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRetry(item)}
                  disabled={retryingId === item.id}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${retryingId === item.id ? 'animate-spin' : ''}`} />
                  <span>{retryingId === item.id ? 'Queueing...' : 'Retry Job'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
