// src/app/(dashboard)/floor/scan/page.tsx

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRealtimeInventory } from '@/hooks/useRealtimeInventory';
import { useStoreContext } from '@/hooks/useStoreContext';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { ProductionBarcodeScanner, ScanResult } from '@/components/scanner/ProductionBarcodeScanner';
import { SyncStatusBar } from '@/components/layout/SyncStatusBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { ArrowLeft, ClipboardCheck, Layers } from 'lucide-react';

export default function ScanPage() {
  const router = useRouter();
  const { activeStoreId, tenantId } = useStoreContext();
  const { items, lastUpdate } = useRealtimeInventory();
  const { enqueue, pendingCount } = useOfflineQueue();

  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [batchItems, setBatchItems] = useState<ScanResult[]>([]);
  const [adjustmentDone, setAdjustmentDone] = useState(false);

  const handleScan = (result: ScanResult) => {
    setLastResult(result);
    // Enqueue stock adjustment for offline sync
    if (!result.isUnknown) {
      enqueue({
        type: 'DAMAGE_LOG',
        payload: {
          tenant_id: tenantId,
          store_id: activeStoreId,
          sku: result.sku,
          material_id: result.materialId,
          quantity: result.quantityMultiplier,
          weight_kg: result.extractedWeight,
          scanned_at: new Date().toISOString(),
        }
      });
    }
  };

  const handleBatchComplete = (results: ScanResult[]) => {
    setBatchItems(results);
    results.forEach(r => {
      if (!r.isUnknown) {
        enqueue({
          type: 'DAMAGE_LOG',
          payload: {
            tenant_id: tenantId,
            store_id: activeStoreId,
            sku: r.sku,
            material_id: r.materialId,
            quantity: r.quantityMultiplier,
            scanned_at: new Date().toISOString(),
          }
        });
      }
    });
    setAdjustmentDone(true);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <SyncStatusBar lastSync={lastUpdate} />

      {/* Mode selector header */}
      <header className="px-4 py-3 bg-white border-b flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setMode('single')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Single Scan
          </button>
          <button
            onClick={() => setMode('batch')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'batch' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
          >
            <Layers className="w-3.5 h-3.5" />
            Batch Mode
          </button>
        </div>
        {pendingCount > 0 && (
          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-1 rounded-full">
            {pendingCount} queued
          </span>
        )}
      </header>

      <div className="flex-1 overflow-hidden">
        <ProductionBarcodeScanner
          mode={mode}
          onScan={handleScan}
          onBatchComplete={handleBatchComplete}
        />
      </div>

      <BottomNav role="floor_staff" />
    </div>
  );
}
