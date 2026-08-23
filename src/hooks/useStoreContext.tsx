'use client';

// /src/hooks/useStoreContext.tsx
// SmartStock Experience V1 — Store & User Claim Context

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface StoreClaim {
  store_id: string;
  store_name?: string;
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
  setRole: (role: string) => void;
  density: 'compact' | 'comfortable';
  setDensity: (d: 'compact' | 'comfortable') => void;
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
      { store_id: '1001', store_name: 'Amsterdam Central', level: 'manager', perms: { approve: true, emergency: true, adjust_safety: true } },
      { store_id: '1002', store_name: 'Rotterdam Centraal', level: 'read', perms: { approve: false, emergency: false, adjust_safety: false } },
      { store_id: '1004', store_name: 'Utrecht Station', level: 'manager', perms: { approve: true, emergency: true, adjust_safety: true } },
    ],
    global_perms: { view_all: true, audit: true, financials: true }
  });

  const [activeStoreId, setActiveStoreId] = useState<string | null>('1001');
  const [role, setRoleState] = useState<string>('store_manager');
  const [density, setDensityState] = useState<'compact' | 'comfortable'>('comfortable');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const userClaims = data?.user?.app_metadata?.live_retail_claims as LiveRetailClaims | undefined;
      if (userClaims) {
        setClaims(userClaims);
        if (userClaims.role) setRoleState(userClaims.role);
        if (userClaims.stores?.length > 0) {
          setActiveStoreId(userClaims.stores[0].store_id);
        }
      }
    });
  }, []);

  const setRole = (newRole: string) => {
    setRoleState(newRole);
  };

  const setDensity = (newDensity: 'compact' | 'comfortable') => {
    setDensityState(newDensity);
    document.documentElement.setAttribute('data-density', newDensity);
  };

  const activeStore = claims?.stores.find((s) => s.store_id === activeStoreId);
  
  const perms = {
    canApprovePR: activeStore?.perms.approve ?? false,
    canEmergencyPO: activeStore?.perms.emergency ?? false,
    canAdjustSafetyStock: activeStore?.perms.adjust_safety ?? false,
    canViewAnalytics: claims?.global_perms.financials ?? false,
    canAccessAudit: claims?.global_perms.audit ?? false,
  };

  return (
    <StoreContext.Provider
      value={{
        tenantId: claims?.tenant_id || 'default-tenant',
        activeStoreId,
        setActiveStoreId,
        availableStores: claims?.stores || [],
        role,
        setRole,
        density,
        setDensity,
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
