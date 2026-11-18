'use client';

// /src/app/(desktop)/admin/pos-connections/page.tsx
// SmartStock LiveRetail V2 — POS Connections Directory & Management

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useStoreContext } from '@/hooks/useStoreContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  Plug, Plus, CheckCircle2, AlertTriangle, ArrowRight,
  RefreshCw, Radio, HardDrive, ShoppingBag, ShieldCheck
} from 'lucide-react';

interface POSConnectionItem {
  id: string;
  pos_name: string;
  pos_type: string;
  store_id: string;
  is_active: boolean;
  quality_level: string;
  last_seen_at?: string | null;
  feed_confidence: number | null;
}

export default function POSConnectionsPage() {
  const { tenantId } = useStoreContext();
  const [connections, setConnections] = useState<POSConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConnections();
  }, [tenantId]);

  const fetchConnections = async () => {
    setLoading(true);
    try {
      if (!isSupabaseConfigured || !tenantId) {
        setConnections([]);
        return;
      }

      const { data } = await supabase
        .from('pos_configurations')
        .select('id, pos_name, pos_type, store_id, is_active, last_seen_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!data || data.length === 0) {
        setConnections([]);
        return;
      }

      const configIds = data.map((d: any) => d.id);
      const { data: healthRows } = await supabase
        .from('pos_feed_health')
        .select('pos_config_id, feed_confidence, last_event_at')
        .in('pos_config_id', configIds);

      const healthByConfig = new Map(
        (healthRows ?? []).map((h: any) => [h.pos_config_id, h])
      );

      setConnections(
        data.map((d: any) => {
          const health: any = healthByConfig.get(d.id);
          return {
            id: d.id,
            pos_name: d.pos_name,
            pos_type: d.pos_type,
            store_id: d.store_id,
            is_active: d.is_active,
            quality_level: ['shopify', 'square', 'lightspeed'].includes(d.pos_type)
              ? 'Level B (Webhook)'
              : 'Custom',
            last_seen_at: health?.last_event_at ?? d.last_seen_at ?? null,
            feed_confidence:
              typeof health?.feed_confidence === 'number' ? health.feed_confidence : null,
          };
        })
      );
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-extrabold uppercase">
              POS Interoperability Gateway
            </span>
            <span className="text-xs text-slate-400">{connections.length} Active Connections</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-2">Point of Sale Integrations</h1>
          <p className="text-xs text-slate-400 mt-1">
            Standardized retail transaction feeds streaming from cloud webhooks, store edge agents, and file drops.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/pos-connections/new"
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold transition flex items-center gap-2 shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Connect New POS</span>
          </Link>
        </div>
      </div>

      {/* Connection Cards */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center text-xs text-slate-500">
          Loading POS connections...
        </div>
      ) : connections.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-2">
          <p className="text-sm font-bold text-slate-800">No POS integrations configured</p>
          <p className="text-xs text-slate-500">
            Add a Shopify, Square, Lightspeed X-Series, or generic webhook connection to begin ingesting POS events.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-extrabold uppercase tracking-wider">
                    {conn.pos_type}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                    {conn.quality_level}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900">{conn.pos_name}</h3>
                <p className="text-xs text-slate-500 font-mono">Store ID: {conn.store_id}</p>
              </div>

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-mono uppercase block">Feed Confidence</span>
                  <span className="text-sm font-extrabold text-indigo-600 font-mono">
                    {conn.feed_confidence !== null ? `${conn.feed_confidence}%` : 'Not reported'}
                  </span>
                </div>

                <span className="text-[11px] text-slate-400 font-mono">
                  {conn.last_seen_at
                    ? `Last event: ${new Date(conn.last_seen_at).toLocaleString()}`
                    : conn.is_active
                    ? 'Active • No events yet'
                    : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
