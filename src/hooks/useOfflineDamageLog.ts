
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface DamageLogPayload {
  sku: string;
  storeId: string;
  quantity: number;
  reason: string;
  photoUri?: string;
  scannedAt: string;
}

export function useOfflineDamageLog() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const logDamage = useCallback(async (payload: DamageLogPayload) => {
    const localId = await saveToLocalQueue(payload);
    
    try {
      const { error: invokeError } = await supabase.functions.invoke('pwa-offline-sync', {
        body: {
          action_type: 'damage_log',
          items: [payload]
        }
      });

      if (!invokeError) {
        await removeFromLocalQueue(localId);
        return { success: true, synced: true };
      }
    } catch (networkError) {
      console.log('[DamageLog] Offline detected, queued for BackgroundSync');
    }

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await (registration as any).sync.register('sync-damage-logs');
      } catch (err) {
        console.warn('[DamageLog] BackgroundSync registration fallback');
      }
    }

    setPendingCount(prev => prev + 1);
    return { success: true, synced: false, queued: true };
  }, []);

  const checkPending = useCallback(async () => {
    const queue = await getLocalQueue();
    setPendingCount(queue.length);
  }, []);

  const forceSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if ('sync' in registration) {
          await (registration as any).sync.register('sync-damage-logs');
        }
      }
      
      const queue = await getLocalQueue();
      if (queue.length > 0) {
        const { error: invokeError } = await supabase.functions.invoke('pwa-offline-sync', {
          body: {
            action_type: 'damage_log',
            items: queue.map(i => i.payload)
          }
        });
        
        if (!invokeError) {
          for (const item of queue) {
            await removeFromLocalQueue(item.id);
          }
        }
      }
    } finally {
      setIsSyncing(false);
      await checkPending();
    }
  }, [checkPending]);

  return { logDamage, pendingCount, isSyncing, checkPending, forceSync };
}

// In-memory fallback queue for local IndexedDB emulation
const LOCAL_STORAGE_KEY = 'smartstock_offline_damage_queue';

async function saveToLocalQueue(payload: DamageLogPayload): Promise<string> {
  const id = crypto.randomUUID();
  const existing = await getLocalQueue();
  existing.push({ id, payload });
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
  return id;
}

async function removeFromLocalQueue(id: string): Promise<void> {
  const existing = await getLocalQueue();
  const filtered = existing.filter(item => item.id !== id);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
}

async function getLocalQueue(): Promise<Array<{ id: string; payload: DamageLogPayload }>> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
