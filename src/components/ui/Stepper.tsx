'use client';

// /src/components/ui/Stepper.tsx
// SmartStock Experience V1 — Horizontal Stepper Component

import React from 'react';
import { Check } from 'lucide-react';

export interface StepItem {
  id: string;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: StepItem[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStepIndex,
  onStepClick,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between w-full select-none ${className}`}>
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStepIndex;
        const isCurrent = idx === currentStepIndex;
        const isClickable = onStepClick && isCompleted;

        return (
          <React.Fragment key={step.id}>
            <div
              onClick={() => isClickable && onStepClick(idx)}
              className={`flex items-center gap-2.5 ${
                isClickable ? 'cursor-pointer' : ''
              }`}
            >
              {/* Step Circle */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold font-mono transition-colors ${
                  isCompleted
                    ? 'bg-[#14706B] text-white'
                    : isCurrent
                    ? 'bg-white border-2 border-[#14706B] text-[#14706B]'
                    : 'bg-[#F2F4F7] text-[#667085] border border-[#D0D5DD]'
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </div>

              <div>
                <p
                  className={`text-xs font-medium ${
                    isCurrent ? 'text-[#14706B] font-semibold' : 'text-[#344054]'
                  }`}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-[11px] text-[#667085] hidden sm:block">{step.description}</p>
                )}
              </div>
            </div>

            {/* Connecting Bar */}
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-[2px] mx-3 ${
                  idx < currentStepIndex ? 'bg-[#14706B]' : 'bg-[#EAECF0]'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
