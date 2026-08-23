'use client';

// /src/app/(desktop)/admin/pos-control-tower/page.tsx
// SmartStock Experience V1 — Standardized POS Integration Control Tower

import React, { useState } from 'react';
import Link from 'next/link';
import { IntegrationHealthRow, IntegrationHealthData } from '@/components/domain/IntegrationHealthRow';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Plus, RefreshCw, Layers, ShieldCheck, Activity } from 'lucide-react';

export default function POSControlTowerPage() {
  const [selectedFeed, setSelectedFeed] = useState<IntegrationHealthData | null>(null);

  const feeds: IntegrationHealthData[] = [
    {
      id: 'feed-01',
      name: 'Shopify POS — Amsterdam Flagship',
      type: 'POS',
      targetSystem: 'SHOPIFY_WEBHOOK',
      status: 'HEALTHY',
      lastEventTime: '2 sec ago',
      lastReconciledTime: '4 min ago',
      feedConfidence: 100,
      mappingRate: 100,
      activeErrors: 0,
      isShadowMode: false,
    },
    {
      id: 'feed-02',
      name: 'Square Register — Rotterdam Centraal',
      type: 'POS',
      targetSystem: 'SQUARE_REST_POLLING',
      status: 'HEALTHY',
      lastEventTime: '5 sec ago',
      lastReconciledTime: '5 min ago',
      feedConfidence: 98,
      mappingRate: 99.4,
      activeErrors: 0,
      isShadowMode: false,
    },
    {
      id: 'feed-03',
      name: 'Clover Register — Utrecht Station',
      type: 'POS',
      targetSystem: 'CLOVER_PLATFORM',
      status: 'HEALTHY',
      lastEventTime: '12 sec ago',
      lastReconciledTime: '10 min ago',
      feedConfidence: 99,
      mappingRate: 100,
      activeErrors: 0,
      isShadowMode: true,
    },
    {
      id: 'feed-04',
      name: 'NCR File Feed — Eindhoven Store',
      type: 'FILE_FEED',
      targetSystem: 'SFTP_CSV_BATCH',
      status: 'STALE',
      lastEventTime: '1h 14m ago',
      lastReconciledTime: '1h ago',
      feedConfidence: 68,
      mappingRate: 88.5,
      activeErrors: 3,
      isShadowMode: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E4E7EC] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#101828] tracking-tight">
            POS Connectivity Control Tower
          </h1>
          <p className="text-xs text-[#475467] mt-0.5">
            Real-time feed telemetry, push/pull reconciliation status, and shadow mode validation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/admin/pos-connections/new">
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Connect New POS
            </Button>
          </Link>
        </div>
      </div>

      {/* Feed List */}
      <div className="space-y-3">
        {feeds.map((feed) => (
          <IntegrationHealthRow
            key={feed.id}
            integration={feed}
            onInspect={(f) => setSelectedFeed(f)}
          />
        ))}
      </div>

      {/* Feed Inspection Detail Drawer */}
      {selectedFeed && (
        <Drawer
          isOpen={Boolean(selectedFeed)}
          onClose={() => setSelectedFeed(null)}
          title={selectedFeed.name}
          subtitle={`Type: ${selectedFeed.targetSystem}`}
          badge={
            <Badge status={selectedFeed.status === 'HEALTHY' ? 'healthy' : 'warning'} size="sm">
              {selectedFeed.status}
            </Badge>
          }
        >
          <div className="space-y-6 text-xs">
            {/* Telemetry Matrix */}
            <div className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-2">
              <h4 className="font-semibold text-[#101828]">Feed Ingestion Metrics</h4>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-[#667085] block">Feed Quality Score</span>
                  <strong className="text-[#039855] text-sm">{selectedFeed.feedConfidence}%</strong>
                </div>
                <div>
                  <span className="text-[#667085] block">Mapping Coverage</span>
                  <strong className="text-[#101828] text-sm">{selectedFeed.mappingRate}%</strong>
                </div>
                <div>
                  <span className="text-[#667085] block">Last Event Timestamp</span>
                  <strong className="text-[#101828]">{selectedFeed.lastEventTime}</strong>
                </div>
                <div>
                  <span className="text-[#667085] block">Last Reconciliation Run</span>
                  <strong className="text-[#101828]">{selectedFeed.lastReconciledTime}</strong>
                </div>
              </div>
            </div>

            {/* Shadow Mode Info if Active */}
            {selectedFeed.isShadowMode && (
              <div className="p-4 rounded-[6px] bg-[#F2F4F7] border border-[#D0D5DD] space-y-1">
                <span className="text-[10px] font-mono font-semibold uppercase text-[#475467]">
                  Shadow Mode In Progress
                </span>
                <p className="text-xs text-[#344054]">
                  Transactions are being parsed and reduced against digital twin rules without modifying live store inventory.
                </p>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}
