'use client';

// /src/components/domain/StoreSelector.tsx
// SmartStock Experience V1 — Store Location Dropdown Selector

import React from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { useStoreContext } from '@/hooks/useStoreContext';

export const StoreSelector: React.FC = () => {
  const { activeStoreId, setActiveStoreId, availableStores } = useStoreContext();

  return (
    <div className="relative inline-flex items-center">
      <Building2 className="w-3.5 h-3.5 text-[#667085] absolute left-2.5 pointer-events-none" />
      <select
        value={activeStoreId || '1001'}
        onChange={(e) => setActiveStoreId(e.target.value)}
        className="appearance-none bg-[#F9FAFB] hover:bg-[#F2F4F7] border border-[#D0D5DD] text-xs font-medium text-[#101828] rounded-[6px] pl-8 pr-7 py-1.5 cursor-pointer focus:outline-none focus:border-[#14706B] transition-colors"
      >
        {availableStores.map((store) => (
          <option key={store.store_id} value={store.store_id}>
            {store.store_name || `Store ${store.store_id}`}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-[#667085] absolute right-2 pointer-events-none" />
    </div>
  );
};
