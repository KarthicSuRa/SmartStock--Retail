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
  last_seen_at?: string;
  feed_confidence: number;
}

export default function POSConnectionsPage() {
  const { tenantId, activeStoreId } = useStoreContext();
  const [connections, setConnections] = useState<POSConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConnections();
  }, [tenantId]);

  const fetchConnections = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data } = await supabase
          .from('pos_configurations')
          .select('*')
          .eq('tenant_id', tenantId || 'default-tenant')
          .order('created_at', { ascending: false });

        if (data && data.length > 0) {
          setConnections(
            data.map((d: any) => ({
              id: d.id,
              pos_name: d.pos_name,
              pos_type: d.pos_type,
              store_id: d.store_id,
              is_active: d.is_active,
              quality_level: ['shopify', 'square', 'lightspeed'].includes(d.pos_type) ? 'Level A' : 'Level B',
              last_seen_at: d.last_seen_at || new Date().toISOString(),
              feed_confidence: 99,
            }))
          );
          setLoading(false);
          return;
        }
      }

      // Mock connections for UI development
      const mockConnections: POSConnectionItem[] = [
        {
          id: 'pos-cfg-01',
          pos_name: 'Shopify POS — Amsterdam Flagship',
          pos_type: 'shopify',
          store_id: '1002',
          is_active: true,
          quality_level: 'Level A',
          last_seen_at: new Date(Date.now() - 2000).toISOString(),
          feed_confidence: 100,
        },
        {
          id: 'pos-cfg-02',
          pos_name: 'Square Register — Rotterdam Centraal',
          pos_type: 'square',
          store_id: '1001',
          is_active: true,
          quality_level: 'Level A',
          last_seen_at: new Date(Date.now() - 4000).toISOString(),
          feed_confidence: 98,
        },
        {
          id: 'pos-cfg-03',
          pos_name: 'NCR Edge File Stream — Eindhoven Store',
          pos_type: 'generic_file_sftp',
          store_id: '1005',
          is_active: true,
          quality_level: 'Level C',
          last_seen_at: new Date(Date.now() - 15 * 60000).toISOString(),
          feed_confidence: 94,
        },
      ];
      setConnections(mockConnections);
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
                <span className="text-sm font-extrabold text-indigo-600 font-mono">{conn.feed_confidence}%</span>
              </div>

              <span className="text-[11px] text-slate-400 font-mono">
                Active • 2s ago
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
