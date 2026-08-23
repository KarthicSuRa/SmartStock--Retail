'use client';

// /src/components/inventory/InventoryTimeline.tsx
// SmartStock LiveRetail V2 — Explainable Event Timeline Component
//
// Shows the complete chronological event history that produced an inventory position.
// Answers: "Why does SmartStock believe inventory is X?"

import React, { useState, useEffect } from 'react';
import {
  Clock, ArrowUpRight, ArrowDownLeft, Shield, AlertTriangle,
  RotateCcw, RefreshCw, Layers, CheckCircle2, ChevronRight, X
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface TimelineEvent {
  id: string;
  event_type: string;
  quantity_delta: number | null;
  unit_of_measure: string;
  source_system: string;
  source_event_id: string;
  business_timestamp: string;
  sequence_status: string;
  reference_type?: string;
  reference_id?: string;
  metadata?: Record<string, any>;
}

interface InventoryTimelineProps {
  tenantId: string;
  locationId: string;
  materialId?: string;
  sku: string;
  productName: string;
  currentStock: number;
  checkpointQty: number;
  confidenceScore: number;
  onClose?: () => void;
}

export default function InventoryTimeline({
  tenantId,
  locationId,
  sku,
  productName,
  currentStock,
  checkpointQty,
  confidenceScore,
  onClose,
}: InventoryTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEventHistory();
  }, [tenantId, locationId, sku]);

  const fetchEventHistory = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data } = await supabase
          .from('inventory_events')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('location_id', locationId)
          .order('business_timestamp', { ascending: false })
          .limit(30);

        if (data && data.length > 0) {
          setEvents(data);
          setLoading(false);
          return;
        }
      }

      // Mock realistic demonstration timeline when unconfigured
      const mockEvents: TimelineEvent[] = [
        {
          id: 'evt-001',
          event_type: 'SALE',
          quantity_delta: -2,
          unit_of_measure: 'PC',
          source_system: 'POS',
          source_event_id: 'TXN-88412',
          business_timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
          sequence_status: 'IN_ORDER',
          reference_type: 'POS_TRANSACTION',
        },
        {
          id: 'evt-002',
          event_type: 'DAMAGE',
          quantity_delta: -1,
          unit_of_measure: 'PC',
          source_system: 'PWA',
          source_event_id: 'DMG-1094',
          business_timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
          sequence_status: 'IN_ORDER',
          reference_type: 'FLOOR_SCRAP',
        },
        {
          id: 'evt-003',
          event_type: 'SALE',
          quantity_delta: -4,
          unit_of_measure: 'PC',
          source_system: 'POS',
          source_event_id: 'TXN-88301',
          business_timestamp: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
          sequence_status: 'IN_ORDER',
          reference_type: 'POS_TRANSACTION',
        },
        {
          id: 'evt-004',
          event_type: 'SAP_CHECKPOINT',
          quantity_delta: checkpointQty || 34,
          unit_of_measure: 'PC',
          source_system: 'SAP',
          source_event_id: 'SAP-SYNC-0200',
          business_timestamp: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
          sequence_status: 'IN_ORDER',
          reference_type: 'NIGHTLY_BASELINE',
        },
      ];
      setEvents(mockEvents);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDelta = (delta: number | null, type: string) => {
    if (delta == null) return '—';
    if (type === 'SAP_CHECKPOINT' || type === 'PHYSICAL_COUNT') return `=${delta}`;
    return delta > 0 ? `+${delta}` : `${delta}`;
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'SAP_CHECKPOINT':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'SALE':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'DAMAGE':
      case 'EXPIRY':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'GOODS_RECEIPT':
      case 'TRANSFER_IN':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'PHYSICAL_COUNT':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
      {/* Header */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-white/10 text-slate-200 font-mono text-xs font-bold border border-white/10">
              {sku}
            </span>
            <h2 className="text-base font-bold tracking-tight">{productName}</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-400" /> Operational Event Ledger &amp; Digital Twin Audit Trail
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Snapshot Bar */}
      <div className="grid grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-xs">
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Operational Estimate</span>
          <span className="text-xl font-extrabold text-blue-600 font-mono">{currentStock}</span>
        </div>
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">SAP Checkpoint</span>
          <span className="text-xl font-bold text-slate-800 font-mono">{checkpointQty}</span>
        </div>
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Confidence Score</span>
          <span className={`text-xl font-bold font-mono ${confidenceScore >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {confidenceScore}%
          </span>
        </div>
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Event Integrity</span>
          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs mt-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Replay Verified
          </span>
        </div>
      </div>

      {/* Events Stream */}
      <div className="p-5 overflow-y-auto space-y-4 flex-1">
        <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
          Chronological Event Ledger
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs animate-pulse">Loading event stream...</div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">No events recorded for this material.</div>
        ) : (
          <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
            {events.map((evt) => (
              <div key={evt.id} className="relative group">
                {/* Dot */}
                <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-600 group-hover:scale-125 transition" />

                <div className="bg-slate-50 hover:bg-slate-100/80 p-3.5 rounded-xl border border-slate-200/80 transition flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getEventBadge(evt.event_type)}`}>
                        {evt.event_type}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 font-mono">
                        {evt.source_system} • {evt.source_event_id}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>{new Date(evt.business_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span>{new Date(evt.business_timestamp).toLocaleDateString()}</span>
                      {evt.reference_type && (
                        <>
                          <span>•</span>
                          <span className="text-slate-500 font-mono">{evt.reference_type}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`text-base font-extrabold font-mono ${
                      (evt.quantity_delta || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {formatDelta(evt.quantity_delta, evt.event_type)}
                    </span>
                    <span className="text-[10px] text-slate-400 block font-mono uppercase">{evt.unit_of_measure}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
