'use client';

// /src/components/domain/DecisionFeedbackModal.tsx
// SmartStock Decision Intelligence V1 — Rejection Reason & Quantity Modification Modal

import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { RejectionReasonCode } from '@/lib/decision/types';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export interface DecisionFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'MODIFY' | 'REJECT';
  recommendedQty: number;
  onSubmit: (data: { modifiedQty?: number; reasonCode?: RejectionReasonCode; notes?: string }) => void;
}

export const DecisionFeedbackModal: React.FC<DecisionFeedbackModalProps> = ({
  isOpen,
  onClose,
  mode,
  recommendedQty,
  onSubmit,
}) => {
  const [modifiedQty, setModifiedQty] = useState<number>(recommendedQty);
  const [selectedReason, setSelectedReason] = useState<RejectionReasonCode>('SOURCE_STORE_NEEDS_STOCK');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (mode === 'MODIFY') {
      onSubmit({ modifiedQty, notes });
    } else {
      onSubmit({ reasonCode: selectedReason, notes });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-[8px] border border-[#E4E7EC] shadow-xl max-w-md w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EAECF0] pb-3">
          <h3 className="text-base font-semibold text-[#101828]">
            {mode === 'MODIFY' ? 'Modify Recommended Quantity' : 'Reject Decision Recommendation'}
          </h3>
          <button onClick={onClose} className="text-[#98A2B3] hover:text-[#101828]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modify Form */}
        {mode === 'MODIFY' && (
          <div className="space-y-3 text-xs">
            <p className="text-[#475467]">
              SmartStock recommended <strong>{recommendedQty} Units</strong> based on projected demand velocity. Specify your adjusted approved quantity:
            </p>

            <div className="space-y-1">
              <label className="font-semibold text-[#101828]">Approved Quantity</label>
              <input
                type="number"
                min="1"
                value={modifiedQty}
                onChange={(e) => setModifiedQty(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[#D0D5DD] rounded-[6px] font-mono text-sm"
              />
            </div>
          </div>
        )}

        {/* Reject Form */}
        {mode === 'REJECT' && (
          <div className="space-y-3 text-xs">
            <p className="text-[#475467]">
              Help the Decision Intelligence learning loop by recording the reason for rejecting this recommendation:
            </p>

            <div className="space-y-2">
              {[
                { code: 'SOURCE_STORE_NEEDS_STOCK', label: 'Source store needs stock for local demand' },
                { code: 'QUANTITY_TOO_HIGH', label: 'Recommended quantity is too high for shelf space' },
                { code: 'TRANSPORT_UNAVAILABLE', label: 'Internal van transport unavailable today' },
                { code: 'VENDOR_PREFERRED', label: 'Prefer scheduled vendor delivery over store transfer' },
                { code: 'INFORMATION_INACCURATE', label: 'Inventory data is inaccurate' },
              ].map((r) => (
                <label
                  key={r.code}
                  className="flex items-center gap-2 p-2 rounded-[4px] border border-[#EAECF0] hover:bg-[#F9FAFB] cursor-pointer"
                >
                  <input
                    type="radio"
                    name="rejectionReason"
                    checked={selectedReason === r.code}
                    onChange={() => setSelectedReason(r.code as RejectionReasonCode)}
                    className="text-[#14706B] focus:ring-[#14706B]"
                  />
                  <span className="text-[#101828] font-medium">{r.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Optional Notes */}
        <div className="space-y-1 text-xs">
          <label className="font-semibold text-[#667085]">Operational Notes (Optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add context for continuous learning..."
            className="w-full px-3 py-2 border border-[#D0D5DD] rounded-[6px] text-xs"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[#EAECF0]">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={mode === 'MODIFY' ? 'primary' : 'danger'}
            size="sm"
            onClick={handleConfirm}
          >
            {mode === 'MODIFY' ? 'Submit Adjusted Order' : 'Confirm Rejection'}
          </Button>
        </div>
      </div>
    </div>
  );
};
