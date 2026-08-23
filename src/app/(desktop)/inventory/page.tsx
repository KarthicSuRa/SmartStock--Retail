'use client';

// /src/app/(desktop)/inventory/page.tsx
// SmartStock Experience RC1 — Product Record & Inventory Digital Twin Table

import React, { useState } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge, StatusVariant } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { InventoryConfidenceBar } from '@/components/domain/InventoryConfidenceBar';
import { InventoryPosition } from '@/components/domain/InventoryPosition';
import { NetworkPositionMatrix } from '@/components/domain/NetworkPositionMatrix';
import { CaseTimeline } from '@/components/domain/CaseTimeline';
import { Timeline, TimelineEvent } from '@/components/ui/Timeline';
import { UXTelemetry } from '@/lib/telemetry';
import { Search, Filter, CheckCircle2, Clock } from 'lucide-react';

interface ProductInventoryRow {
  sku: string;
  name: string;
  category: string;
  barcode: string;
  sellable: number;
  onHand: number;
  reserved: number;
  inTransit: number;
  sapRecorded: number;
  confidence: number;
  lastUpdated: string;
  status: 'HEALTHY' | 'STOCKOUT_RISK' | 'UNCERTAINTY' | 'EXPIRY_RISK';
}

export default function InventoryPage() {
  const { activeStoreId, density } = useStoreContext();
  const [search, setSearch] = useState('');
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductInventoryRow | null>(null);

  const sampleProducts: ProductInventoryRow[] = [
    {
      sku: 'AP-PRO-USB-C',
      name: 'AirPods Pro (USB-C MagSafe)',
      category: 'HIGH_VALUE',
      barcode: '8712345678901',
      sellable: 4,
      onHand: 5,
      reserved: 1,
      inTransit: 12,
      sapRecorded: 5,
      confidence: 92,
      lastUpdated: '4s ago',
      status: 'STOCKOUT_RISK',
    },
    {
      sku: 'MAT-00918',
      name: 'Extra Virgin Olive Oil 1L',
      category: 'FMCG',
      barcode: '8719912001824',
      sellable: 18,
      onHand: 19,
      reserved: 0,
      inTransit: 0,
      sapRecorded: 19,
      confidence: 43,
      lastUpdated: '12s ago',
      status: 'UNCERTAINTY',
    },
    {
      sku: 'SKU-DRINK-001',
      name: 'Coca Cola Zero 330ml Can (24 Pack)',
      category: 'FMCG',
      barcode: '5449000000996',
      sellable: 12,
      onHand: 14,
      reserved: 2,
      inTransit: 48,
      sapRecorded: 120,
      confidence: 95,
      lastUpdated: '2s ago',
      status: 'STOCKOUT_RISK',
    },
    {
      sku: 'SKU-DAIRY-009',
      name: 'Organic Fresh Whole Milk 2L',
      category: 'FMCG',
      barcode: '8710400018291',
      sellable: 31,
      onHand: 31,
      reserved: 0,
      inTransit: 30,
      sapRecorded: 31,
      confidence: 99,
      lastUpdated: '1m ago',
      status: 'HEALTHY',
    },
    {
      sku: 'MAT-33104',
      name: 'Organic Greek Yogurt 500g',
      category: 'PERISHABLES',
      barcode: '8718820019283',
      sellable: 24,
      onHand: 24,
      reserved: 0,
      inTransit: 0,
      sapRecorded: 24,
      confidence: 98,
      lastUpdated: '5m ago',
      status: 'EXPIRY_RISK',
    },
  ];

  const filtered = sampleProducts.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      search === '' ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.includes(q);
    const matchesExceptions = !exceptionsOnly || p.status !== 'HEALTHY';
    return matchesSearch && matchesExceptions;
  });

  const columns: Column<ProductInventoryRow>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (row) => (
        <div>
          <p className="font-semibold text-[#101828] text-xs">{row.name}</p>
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#667085]">
            <span>{row.sku}</span>
            <span>·</span>
            <span>EAN: {row.barcode}</span>
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'sellable',
      header: 'Sellable',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-semibold text-xs text-[#101828]">{row.sellable} CS</span>
      ),
      sortable: true,
    },
    {
      key: 'sapRecorded',
      header: 'SAP Recorded',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono text-xs ${
            row.sellable !== row.sapRecorded ? 'text-[#DC6803] font-semibold' : 'text-[#475467]'
          }`}
        >
          {row.sapRecorded} CS
        </span>
      ),
      sortable: true,
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (row) => (
        <div className="w-32">
          <InventoryConfidenceBar score={row.confidence} showBreakdown={false} />
        </div>
      ),
      sortable: true,
    },
    {
      key: 'lastUpdated',
      header: 'Freshness',
      align: 'right',
      render: (row) => <span className="font-mono text-[11px] text-[#667085]">{row.lastUpdated}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (row) => {
        const badgeStatus: Record<string, StatusVariant> = {
          HEALTHY: 'healthy',
          STOCKOUT_RISK: 'critical',
          UNCERTAINTY: 'degraded',
          EXPIRY_RISK: 'degraded',
        };
        return (
          <Badge status={badgeStatus[row.status] || 'neutral'} size="sm">
            {row.status.replace(/_/g, ' ')}
          </Badge>
        );
      },
    },
  ];

  const todayTimeline: TimelineEvent[] = [
    { id: '1', time: '08:00', title: 'SAP Nightly Checkpoint', description: 'Baseline recorded at 12 CS', actor: 'SAP S/4HANA' },
    { id: '2', time: '08:17', title: 'POS Register Sale', description: 'Transaction #8812 (-1 CS)', actor: 'POS Reg 01' },
    { id: '3', time: '08:39', title: 'POS Register Sale', description: 'Transaction #8824 (-2 CS)', actor: 'POS Reg 02' },
    { id: '4', time: '09:12', title: 'POS Register Sale', description: 'Transaction #8840 (-1 CS)', actor: 'POS Reg 01' },
    { id: '5', time: '09:58', title: 'Omnichannel Click & Collect Reservation', description: 'Order #CC-901 (-1 CS)', actor: 'E-Com Bridge' },
    { id: '6', time: '10:21', title: 'POS Register Sale', description: 'Transaction #8899 (-3 CS)', actor: 'POS Reg 03' },
    { id: '7', time: '10:30', title: 'Operational Twin Projected', description: 'Net sellable on-hand computed at 4 CS', status: 'healthy' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E4E7EC] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#101828] tracking-tight">Inventory Digital Twin</h1>
            <span className="text-[11px] font-mono text-[#667085]">Continuous Ledger</span>
          </div>
          <p className="text-xs text-[#475467] mt-0.5">
            Store {activeStoreId || '1001'} · Continuously reconciled with SAP ERP & POS streams
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              UXTelemetry.track('search_used', { metadata: { query: e.target.value } });
            }}
            placeholder="Search SKU code, barcode, or title..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#D0D5DD] rounded-[6px] text-xs text-[#101828] placeholder-[#98A2B3] focus:outline-none focus:border-[#14706B]"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-[#344054] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={exceptionsOnly}
            onChange={(e) => setExceptionsOnly(e.target.checked)}
            className="rounded border-[#D0D5DD] text-[#14706B] focus:ring-0"
          />
          <span>Exceptions only ({sampleProducts.filter((p) => p.status !== 'HEALTHY').length})</span>
        </label>
      </div>

      {/* Product Table */}
      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(r) => r.sku}
        density={density}
        onRowClick={(row) => setSelectedProduct(row)}
      />

      {/* Product Detail Drawer */}
      {selectedProduct && (
        <Drawer
          isOpen={Boolean(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
          title={selectedProduct.name}
          subtitle={`SKU: ${selectedProduct.sku} · Store ${activeStoreId || '1001'}`}
          badge={
            <Badge status={selectedProduct.status === 'HEALTHY' ? 'healthy' : 'degraded'} size="sm">
              {selectedProduct.status.replace(/_/g, ' ')}
            </Badge>
          }
        >
          <div className="space-y-6">
            {/* Operational Matrix */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-[#667085]">Operational Inventory</h4>
              <InventoryPosition
                sellable={selectedProduct.sellable}
                onHand={selectedProduct.onHand}
                reserved={selectedProduct.reserved}
                inTransit={selectedProduct.inTransit}
                sapRecorded={selectedProduct.sapRecorded}
              />
            </div>

            {/* Network Position Matrix */}
            <NetworkPositionMatrix sku={selectedProduct.sku} productName={selectedProduct.name} />

            {/* Explainable Confidence */}
            <div className="p-4 rounded-[6px] border border-[#EAECF0] bg-white">
              <InventoryConfidenceBar score={selectedProduct.confidence} showBreakdown={true} />
            </div>

            {/* Today's Chronological Timeline */}
            <div className="space-y-3 p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0]">
              <h4 className="text-xs font-semibold text-[#101828]">Today's Operational Ledger Timeline</h4>
              <Timeline events={todayTimeline} />
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
