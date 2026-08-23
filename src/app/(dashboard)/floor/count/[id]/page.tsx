'use client';

// /src/app/(dashboard)/floor/count/[id]/page.tsx
// SmartStock Experience RC1 — One-Handed Count Flow with Scan Mismatch Guard

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { UXTelemetry } from '@/lib/telemetry';
import { Plus, Minus, QrCode, CheckCircle2, ArrowLeft, AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';

export default function CountExecutionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [count, setCount] = useState(7);
  const [reason, setReason] = useState<'VERIFIED' | 'MISSING' | 'DAMAGED'>('VERIFIED');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannedVerified, setScannedVerified] = useState(false);
  const [scanMismatchModal, setScanMismatchModal] = useState<{ expected: string; scanned: string } | null>(null);

  const handleScanBarcode = (isWrong = false) => {
    if (isWrong) {
      UXTelemetry.track('scan_mismatch_detected', { sku: 'AP-PRO-USB-C' });
      setScanMismatchModal({
        expected: 'AirPods Pro (USB-C MagSafe)',
        scanned: 'AirPods Silicone Protective Case (White)',
      });
    } else {
      setScannedVerified(true);
      toast({
        type: 'success',
        title: 'Barcode Verified',
        description: 'EAN-13 8712345678901 matched SKU AP-PRO-USB-C.',
      });
    }
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      UXTelemetry.track('count_completed', { sku: 'AP-PRO-USB-C', metadata: { count, reason } });
      toast({
        type: 'success',
        title: `Count Recorded (${count} Units)`,
        description: 'Physical inventory updated and synced with store digital twin.',
      });
      router.push('/floor');
    }, 600);
  };

  return (
    <div className="space-y-5 max-w-md mx-auto">
      {/* Top Back Link */}
      <Link href="/floor" className="inline-flex items-center gap-1.5 text-xs text-[#667085] hover:text-[#101828]">
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Task List</span>
      </Link>

      {/* Task Header */}
      <div className="op-card p-4 bg-white border border-[#E4E7EC] rounded-[8px] space-y-1">
        <div className="flex items-center gap-2">
          <Badge status="degraded" size="sm">
            High-Value Verification
          </Badge>
          <span className="font-mono text-xs text-[#667085]">AP-PRO-USB-C</span>
        </div>
        <h1 className="text-base font-bold text-[#101828]">AirPods Pro (USB-C MagSafe)</h1>
        <p className="text-xs text-[#475467]">📍 Location: <strong>Backroom Cabinet B4</strong></p>
      </div>

      {/* Barcode Scan Verification Banner */}
      {scannedVerified ? (
        <div className="p-3 rounded-[6px] bg-[#EDFDF5] border border-[#A6F4C5] flex items-center justify-between text-xs text-[#027A48]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#039855]" />
            <span>Barcode Verified (EAN-13 Matched)</span>
          </div>
          <span className="text-[10px] font-mono font-bold">✓ MATCHED</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="md"
            className="flex-1 h-11 text-xs"
            leftIcon={<QrCode className="w-4 h-4 text-[#14706B]" />}
            onClick={() => handleScanBarcode(false)}
          >
            Scan Product Barcode
          </Button>
          <button
            onClick={() => handleScanBarcode(true)}
            className="px-2.5 py-1 text-[10px] text-[#98A2B3] hover:text-[#475467] border border-dashed rounded"
            title="Test Mismatch Guard"
          >
            [Test Mismatch]
          </button>
        </div>
      )}

      {/* System Expectation */}
      <div className="p-3 rounded-[6px] bg-[#F2F4F7] text-center">
        <span className="text-xs text-[#667085] block">System Expected Quantity:</span>
        <strong className="text-lg font-bold font-mono text-[#101828]">8 Units</strong>
      </div>

      {/* Giant Count Input (One-handed friendly) */}
      <div className="op-card p-5 bg-white border border-[#E4E7EC] rounded-[8px] space-y-4 text-center">
        <span className="text-xs font-semibold uppercase text-[#667085] block">
          Physical Count on Shelf
        </span>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setCount((c) => Math.max(0, c - 1))}
            className="w-14 h-14 rounded-[8px] bg-[#F2F4F7] active:bg-[#EAECF0] text-[#101828] text-2xl font-bold flex items-center justify-center border border-[#D0D5DD]"
          >
            <Minus className="w-6 h-6" />
          </button>

          <div className="w-24 text-4xl font-extrabold font-mono text-[#101828] select-none">
            {count}
          </div>

          <button
            onClick={() => setCount((c) => c + 1)}
            className="w-14 h-14 rounded-[8px] bg-[#F2F4F7] active:bg-[#EAECF0] text-[#101828] text-2xl font-bold flex items-center justify-center border border-[#D0D5DD]"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Reason Selection */}
      <div className="op-card p-4 bg-white border border-[#E4E7EC] rounded-[8px] space-y-3">
        <span className="text-xs font-semibold uppercase text-[#667085] block">Count Outcome Reason</span>

        <div className="space-y-2 text-xs">
          {[
            { id: 'VERIFIED', label: 'Count Verified (Matched physical quantity)' },
            { id: 'MISSING', label: 'Item Missing / Unexplained Shrink (-1 unit)' },
            { id: 'DAMAGED', label: 'Damaged Item Moved to Quarantine Bin' },
          ].map((opt) => (
            <label
              key={opt.id}
              onClick={() => setReason(opt.id as any)}
              className={`p-3 rounded-[6px] border flex items-center gap-3 cursor-pointer transition-colors ${
                reason === opt.id
                  ? 'border-[#14706B] bg-[#E8F4F3]/40 font-semibold text-[#101828]'
                  : 'border-[#E4E7EC] hover:bg-[#F9FAFB] text-[#475467]'
              }`}
            >
              <input
                type="radio"
                name="count-reason"
                checked={reason === opt.id}
                onChange={() => setReason(opt.id as any)}
                className="text-[#14706B] focus:ring-0"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Submit Button (44px min target) */}
      <Button
        variant="primary"
        size="lg"
        isLoading={isSubmitting}
        onClick={handleSubmit}
        className="w-full h-12 text-sm font-semibold shadow-xs"
      >
        Submit Physical Count
      </Button>

      {/* ── BARCODE MISMATCH MODAL ── */}
      {scanMismatchModal && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 bg-[#0C111D]/60 backdrop-blur-[2px]">
          <div className="bg-white border border-[#FEDF89] rounded-[10px] shadow-2xl p-6 max-w-sm w-full space-y-4 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center gap-2 text-[#D92D20] font-semibold text-sm">
              <AlertTriangle className="w-5 h-5 text-[#DC6803]" />
              <span>Different Product Scanned</span>
            </div>

            <div className="space-y-2 text-xs bg-[#FEF6EE] p-3 rounded-[6px] border border-[#FEDF89] text-[#B54708]">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#667085] block">Expected Product:</span>
                <strong className="text-[#101828]">{scanMismatchModal.expected}</strong>
              </div>
              <div className="pt-1 border-t border-[#FEDF89]/60">
                <span className="text-[10px] uppercase font-bold text-[#667085] block">Scanned Item:</span>
                <strong className="text-[#D92D20]">{scanMismatchModal.scanned}</strong>
              </div>
            </div>

            <p className="text-xs text-[#475467] leading-relaxed">
              Please ensure you are scanning the item assigned to Cabinet B4.
            </p>

            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => setScanMismatchModal(null)}
            >
              Scan Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
