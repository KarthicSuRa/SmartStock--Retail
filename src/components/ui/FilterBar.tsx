'use client';

// /src/components/ui/FilterBar.tsx
// SmartStock Experience V1 — URL-Addressable Filter Bar Component

import React from 'react';

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterBarProps {
  options: FilterOption[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  options,
  activeId,
  onChange,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto pb-1 select-none ${className}`}>
      {options.map((opt) => {
        const isActive = activeId === opt.id;

        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors flex items-center gap-2 border ${
              isActive
                ? 'bg-[#14706B] text-white border-[#14706B] shadow-2xs font-semibold'
                : 'bg-white text-[#475467] border-[#D0D5DD] hover:bg-[#F9FAFB] hover:text-[#101828]'
            }`}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-[4px] text-[10px] font-mono ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[#F2F4F7] text-[#344054]'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
