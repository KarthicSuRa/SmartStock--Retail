// /src/app/(dashboard)/floor/damage/page.tsx

'use client';

import React, { useState } from 'react';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useStoreContext } from '@/hooks/useStoreContext';
import { Camera, Plus, Trash2, CloudOff, CloudCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

const DAMAGE_REASONS = [
  'Expired', 'Damaged Packaging', 'Spillage', 'Theft', 
  'Temperature Damage', 'Pest Damage', 'Other'
];

export default function DamageLogPage() {
  const router = useRouter();
  const { activeStoreId, tenantId } = useStoreContext();
  const { pendingCount, enqueue, flush } = useOfflineQueue();
  const [scannedSku, setScannedSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('Damaged Packaging');
  const [photo, setPhoto] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState(false);

  const handleLog = async () => {
    if (!scannedSku || !activeStoreId) return;

    const payload = {
      tenant_id: tenantId,
      store_id: activeStoreId,
      sku: scannedSku,
      quantity,
      reason,
      photo_uri: photo,
      scanned_at: new Date().toISOString(),
    };

    await enqueue({
      type: 'DAMAGE_LOG',
      payload,
    });

    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 50, 30]);
    
    setJustLogged(true);
    setTimeout(() => {
      setJustLogged(false);
      setScannedSku('');
      setQuantity(1);
      setPhoto(null);
    }, 1500);
  };

  const takePhoto = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => setPhoto(reader.result as string);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Log Damaged Inventory</h1>
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">
              <CloudOff className="w-3 h-3 text-amber-500" />
              {pendingCount} pending
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
              <CloudCheck className="w-3 h-3 text-green-600" />
              Synced
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        <div>
          <label className="text-sm font-medium text-slate-700">SKU / Barcode</label>
          <div className="flex gap-2 mt-1">
            <input
              value={scannedSku}
              onChange={(e) => setScannedSku(e.target.value)}
              placeholder="Scan or type SKU..."
              className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm font-mono text-slate-900"
            />
            <button
              onClick={() => router.push('/floor/scan')}
              className="p-3 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Quantity Damaged</label>
          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-12 h-12 bg-white border border-slate-200 rounded-lg font-bold text-lg text-slate-700"
            >
              -
            </button>
            <span className="text-2xl font-bold w-12 text-center text-slate-900">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-12 h-12 bg-white border border-slate-200 rounded-lg font-bold text-lg text-slate-700"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Reason</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {DAMAGE_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  reason === r
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Photo Evidence</label>
          {photo ? (
            <div className="relative mt-2 rounded-lg overflow-hidden border">
              <img src={photo} alt="Damage" className="w-full h-48 object-cover" />
              <button
                onClick={() => setPhoto(null)}
                className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={takePhoto}
              className="w-full mt-2 h-28 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-slate-400 bg-white"
            >
              <Camera className="w-6 h-6" />
              <span className="text-sm font-medium">Take Photo</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-4 bg-white border-t">
        {justLogged ? (
          <div className="w-full py-4 bg-green-100 text-green-800 rounded-xl text-center font-bold animate-pulse">
            ✓ Logged — queued for sync
          </div>
        ) : (
          <button
            onClick={handleLog}
            disabled={!scannedSku}
            className={`w-full py-4 text-base font-bold rounded-xl flex items-center justify-center gap-2 text-white ${
              scannedSku ? 'bg-slate-900 hover:bg-slate-800' : 'bg-slate-300 cursor-not-allowed'
            }`}
          >
            <Plus className="w-5 h-5" />
            Log Damage
          </button>
        )}
        
        {pendingCount > 0 && (
          <button onClick={flush} className="w-full mt-2 text-xs text-slate-500 py-1 font-medium">
            Force Sync Now ({pendingCount} pending)
          </button>
        )}
      </div>
    </div>
  );
}
