'use client';

// /src/app/(desktop)/admin/reconciliation/page.tsx
// SmartStock Experience V1 — Enterprise Reconciliation Console (Investigation-First)

import React, { useState } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge, StatusVariant } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { InventoryConfidenceBar } from '@/components/domain/InventoryConfidenceBar';
import { CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw, ClipboardList } from 'lucide-react';

interface ReconDiscrepancyRow {
  storeId: string;
  storeName: string;
  sku: string;
  productName: string;
  smartStockQty: number;
  sapQty: number;
  difference: number;
  confidence: number;
  pendingDamage: number;
  pendingReturns: number;
  unexplainedVariance: number;
  recommendedAction: string;
}

export default function ReconciliationConsolePage() {
  const { density } = useStoreContext();
  const [selectedRow, setSelectedRow] = useState<ReconDiscrepancyRow | null>(null);

  const sampleDiscrepancies: ReconDiscrepancyRow[] = [
    {
      storeId: '1001',
      storeName: 'Amsterdam Central',
      sku: 'MAT-00918',
      productName: 'Extra Virgin Olive Oil 1L',
      smartStockQty: 18,
      sapQty: 14,
      difference: -4,
      confidence: 42,
      pendingDamage: -2,
      pendingReturns: 1,
      unexplainedVariance: -3,
      recommendedAction: 'Trigger Physical Count Verification Task',
    },
    {
      storeId: '1002',
      storeName: 'Rotterdam Centraal',
      sku: 'AP-PRO-USB-C',
      productName: 'AirPods Pro (USB-C MagSafe)',
      smartStockQty: 8,
      sapQty: 6,
      difference: -2,
      confidence: 64,
      pendingDamage: 0,
      pendingReturns: 0,
      unexplainedVariance: -2,
      recommendedAction: 'Verify Register 02 Voided Sale #9011',
    },
    {
      storeId: '1004',
      storeName: 'Utrecht Station',
      sku: 'SKU-DRINK-001',
      productName: 'Coca Cola Zero 330ml (24 Pack)',
      smartStockQty: 48,
      sapQty: 52,
      difference: 4,
      confidence: 78,
      pendingDamage: -4,
      pendingReturns: 0,
      unexplainedVariance: 0,
      recommendedAction: 'Auto-explained: Pending SAP Goods Issue Document Post',
    },
  ];

  const columns: Column<ReconDiscrepancyRow>[] = [
    {
      key: 'storeName',
      header: 'Store',
      render: (r) => (
        <span className="font-medium text-xs text-[#101828]">
          {r.storeName} <span className="text-[10px] font-mono text-[#667085]">({r.storeId})</span>
        </span>
      ),
    },
    {
      key: 'productName',
      header: 'Product',
      render: (r) => (
        <div>
          <p className="font-semibold text-xs text-[#101828]">{r.productName}</p>
          <p className="text-[11px] font-mono text-[#667085]">{r.sku}</p>
        </div>
      ),
    },
    {
      key: 'smartStockQty',
      header: 'SmartStock',
      align: 'right',
      render: (r) => <span className="font-mono text-xs font-semibold text-[#101828]">{r.smartStockQty} CS</span>,
    },
    {
      key: 'sapQty',
      header: 'SAP Recorded',
      align: 'right',
      render: (r) => <span className="font-mono text-xs text-[#475467]">{r.sapQty} CS</span>,
    },
    {
      key: 'difference',
      header: 'Difference',
      align: 'right',
      render: (r) => (
        <span
          className={`font-mono text-xs font-bold ${
            r.difference < 0 ? 'text-[#D92D20]' : 'text-[#DC6803]'
          }`}
        >
          {r.difference > 0 ? `+${r.difference}` : r.difference} CS
        </span>
      ),
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (r) => (
        <div className="w-28">
          <InventoryConfidenceBar score={r.confidence} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="op-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge status="healthy" size="sm">
              Continuous Ledger Active
            </Badge>
            <span className="text-xs text-[#667085]">Daily Sync Cycle: 08:00 UTC</span>
          </div>
          <h1 className="text-xl font-semibold text-[#101828] tracking-tight">
            Inventory Reconciliation Console
          </h1>
          <p className="text-xs text-[#475467]">
            Reconciles ERP financial inventory checkpoints against live retail event telemetry.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-[#F9FAFB] p-3.5 rounded-[6px] border border-[#EAECF0]">
          <div className="text-right">
            <span className="text-[10px] uppercase font-semibold text-[#667085] block">
              Reconciliation Rate
            </span>
            <span className="text-2xl font-bold font-mono text-[#039855]">98.72%</span>
          </div>
        </div>
      </div>

      {/* Discrepancy Breakdown Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-center">
        <div className="op-card p-4 bg-white">
          <span className="text-[11px] font-sans text-[#667085] block">Fully Matched Records</span>
          <span className="text-lg font-bold text-[#039855]">83,921</span>
        </div>
        <div className="op-card p-4 bg-white">
          <span className="text-[11px] font-sans text-[#667085] block">Explained Variances</span>
          <span className="text-lg font-bold text-[#1570EF]">947</span>
        </div>
        <div className="op-card p-4 bg-white border-[#FECDCA] bg-[#FEF3F2]/30">
          <span className="text-[11px] font-sans text-[#D92D20] font-semibold block">
            Needs Investigation
          </span>
          <span className="text-lg font-bold text-[#D92D20]">344</span>
        </div>
      </div>

      {/* Discrepancy Table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[#101828]">Unresolved Variances (344 Items)</h2>
        <DataTable
          columns={columns}
          data={sampleDiscrepancies}
          keyExtractor={(r) => `${r.storeId}-${r.sku}`}
          density={density}
          onRowClick={(r) => setSelectedRow(r)}
        />
      </div>

      {/* Drill-down Drawer */}
      {selectedRow && (
        <Drawer
          isOpen={Boolean(selectedRow)}
          onClose={() => setSelectedRow(null)}
          title={selectedRow.productName}
          subtitle={`SKU: ${selectedRow.sku} · Store: ${selectedRow.storeName}`}
          badge={
            <Badge status="warning" size="sm">
              Variance Investigation
            </Badge>
          }
          footer={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setSelectedRow(null);
              }}
              leftIcon={<ClipboardList className="w-4 h-4" />}
            >
              Assign Physical Count Task
            </Button>
          }
        >
          <div className="space-y-6">
            {/* Reconciliation Math Matrix */}
            <div className="space-y-3 p-4 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
              <h4 className="text-xs font-semibold text-[#101828]">Variance Breakdown Calculation</h4>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between text-[#101828]">
                  <span>SmartStock Operational Estimate:</span>
                  <strong className="font-bold">{selectedRow.smartStockQty} CS</strong>
                </div>
                <div className="flex justify-between text-[#667085]">
                  <span>SAP S/4HANA Checkpoint:</span>
                  <span>{selectedRow.sapQty} CS</span>
                </div>
                <div className="flex justify-between text-[#D92D20] pt-1 border-t border-[#EAECF0]">
                  <span>Total Difference:</span>
                  <strong className="font-bold">{selectedRow.difference} CS</strong>
                </div>
              </div>
            </div>

            {/* Root Cause Explanations */}
            <div className="space-y-2 text-xs">
              <h4 className="font-semibold text-[#101828]">Explained Factor Deductions</h4>
              <div className="p-3 bg-white rounded-[6px] border border-[#EAECF0] space-y-1.5 font-mono">
                <div className="flex justify-between text-[#475467]">
                  <span>Known Pending Damage:</span>
                  <span>{selectedRow.pendingDamage} CS</span>
                </div>
                <div className="flex justify-between text-[#475467]">
                  <span>Known Inbound Returns:</span>
                  <span>+{selectedRow.pendingReturns} CS</span>
                </div>
                <div className="flex justify-between text-[#D92D20] font-bold pt-1 border-t border-[#F2F4F7]">
                  <span>Unexplained Discrepancy:</span>
                  <span>{selectedRow.unexplainedVariance} CS</span>
                </div>
              </div>
            </div>

            {/* Recommendation */}
            <div className="p-4 rounded-[6px] bg-[#E8F4F3] border border-[#14706B]/20 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-[#14706B] tracking-wider block">
                Recommended Action
              </span>
              <p className="text-xs font-semibold text-[#101828]">{selectedRow.recommendedAction}</p>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
