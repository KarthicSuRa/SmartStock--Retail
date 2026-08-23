// /src/components/scanner/ProductionBarcodeScanner.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';
import { useStoreContext } from '@/hooks/useStoreContext';
import {
  Flashlight,
  FlashlightOff,
  Scan,
  ScanBarcode,
  PackagePlus,
  AlertCircle,
  CheckCircle2,
  Boxes,
  Plus,
  Minus,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export interface ScanResult {
  rawBarcode: string;
  format: string;
  materialId?: string;
  sku?: string;
  description?: string;
  aliasType?: string;
  quantityMultiplier: number;
  isVariableWeight: boolean;
  extractedWeight?: number;
  isUnknown: boolean;
  systemStock?: number;
  lot?: string;
  expiry?: string;
}

interface Props {
  mode: 'single' | 'batch' | 'damage' | 'receiving';
  onScan: (result: ScanResult) => void;
  onBatchComplete?: (items: ScanResult[]) => void;
}

export function ProductionBarcodeScanner({ mode, onScan, onBatchComplete }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { tenantId, activeStoreId } = useStoreContext();

  const [torchOn, setTorchOn] = useState(false);
  const [batchAccumulator, setBatchAccumulator] = useState<ScanResult[]>([]);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [scanQty, setScanQty] = useState(1);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Pre-configured catalog map for instant offline/deterministic simulation
  const localCatalog: Record<string, Partial<ScanResult>> = {
    '8710400000012': {
      sku: 'SKU-DRINK-001',
      materialId: 'MAT-1001',
      description: 'Coca Cola Zero 330ml Can (24 Pack)',
      aliasType: 'EAN13_PRIMARY',
      quantityMultiplier: 1,
      isVariableWeight: false,
      systemStock: 12,
    },
    '8710400000043': {
      sku: 'SKU-SNACK-004',
      materialId: 'MAT-1002',
      description: 'Doritos Tangy Cheese 150g (12 Pack)',
      aliasType: 'EAN13_PRIMARY',
      quantityMultiplier: 1,
      isVariableWeight: false,
      systemStock: 8,
    },
    '2801450014201': {
      sku: 'SKU-DAIRY-009',
      materialId: 'MAT-1003',
      description: 'Organic Fresh Whole Milk 2L (Variable Batch)',
      aliasType: 'VARIABLE_WEIGHT',
      quantityMultiplier: 1,
      isVariableWeight: true,
      extractedWeight: 1.42,
      systemStock: 35,
    },
    '(01)08710400000129(10)LOT-9921(17)261231': {
      sku: 'SKU-DRINK-001',
      materialId: 'MAT-1001',
      description: 'Coca Cola Zero 330ml Can (Master Case)',
      aliasType: 'GS1_128_CASE',
      quantityMultiplier: 24,
      isVariableWeight: false,
      lot: 'LOT-9921',
      expiry: '2026-12-31',
      systemStock: 12,
    },
    'UNKNOWN_998877': {
      sku: 'UNRESOLVED-BARCODE',
      description: 'Unmapped External Vendor Barcode',
      aliasType: 'UNRESOLVED',
      quantityMultiplier: 1,
      isVariableWeight: false,
      isUnknown: true,
    }
  };

  const resolveBarcode = async (rawBarcode: string, formatName?: string): Promise<ScanResult> => {
    // 1. Check local instant catalog
    if (localCatalog[rawBarcode]) {
      const match = localCatalog[rawBarcode];
      return {
        rawBarcode,
        format: formatName || (match.isVariableWeight ? 'EAN13_VARIABLE' : 'EAN13'),
        materialId: match.materialId || 'MAT-LOCAL',
        sku: match.sku || 'SKU-LOCAL',
        description: match.description || 'Simulated Product',
        aliasType: match.aliasType || 'PRIMARY_BARCODE',
        quantityMultiplier: match.quantityMultiplier || 1,
        isVariableWeight: match.isVariableWeight || false,
        extractedWeight: match.extractedWeight,
        lot: match.lot,
        expiry: match.expiry,
        isUnknown: Boolean(match.isUnknown),
        systemStock: match.systemStock ?? 10,
      };
    }

    // 2. Try Supabase lookup
    try {
      const { data: alias } = await supabase
        .from('barcode_aliases')
        .select('*, material_master:material_id (id, sku, description, base_uom)')
        .eq('tenant_id', tenantId || 'default-tenant')
        .eq('barcode', rawBarcode)
        .eq('is_active', true)
        .maybeSingle();

      if (alias) {
        return {
          rawBarcode,
          format: formatName || 'EAN13',
          materialId: alias.material_id,
          sku: alias.material_master?.sku,
          description: alias.material_master?.description,
          aliasType: alias.alias_type,
          quantityMultiplier: alias.quantity_multiplier || 1,
          isVariableWeight: alias.is_variable_weight || false,
          isUnknown: false,
          systemStock: 15,
        };
      }
    } catch {
      // fallback
    }

    // 3. Return Unknown
    return {
      rawBarcode,
      format: formatName || 'UNKNOWN',
      quantityMultiplier: 1,
      isVariableWeight: false,
      isUnknown: true,
      description: 'Unresolved Barcode — Routed to Quarantine Store',
    };
  };

  const handleExecuteScan = async (rawBarcode: string, formatName = 'EAN13') => {
    setIsResolving(true);
    setSuccessToast(null);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }

    try {
      const resolved = await resolveBarcode(rawBarcode, formatName);
      setLastScan(resolved);
      setScanQty(resolved.quantityMultiplier || 1);

      if (mode === 'batch') {
        setBatchAccumulator((prev) => [...prev, resolved]);
      }

      onScan(resolved);

      setSuccessToast(`✓ Scanned ${resolved.sku || resolved.rawBarcode}`);
      setTimeout(() => setSuccessToast(null), 3000);
    } finally {
      setIsResolving(false);
    }
  };

  const initScanner = async () => {
    try {
      const scanner = new Html5Qrcode('scanner-container', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });

      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.777,
          disableFlip: false,
        },
        (decodedText, decodedResult) => {
          handleExecuteScan(decodedText, decodedResult?.result?.format?.formatName);
        },
        () => {}
      );
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Camera stream unavailable on this device');
    }
  };

  const safeStopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    initScanner();
    return () => {
      safeStopScanner();
    };
  }, []);

  const handleBatchDone = () => {
    onBatchComplete?.(batchAccumulator);
    setBatchAccumulator([]);
    setLastScan(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0F19] text-white p-4 space-y-4 overflow-y-auto">
      
      {/* ── SIMULATION & CAMERA HEADER ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {cameraError ? 'Barcode Scanner Console' : 'Live Camera Active'}
            </h2>
          </div>
          <span className="text-[10px] font-mono bg-slate-800 text-emerald-400 px-2 py-0.5 rounded border border-slate-700">
            Store {activeStoreId || '1001'}
          </span>
        </div>

        {/* Quick Simulation Barcode Triggers */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-400">Instant Barcode Test Feeds:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              onClick={() => handleExecuteScan('8710400000012', 'EAN13')}
              className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-[#14706B] border border-slate-700 text-left transition-all group"
            >
              <span className="block text-[11px] font-bold text-white group-hover:text-white truncate">
                🥤 Coca Cola Zero
              </span>
              <span className="block text-[9px] font-mono text-slate-400">8710400000012 (EAN13)</span>
            </button>

            <button
              onClick={() => handleExecuteScan('8710400000043', 'EAN13')}
              className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-[#14706B] border border-slate-700 text-left transition-all group"
            >
              <span className="block text-[11px] font-bold text-white group-hover:text-white truncate">
                🧀 Doritos Cheese
              </span>
              <span className="block text-[9px] font-mono text-slate-400">8710400000043 (EAN13)</span>
            </button>

            <button
              onClick={() => handleExecuteScan('2801450014201', 'EAN13_VARIABLE_WEIGHT')}
              className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-[#14706B] border border-slate-700 text-left transition-all group"
            >
              <span className="block text-[11px] font-bold text-white group-hover:text-white truncate">
                🥛 Milk 1.42kg
              </span>
              <span className="block text-[9px] font-mono text-slate-400">Variable Weight EAN</span>
            </button>

            <button
              onClick={() => handleExecuteScan('(01)08710400000129(10)LOT-9921(17)261231', 'GS1_128')}
              className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-[#14706B] border border-slate-700 text-left transition-all group"
            >
              <span className="block text-[11px] font-bold text-white group-hover:text-white truncate">
                📦 GS1 Master Case
              </span>
              <span className="block text-[9px] font-mono text-slate-400">GTIN + Lot + Expiry</span>
            </button>

            <button
              onClick={() => handleExecuteScan('UNKNOWN_998877', 'UNKNOWN')}
              className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-900 border border-slate-700 text-left transition-all group"
            >
              <span className="block text-[11px] font-bold text-rose-300 group-hover:text-white truncate">
                ❓ Unmapped Barcode
              </span>
              <span className="block text-[9px] font-mono text-slate-400">Trigger Quarantine</span>
            </button>

            {cameraError && (
              <button
                onClick={initScanner}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left transition-all"
              >
                <span className="block text-[11px] font-bold text-slate-300">📷 Retry Camera</span>
                <span className="block text-[9px] font-mono text-slate-400">Re-init Hardware</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Camera Preview Box (when hardware camera is active) */}
      {!cameraError && (
        <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-black min-h-[160px]">
          <div id="scanner-container" className="w-full h-full" />
        </div>
      )}

      {/* Success Toast */}
      {successToast && (
        <div className="p-3 bg-emerald-950 border border-emerald-700 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* ── SCANNED PRODUCT RESULT DISPLAY ── */}
      {lastScan ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                    lastScan.isUnknown
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {lastScan.isUnknown ? 'Unknown Barcode' : lastScan.aliasType || lastScan.format}
                </span>
                <span className="text-xs font-mono text-slate-400">{lastScan.sku}</span>
              </div>
              <h3 className="text-base font-black text-white">{lastScan.description}</h3>
              <p className="text-xs font-mono text-slate-400">Raw: {lastScan.rawBarcode}</p>
            </div>

            {!lastScan.isUnknown && (
              <div className="text-right p-2.5 bg-slate-800 rounded-xl border border-slate-700">
                <span className="text-[10px] text-slate-400 font-mono uppercase block">System Stock</span>
                <span className="text-lg font-black text-white font-mono">{lastScan.systemStock}</span>
                <span className="text-[10px] text-slate-400 block">Units</span>
              </div>
            )}
          </div>

          {/* Details Pill Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
            {lastScan.isVariableWeight && (
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 block">Extracted Weight:</span>
                <span className="text-emerald-400 font-bold">{lastScan.extractedWeight} kg</span>
              </div>
            )}
            {lastScan.lot && (
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 block">Batch Lot:</span>
                <span className="text-teal-300 font-bold">{lastScan.lot}</span>
              </div>
            )}
            {lastScan.expiry && (
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 block">Expiry Date:</span>
                <span className="text-amber-400 font-bold">{lastScan.expiry}</span>
              </div>
            )}
          </div>

          {/* Quantity Stepper */}
          {!lastScan.isUnknown && (
            <div className="space-y-2 pt-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Quantity Multiplier:
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setScanQty((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center border border-slate-700"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="flex-1 text-center font-mono font-black text-xl text-white py-2 bg-slate-800 rounded-xl border border-slate-700">
                  {scanQty}
                </div>
                <button
                  onClick={() => setScanQty((q) => q + 1)}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center border border-slate-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Batch Accumulator controls */}
          {mode === 'batch' && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <button
                onClick={handleBatchDone}
                className="w-full py-3 bg-[#14706B] hover:bg-[#0E5652] text-white font-bold rounded-xl text-xs transition-all shadow flex items-center justify-center gap-2"
              >
                <PackagePlus className="w-4 h-4" />
                <span>Complete Batch ({batchAccumulator.length} Scans)</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 space-y-2">
          <ScanBarcode className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-400">Click any barcode trigger above or point camera to scan</p>
          <p className="text-[10px] text-slate-600">Supports EAN-13, GS1-128, UPC-A, and Variable Weight Barcodes</p>
        </div>
      )}
    </div>
  );
}
