'use client';

// /src/components/domain/ActionImpactModal.tsx
// SmartStock Experience RC1 — Tier 3 Consequential Enterprise Transaction Safeguard Modal

import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { AlertTriangle, X, ShieldAlert, ArrowRight } from 'lucide-react';

export interface ActionImpactData {
  title: string;
  sku: string;
  productName: string;
  storeName: string;
  currentSystemQty: number;
  newTargetQty: number;
  deltaQty: number;
  unitValue: number;
  totalFinancialImpact: number;
  reason: string;
  erpActionType: 'INVENTORY_ADJUSTMENT' | 'EMERGENCY_PO' | 'STOCK_TRANSFER_ORDER';
}

export interface ActionImpactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  impactData: ActionImpactData;
}

export const ActionImpactModal: React.FC<ActionImpactModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  impactData,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  };

  const isDeduction = impactData.deltaQty < 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-[#0C111D]/50 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white border border-[#E4E7EC] rounded-[10px] shadow-2xl overflow-hidden z-10 space-y-5 p-6 animate-in fade-in-0 zoom-in-95 duration-120">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[6px] bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#101828] leading-tight">
                {impactData.title}
              </h2>
              <p className="text-xs text-[#667085] font-mono mt-0.5">
                {impactData.sku} · {impactData.storeName}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="text-[#98A2B3] hover:text-[#344054]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Impact Matrix */}
        <div className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-3 font-mono text-xs">
          <div className="flex justify-between items-center text-[#475467]">
            <span className="font-sans">Current System Quantity:</span>
            <strong className="text-[#101828] text-sm">{impactData.currentSystemQty} Units</strong>
          </div>

          <div className="flex justify-between items-center text-[#475467]">
            <span className="font-sans">Target Quantity (Physical Count):</span>
            <strong className="text-[#101828] text-sm">{impactData.newTargetQty} Units</strong>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-[#EAECF0]">
            <span className="font-sans font-semibold text-[#101828]">Inventory Adjustment Delta:</span>
            <span
              className={`text-sm font-bold ${
                isDeduction ? 'text-[#D92D20]' : 'text-[#039855]'
              }`}
            >
              {impactData.deltaQty > 0 ? `+${impactData.deltaQty}` : impactData.deltaQty} Units
            </span>
          </div>

          <div className="flex justify-between items-center pt-1 text-[#101828]">
            <span className="font-sans font-semibold">Financial Value Impact:</span>
            <span className="text-sm font-bold text-[#D92D20]">
              €{impactData.totalFinancialImpact.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Reason / Policy note */}
        <div className="space-y-1 text-xs">
          <span className="text-[#667085] font-medium block">Reason & Policy Justification:</span>
          <p className="p-2.5 rounded-[4px] bg-[#F2F4F7] text-[#344054] leading-relaxed">
            {impactData.reason}
          </p>
        </div>

        {/* Warning Banner */}
        <div className="p-3 rounded-[6px] bg-[#FEF6EE] border border-[#FEDF89] flex items-start gap-2.5 text-xs text-[#B54708]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#DC6803]" />
          <p className="leading-relaxed">
            This action creates an immediate material document entry and queues an ERP adjustment for SAP synchronization.
          </p>
        </div>

        {/* Modal Controls */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" size="md" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            isLoading={isSubmitting}
            onClick={handleConfirm}
          >
            Approve Adjustment
          </Button>
        </div>
      </div>
    </div>
  );
};
