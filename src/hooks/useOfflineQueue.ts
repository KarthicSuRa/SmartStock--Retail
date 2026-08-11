// /src/hooks/useOfflineQueue.ts

import { useState, useEffect, useCallback } from 'react';
import { get, set, del, keys } from 'idb-keyval';

export interface QueuedAction {
  id: string;
  type: 'DAMAGE_LOG' | 'STOCK_COUNT' | 'PO_APPROVAL';
  payload: any;
  timestamp: string;
  retryCount: number;
  lastError?: string;
}

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const allKeys = await keys();
      const queueKeys = allKeys.filter((k) => String(k).startsWith('queue_'));
      setPendingCount(queueKeys.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    
    const handler = () => refreshCount();
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [refreshCount]);

  const enqueue = useCallback(async (action: Omit<QueuedAction, 'id' | 'timestamp' | 'retryCount'>) => {
    const item: QueuedAction = {
      ...action,
      id: `${action.type}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };
    
    await set(`queue_${item.id}`, item);
    setPendingCount((c) => c + 1);
    
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const tag = action.type === 'DAMAGE_LOG' ? 'sync-damage-logs' 
                  : action.type === 'STOCK_COUNT' ? 'sync-stock-counts'
                  : 'sync-po-approvals';
        await (reg as any).sync.register(tag);
      } catch (e) {
        console.warn('SyncManager registration fallback:', e);
      }
    }
    
    return item.id;
  }, []);

  const flush = useCallback(async () => {
    setIsSyncing(true);
    try {
      const allKeys = await keys();
      const queueKeys = allKeys.filter((k) => String(k).startsWith('queue_'));
      
      for (const key of queueKeys) {
        const item: QueuedAction | undefined = await get(key);
        if (!item) continue;
        
        try {
          const endpoint = '/supabase/functions/pwa-offline-sync';
                         
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action_type: item.type.toLowerCase(),
              items: [item.payload]
            }),
          });
          
          if (res.ok) {
            await del(key);
          }
        } catch (err) {
          console.warn('Flush failed for', key, err);
        }
      }
    } finally {
      await refreshCount();
      setIsSyncing(false);
    }
  }, [refreshCount]);

  return { pendingCount, isSyncing, enqueue, flush, refreshCount };
}
