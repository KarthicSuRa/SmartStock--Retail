// /src/components/scanner/ProductionBarcodeScanner.tsx

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';
import { useStoreContext } from '@/hooks/useStoreContext';
import { 
  Flashlight, FlashlightOff, Scan, ScanBarcode, 
  PackagePlus, AlertCircle 
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
  const [batchAccumulator, setBatchAccumulator] = useState<Map<string, ScanResult>>(new Map());
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const lastScanTime = useRef<number>(0);
  const SCAN_DEBOUNCE_MS = 800;

  const resolveBarcode = async (rawBarcode: string, formatName?: string): Promise<ScanResult> => {
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
        };
      }

      if (rawBarcode.length === 13 && rawBarcode.startsWith('2')) {
        const itemCode = rawBarcode.substring(1, 6);
        const weightValue = parseInt(rawBarcode.substring(6, 11));
        
        const { data: varAlias } = await supabase
          .from('barcode_aliases')
          .select('*, material_master:material_id (id, sku, description, base_uom)')
          .eq('tenant_id', tenantId || 'default-tenant')
          .eq('barcode', itemCode)
          .eq('is_variable_weight', true)
          .maybeSingle();

        if (varAlias) {
          const weight = weightValue / (varAlias.weight_embedded_divisor || 1000);
          return {
            rawBarcode,
            format: 'EAN13_VARIABLE_WEIGHT',
            materialId: varAlias.material_id,
            sku: varAlias.material_master?.sku,
            description: varAlias.material_master?.description,
            aliasType: 'VARIABLE_WEIGHT',
            quantityMultiplier: 1,
            isVariableWeight: true,
            extractedWeight: weight,
            isUnknown: false,
          };
        }
      }

      if (rawBarcode.includes('(') || rawBarcode.startsWith(']C1')) {
        const gs1 = parseGS1128(rawBarcode);
        if (gs1.gtin) {
          const { data: gs1Alias } = await supabase
            .from('barcode_aliases')
            .select('*, material_master:material_id (id, sku, description)')
            .eq('tenant_id', tenantId || 'default-tenant')
            .eq('barcode', gs1.gtin)
            .maybeSingle();
            
          if (gs1Alias) {
            return {
              rawBarcode,
              format: 'GS1_128',
              materialId: gs1Alias.material_id,
              sku: gs1Alias.material_master?.sku,
              description: gs1Alias.material_master?.description,
              aliasType: gs1Alias.alias_type,
              quantityMultiplier: gs1Alias.quantity_multiplier || 1,
              isVariableWeight: false,
              isUnknown: false,
            };
          }
        }
      }

      await supabase.from('unknown_barcodes').insert({
        tenant_id: tenantId || 'default-tenant',
        store_id: activeStoreId || '1001',
        scanned_barcode: rawBarcode,
        scanned_barcode_type: formatName,
        context: mode,
      });

      return {
        rawBarcode,
        format: formatName || 'UNKNOWN',
        quantityMultiplier: 1,
        isVariableWeight: false,
        isUnknown: true,
      };
    } catch {
      return {
        rawBarcode,
        format: formatName || 'UNKNOWN',
        quantityMultiplier: 1,
        isVariableWeight: false,
        isUnknown: true,
      };
    }
  };

  const onScanSuccess = useCallback(async (decodedText: string, decodedResult: any) => {
    const now = Date.now();
    if (now - lastScanTime.current < SCAN_DEBOUNCE_MS) return;
    lastScanTime.current = now;

    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40);

    setIsResolving(true);
    
    try {
      const resolved = await resolveBarcode(decodedText, decodedResult?.result?.format?.formatName);
      setLastScan(resolved);
      
      if (mode === 'batch') {
        setBatchAccumulator(prev => {
          const next = new Map(prev);
          const existing = next.get(resolved.rawBarcode);
          if (existing) {
            next.set(resolved.rawBarcode, {
              ...existing,
              quantityMultiplier: existing.quantityMultiplier + resolved.quantityMultiplier
            });
          } else {
            next.set(resolved.rawBarcode, resolved);
          }
          return next;
        });
      } else {
        onScan(resolved);
      }
    } finally {
      setIsResolving(false);
    }
  }, [mode, onScan]);

  const onScanFailure = useCallback(() => {}, []);

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
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
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
        onScanSuccess,
        onScanFailure
      );
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Camera init failed');
    }
  };

  const safeStopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Suppress stop errors if scanner is not running or already stopped
      }
    }
  }, []);

  useEffect(() => {
    initScanner();
    return () => {
      safeStopScanner();
    };
  }, []);

  const toggleTorch = async () => {
    setTorchOn(!torchOn);
  };

  const handleBatchDone = () => {
    const items = Array.from(batchAccumulator.values());
    onBatchComplete?.(items);
    setBatchAccumulator(new Map());
  };

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] h-full bg-slate-900 text-white p-6 rounded-2xl">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
        <h2 className="text-lg font-bold mb-1">Camera Stream Simulation</h2>
        <p className="text-center text-slate-400 text-xs mb-6 max-w-sm">
          No live camera detected. You can run instant simulated barcode scans for testing.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={() => onScanSuccess('8710400000012', { result: { format: { formatName: 'EAN13' } } })}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-xs font-bold transition-all"
          >
            Simulate Scanning SKU-DRINK-001 (EAN13)
          </button>
          <button onClick={initScanner} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white text-xs font-bold border border-slate-700 transition-all">
            Retry Camera Access
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black relative">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={safeStopScanner} className="text-white p-2">
          ✕
        </button>
        <button onClick={toggleTorch} className="text-white p-2">
          {torchOn ? <FlashlightOff className="w-5 h-5" /> : <Flashlight className="w-5 h-5" />}
        </button>
      </div>

      <div id="scanner-container" className="flex-1" />

      {mode === 'batch' && batchAccumulator.size > 0 && (
        <div className="absolute top-20 right-4 z-10 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
          {Array.from(batchAccumulator.values()).reduce((sum, i) => sum + i.quantityMultiplier, 0)} items
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 space-y-3 max-h-[40vh] overflow-y-auto z-10">
        {isResolving ? (
          <div className="flex items-center justify-center py-4 text-slate-500 text-sm">
            <Scan className="w-5 h-5 animate-spin mr-2" />
            Resolving multi-format barcode...
          </div>
        ) : lastScan ? (
          <div className="space-y-3">
            {lastScan.isUnknown ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-800 font-semibold mb-1 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  Unknown Barcode Queued
                </div>
                <p className="font-mono text-sm text-red-700">{lastScan.rawBarcode}</p>
                <p className="text-xs text-red-600 mt-1">Sent to master data team queue.</p>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-700 font-mono">{lastScan.sku}</p>
                    <h3 className="font-bold text-green-900 text-sm">{lastScan.description}</h3>
                    {lastScan.isVariableWeight && (
                      <p className="text-xs text-green-700 font-semibold mt-1">
                        Variable Weight: {lastScan.extractedWeight?.toFixed(3)} kg
                      </p>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-200 text-green-800">
                    {lastScan.aliasType?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            )}

            {mode === 'batch' && (
              <button onClick={handleBatchDone} className="w-full py-3 bg-slate-900 text-white rounded-xl text-base font-bold flex items-center justify-center gap-2">
                <PackagePlus className="w-5 h-5" />
                Complete Batch ({batchAccumulator.size} SKUs)
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-slate-400">
            <ScanBarcode className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">Point camera at GS1, EAN, or UPC barcode</p>
          </div>
        )}
      </div>
    </div>
  );
}

function parseGS1128(barcode: string): { gtin?: string; lot?: string; expiry?: string } {
  const result: any = {};
  const regex = /\((\d{2})\)([^\(]+)/g;
  let match;
  while ((match = regex.exec(barcode)) !== null) {
    const ai = match[1];
    const value = match[2].trim();
    if (ai === '01') result.gtin = value;
    if (ai === '10') result.lot = value;
    if (ai === '17') result.expiry = value;
  }
  return result;
}
