// /src/hooks/useStoreContext.tsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface StoreClaim {
  store_id: string;
  level: 'read' | 'write' | 'manager' | 'admin';
  perms: { approve: boolean; emergency: boolean; adjust_safety: boolean };
}

export interface LiveRetailClaims {
  tenant_id: string;
  role: string;
  stores: StoreClaim[];
  global_perms: { view_all: boolean; audit: boolean; financials: boolean };
}

export interface StoreContextType {
  tenantId: string | null;
  activeStoreId: string | null;
  setActiveStoreId: (id: string) => void;
  availableStores: StoreClaim[];
  role: string;
  perms: {
    canApprovePR: boolean;
    canEmergencyPO: boolean;
    canAdjustSafetyStock: boolean;
    canViewAnalytics: boolean;
    canAccessAudit: boolean;
  };
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [claims, setClaims] = useState<LiveRetailClaims | null>({
    tenant_id: 'default-tenant',
    role: 'store_manager',
    stores: [
      { store_id: '1001', level: 'manager', perms: { approve: true, emergency: true, adjust_safety: true } },
      { store_id: '1002', level: 'read', perms: { approve: false, emergency: false, adjust_safety: false } }
    ],
    global_perms: { view_all: true, audit: true, financials: true }
  });

  const [activeStoreId, setActiveStoreId] = useState<string | null>('1001');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const userClaims = data?.user?.app_metadata?.live_retail_claims as LiveRetailClaims | undefined;
      if (userClaims) {
        setClaims(userClaims);
        if (userClaims.stores?.length > 0) {
          setActiveStoreId(userClaims.stores[0].store_id);
        }
      }
    });
  }, []);

  const activeStore = claims?.stores.find((s) => s.store_id === activeStoreId);
  
  const perms = {
    canApprovePR: activeStore?.perms.approve || true,
    canEmergencyPO: activeStore?.perms.emergency || true,
    canAdjustSafetyStock: activeStore?.perms.adjust_safety || true,
    canViewAnalytics: claims?.global_perms.financials || true,
    canAccessAudit: claims?.global_perms.audit || true,
  };

  return (
    <StoreContext.Provider
      value={{
        tenantId: claims?.tenant_id || 'default-tenant',
        activeStoreId,
        setActiveStoreId,
        availableStores: claims?.stores || [],
        role: claims?.role || 'store_manager',
        perms,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export const useStoreContext = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStoreContext must be used within StoreProvider');
  return ctx;
};
