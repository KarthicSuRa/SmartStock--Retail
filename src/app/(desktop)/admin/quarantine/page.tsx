'use client';

// /src/app/(desktop)/admin/quarantine/page.tsx
// SmartStock Experience — Identity Quarantine & Interactive Safe Replay Console

import React, { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Database,
  X,
  Play,
  Check,
  Search
} from 'lucide-react';

interface QuarantineItem {
  id: string;
  quarantineType: 'PRODUCT_MAPPING_REQUIRED' | 'LOCATION_MAPPING_REQUIRED' | 'UOM_MAPPING_REQUIRED';
  externalId: string;
  sourceSystem: string;
  occurrenceCount: number;
  suggestedTarget: string;
  status: 'PENDING' | 'RESOLVED';
  lastSeen: string;
}

export default function QuarantinePage() {
  const { toast } = useToast();
  const [items, setItems] = useState<QuarantineItem[]>([
    {
      id: 'q-01',
      quarantineType: 'PRODUCT_MAPPING_REQUIRED',
      externalId: 'SHP_VAR_992141',
      sourceSystem: 'SHOPIFY',
      occurrenceCount: 14,
      suggestedTarget: 'AP-PRO-USB-C',
      status: 'PENDING',
      lastSeen: '12 min ago',
    },
    {
      id: 'q-02',
      quarantineType: 'LOCATION_MAPPING_REQUIRED',
      externalId: 'STORE_CODE_UTR_EAST',
      sourceSystem: 'SQUARE',
      occurrenceCount: 6,
      suggestedTarget: 'Store 1004 (Utrecht Station)',
      status: 'PENDING',
      lastSeen: '45 min ago',
    },
    {
      id: 'q-03',
      quarantineType: 'UOM_MAPPING_REQUIRED',
      externalId: 'PK12',
      sourceSystem: 'NCR_SFTP',
      occurrenceCount: 2,
      suggestedTarget: '12 CS (Pack 12)',
      status: 'PENDING',
      lastSeen: '1h ago',
    },
  ]);

  const [activeModalItem, setActiveModalItem] = useState<QuarantineItem | null>(null);
  const [targetOverride, setTargetOverride] = useState<string>('');
  const [isReplaying, setIsReplaying] = useState(false);

  const handleOpenMapModal = (item: QuarantineItem) => {
    setActiveModalItem(item);
    setTargetOverride(item.suggestedTarget);
  };

  const handleExecuteReplay = () => {
    if (!activeModalItem) return;
    setIsReplaying(true);

    setTimeout(() => {
      const resolvedId = activeModalItem.id;
      const extId = activeModalItem.externalId;
      const count = activeModalItem.occurrenceCount;

      setItems((prev) =>
        prev.map((item) =>
          item.id === resolvedId ? { ...item, status: 'RESOLVED' as const } : item
        )
      );

      setIsReplaying(false);
      setActiveModalItem(null);

      toast({
        type: 'success',
        title: 'Identity Mapped & Replay Completed',
        description: `Successfully mapped ${extId} to "${targetOverride}". ${count} held transactions reprocessed into the digital twin ledger.`,
      });
    }, 700);
  };

  const pendingItems = items.filter((i) => i.status === 'PENDING');
  const resolvedItems = items.filter((i) => i.status === 'RESOLVED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="op-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#14706B]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge status={pendingItems.length > 0 ? 'warning' : 'healthy'} size="sm">
              {pendingItems.length > 0 ? `${pendingItems.length} Unresolved Identities` : 'All Quarantines Cleared'}
            </Badge>
            <span className="text-xs font-mono text-[#667085]">POS Ingestion Protection Layer</span>
          </div>
          <h1 className="text-xl font-bold text-[#101828] tracking-tight">Unresolved Identity Quarantine Store</h1>
          <p className="text-xs text-[#475467]">
            Holds transactions with unmapped external SKUs, storage locations, or UOMs safely to prevent ledger corruption.
          </p>
        </div>
      </div>

      {/* Main Table */}
      <div className="op-card bg-white overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#EAECF0] flex items-center justify-between">
          <h2 className="text-xs font-bold text-[#101828] uppercase tracking-wider">Quarantined Streams & Identity Mappings</h2>
          <span className="text-xs font-mono text-[#667085]">Total Held Events: {items.reduce((acc, i) => acc + (i.status === 'PENDING' ? i.occurrenceCount : 0), 0)}</span>
        </div>

        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#EAECF0] bg-[#F9FAFB] text-[#667085]">
              <th className="py-3 px-4 font-semibold">Quarantine Reason</th>
              <th className="py-3 px-4 font-semibold">Unresolved Source ID</th>
              <th className="py-3 px-4 font-semibold">Source POS</th>
              <th className="py-3 px-4 font-semibold text-right">Held Events</th>
              <th className="py-3 px-4 font-semibold">Suggested SmartStock Target</th>
              <th className="py-3 px-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAECF0]">
            {items.map((r) => {
              const isResolved = r.status === 'RESOLVED';

              return (
                <tr key={r.id} className={isResolved ? 'bg-emerald-50/30' : 'hover:bg-[#F9FAFB]'}>
                  <td className="py-3.5 px-4">
                    <Badge status={isResolved ? 'healthy' : 'warning'} size="sm">
                      {isResolved ? 'REPLAY RESOLVED' : r.quarantineType.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#101828]">{r.externalId}</td>
                  <td className="py-3.5 px-4 text-[#475467] font-semibold">{r.sourceSystem}</td>
                  <td className="py-3.5 px-4 font-mono text-right font-bold text-[#101828]">{r.occurrenceCount}</td>
                  <td className="py-3.5 px-4">
                    <span className="text-xs font-mono text-[#14706B] bg-[#E8F4F3] px-2 py-0.5 rounded border border-[#14706B]/20">
                      {r.suggestedTarget}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {isResolved ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-100 px-2.5 py-1 rounded-md">
                        <Check className="w-3.5 h-3.5" />
                        <span>Replayed</span>
                      </span>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleOpenMapModal(r)}
                      >
                        Map & Replay
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── INTERACTIVE MAPPING & REPLAY MODAL ── */}
      {activeModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#E8F4F3] text-[#14706B] flex items-center justify-center font-bold">
                  <Play className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Map Identity & Replay Transactions</h3>
                  <p className="text-[11px] text-slate-500 font-mono">Source: {activeModalItem.sourceSystem}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-amber-900">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Unresolved Identifier: {activeModalItem.externalId}</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  {activeModalItem.occurrenceCount} sales/inventory transactions are safely held in quarantine.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                  Map to SmartStock Master Entity:
                </label>
                <input
                  type="text"
                  value={targetOverride}
                  onChange={(e) => setTargetOverride(e.target.value)}
                  placeholder="e.g. AP-PRO-USB-C"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-[#14706B]"
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-700 block text-[11px]">Replay Actions to Execute:</span>
                <ul className="space-y-1 text-slate-600 text-[11px] font-mono">
                  <li>✓ Persist identity mapping rule for all future incoming events</li>
                  <li>✓ Reprocess all {activeModalItem.occurrenceCount} queued event envelopes through canonical validator</li>
                  <li>✓ Deduct sales from active inventory ledger and update SAP outbox</li>
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setActiveModalItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteReplay}
                disabled={isReplaying || !targetOverride.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-[#14706B] hover:bg-[#0E5652] disabled:opacity-50 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                {isReplaying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Replaying events...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Confirm Mapping & Replay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
