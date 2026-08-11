// /src/app/(dashboard)/floor/scan/page.tsx

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRealtimeInventory } from '@/hooks/useRealtimeInventory';
import { ArrowLeft, Keyboard, Camera } from 'lucide-react';

export default function ScanPage() {
  const router = useRouter();
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [manualEan, setManualEan] = useState('');
  const { items } = useRealtimeInventory();

  const handleScan = (ean: string) => {
    if (!ean) return;
    setLastScan(ean);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    
    const match = items.find((i) => i.ean_gtin === ean || i.sku === ean);
    if (match) {
      alert(`Scanned SKU: ${match.sku} - ${match.description} (${match.current_calculated_stock} ${match.uom} on hand)`);
    } else {
      setLastScan(`${ean} (Unknown SKU)`);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black relative">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => router.back()} className="text-white p-2">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="text-white font-medium">Scan Barcode</span>
        <div className="w-10" />
      </div>

      {/* Simulated Scanner Viewfinder */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-64 h-44 border-2 border-dashed border-blue-400 rounded-2xl flex flex-col items-center justify-center gap-2 bg-blue-500/10">
          <Camera className="w-10 h-10 text-blue-400 animate-pulse" />
          <span className="text-xs text-blue-200">Align barcode within frame</span>
        </div>
      </div>

      {/* Bottom Sheet — Manual Entry / Last Scan */}
      <div className="bg-white rounded-t-2xl p-4 space-y-3 z-10">
        {lastScan && (
          <div className="text-center">
            <p className="text-sm text-slate-500">Last scan</p>
            <p className="font-mono font-bold text-lg text-slate-900">{lastScan}</p>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Type SKU or EAN..."
              className="w-full pl-10 pr-4 py-3 bg-slate-100 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={manualEan}
              onChange={(e) => setManualEan(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan(manualEan)}
            />
          </div>
          <button onClick={() => handleScan(manualEan)} className="px-6 py-3 bg-slate-900 text-white rounded-lg text-sm font-semibold">
            Go
          </button>
        </div>
      </div>
    </div>
  );
}
