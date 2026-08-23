'use client';

// /src/components/ui/EmptyState.tsx
// SmartStock Experience V1 — Contextual Operational Zero State Component

import React from 'react';
import { CheckCircle2, Inbox } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  isSuccess?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  isSuccess = false,
}) => {
  return (
    <div className="py-16 px-6 text-center border border-dashed border-[#D0D5DD] rounded-[8px] bg-white max-w-lg mx-auto my-6 space-y-3">
      <div className="flex justify-center">
        {icon || (
          isSuccess ? (
            <div className="p-3 rounded-full bg-[#EDFDF5] border border-[#A6F4C5] text-[#039855]">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          ) : (
            <div className="p-3 rounded-full bg-[#F2F4F7] border border-[#EAECF0] text-[#667085]">
              <Inbox className="w-6 h-6" />
            </div>
          )
        )}
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[#101828]">{title}</h3>
        <p className="text-xs text-[#475467] leading-relaxed max-w-md mx-auto">{description}</p>
      </div>

      {actionLabel && onAction && (
        <div className="pt-2">
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
};
