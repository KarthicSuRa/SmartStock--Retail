'use client';

// /src/components/domain/SavedViewsSelector.tsx
// SmartStock Experience RC1 — Corporate & Personal Saved Views Selector

import React from 'react';
import { Bookmark, ChevronDown } from 'lucide-react';

export interface SavedView {
  id: string;
  name: string;
  category: 'corporate' | 'personal';
  filterKey: string;
}

export interface SavedViewsSelectorProps {
  activeViewId: string;
  onSelectView: (view: SavedView) => void;
  className?: string;
}

export const SAVED_VIEWS: SavedView[] = [
  { id: 'view-all', name: 'All Open Exceptions', category: 'corporate', filterKey: 'ALL' },
  { id: 'view-critical', name: 'Critical Stockouts > €500', category: 'corporate', filterKey: 'CRITICAL' },
  { id: 'view-approval', name: 'Needs My Approval', category: 'personal', filterKey: 'APPROVAL' },
  { id: 'view-discrepancies', name: 'Inventory Discrepancies (<70% Conf)', category: 'corporate', filterKey: 'UNCERTAINTY' },
  { id: 'view-expiry', name: 'FEFO Expiry (Next 3 Days)', category: 'corporate', filterKey: 'EXPIRY' },
  { id: 'view-pos', name: 'POS Sequence Gaps & Stalls', category: 'corporate', filterKey: 'INTEGRATION' },
];

export const SavedViewsSelector: React.FC<SavedViewsSelectorProps> = ({
  activeViewId,
  onSelectView,
  className = '',
}) => {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <Bookmark className="w-3.5 h-3.5 text-[#14706B] absolute left-2.5 pointer-events-none" />
      <select
        value={activeViewId}
        onChange={(e) => {
          const v = SAVED_VIEWS.find((item) => item.id === e.target.value) || SAVED_VIEWS[0];
          onSelectView(v);
        }}
        className="appearance-none bg-white hover:bg-[#F9FAFB] border border-[#D0D5DD] text-xs font-semibold text-[#101828] rounded-[6px] pl-8 pr-7 py-1.5 cursor-pointer focus:outline-none focus:border-[#14706B] transition-colors shadow-2xs"
      >
        <optgroup label="Corporate Views">
          {SAVED_VIEWS.filter((v) => v.category === 'corporate').map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Personal Work Queues">
          {SAVED_VIEWS.filter((v) => v.category === 'personal').map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </optgroup>
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-[#667085] absolute right-2 pointer-events-none" />
    </div>
  );
};
