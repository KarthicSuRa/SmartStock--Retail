'use client';

// /src/components/ui/Toast.tsx
// SmartStock Experience V1 — Accessible Operational Toast System

import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

export interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-[#039855] flex-shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-[#DC6803] flex-shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-[#D92D20] flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-[#1570EF] flex-shrink-0" />,
  };

  const borders = {
    success: 'border-[#A6F4C5] bg-[#EDFDF5]',
    warning: 'border-[#FEDF89] bg-[#FEF6EE]',
    error: 'border-[#FECDCA] bg-[#FEF3F2]',
    info: 'border-[#B2DDFF] bg-[#EFF8FF]',
  };

  return (
    <div
      role="alert"
      className={`w-80 p-3.5 rounded-[8px] border shadow-lg flex items-start justify-between gap-3 animate-in fade-in-0 slide-in-from-top-2 duration-140 bg-white`}
    >
      <div className="flex items-start gap-2.5">
        {icons[toast.type]}
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-[#101828] leading-tight">{toast.title}</p>
          {toast.description && (
            <p className="text-[11px] text-[#475467] leading-relaxed">{toast.description}</p>
          )}
        </div>
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="text-[#98A2B3] hover:text-[#344054] p-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
