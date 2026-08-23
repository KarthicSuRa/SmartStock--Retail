// /src/hooks/useFloorTasks.ts
// SmartStock LiveRetail V2 — Realtime Floor Staff Task Subscription (Stage 14)

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useStoreContext } from '@/hooks/useStoreContext';

export interface FloorTask {
  id: string;
  task_type: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'RESOLVED';
  location_id: string;
  task_data: Record<string, any>;
  due_at?: string;
  created_at: string;
}

export function useFloorTasks() {
  const { tenantId, activeStoreId } = useStoreContext();
  const [tasks, setTasks] = useState<FloorTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data } = await supabase
          .from('workflow_tasks')
          .select('*')
          .eq('tenant_id', tenantId || 'default-tenant')
          .eq('location_id', activeStoreId || '1001')
          .in('status', ['OPEN', 'ASSIGNED', 'IN_PROGRESS'])
          .order('due_at', { ascending: true, nullsFirst: false });

        if (data && data.length > 0) {
          setTasks(data);
          setLoading(false);
          return;
        }
      }

      // Mock floor tasks for local development / unconfigured
      const mockTasks: FloorTask[] = [
        {
          id: 'task-01',
          task_type: 'RESTOCK_SHELF',
          status: 'ASSIGNED',
          location_id: activeStoreId || '1001',
          task_data: { title: 'Restock Aisle 4', sku: 'MAT-20349', needed_units: 18 },
          due_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: 'task-02',
          task_type: 'VERIFY_COUNT',
          status: 'ASSIGNED',
          location_id: activeStoreId || '1001',
          task_data: { title: 'Count Lavazza Espresso', sku: 'MAT-33104', expected_qty: 32 },
          due_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: 'task-03',
          task_type: 'EXPIRY_MARKDOWN',
          status: 'ASSIGNED',
          location_id: activeStoreId || '1001',
          task_data: { title: 'Apply 25% Markdown', sku: 'MAT-40192', batch: 'EXP-08', units: 14 },
          due_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ];
      setTasks(mockTasks);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();

    if (isSupabaseConfigured) {
      const channel = supabase
        .channel('floor-tasks-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_tasks' }, fetchTasks)
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [tenantId, activeStoreId]);

  return { tasks, loading, refresh: fetchTasks };
}
