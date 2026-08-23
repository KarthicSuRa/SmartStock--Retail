'use client';

import { useEffect, useState } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';

interface CountTask {
  material_id: string;
  sku: string;
  description: string;
  current_stock: number;
  priority_score: number;
  reason: string;
  abc_class: string;
  days_since_last_count: number;
}

export function CountTaskList({ onSelectTask }: { onSelectTask?: (task: CountTask) => void }) {
  const { tenantId, activeStoreId } = useStoreContext();
  const [tasks, setTasks] = useState<CountTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, [tenantId, activeStoreId]);

  const defaultTasks: CountTask[] = [
    {
      material_id: 'MAT-1001',
      sku: 'SKU-DRINK-001',
      description: 'Coca Cola Zero 330ml Can (24 Pack)',
      current_stock: 12,
      priority_score: 98,
      reason: 'High velocity item below safety threshold',
      abc_class: 'A',
      days_since_last_count: 32
    },
    {
      material_id: 'MAT-1002',
      sku: 'SKU-SNACK-004',
      description: 'Doritos Tangy Cheese 150g (12 Pack)',
      current_stock: 8,
      priority_score: 92,
      reason: 'Sales variance registered in POS telemetry',
      abc_class: 'A',
      days_since_last_count: 45
    },
    {
      material_id: 'MAT-1003',
      sku: 'SKU-DAIRY-009',
      description: 'Organic Fresh Whole Milk 2L',
      current_stock: 35,
      priority_score: 85,
      reason: 'FEFO expiry rebalance audit due',
      abc_class: 'B',
      days_since_last_count: 14
    }
  ];

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/daily-count-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId || 'default-tenant', store_id: activeStoreId || '1001', limit: 15 }),
      });
      const data = await res.json();
      setTasks(data.items && data.items.length > 0 ? data.items : defaultTasks);
    } catch {
      setTasks(defaultTasks);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="space-y-3 p-4 text-sm text-slate-500">Loading daily count list...</div>;

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 bg-green-50 rounded-xl border border-green-200 p-4">
        <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-2" />
        <p className="font-bold text-green-800">All caught up!</p>
        <p className="text-sm text-green-600">No items need counting today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-base">Today's Smart Count List</h3>
        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">{tasks.length} items</span>
      </div>

      {tasks.map((task) => (
        <div key={task.material_id || task.sku} className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-blue-500 p-3 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${task.abc_class === 'A' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>
                  {task.abc_class}-Item
                </span>
                {task.days_since_last_count > 30 && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {task.days_since_last_count}d overdue
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-slate-500">{task.sku}</p>
              <p className="font-semibold text-slate-900 truncate text-sm">{task.description}</p>
              <p className="text-xs text-slate-500 mt-1">System stock: {task.current_stock} units</p>
              <p className="text-xs text-blue-600 mt-0.5">{task.reason}</p>
            </div>
            {onSelectTask ? (
              <button onClick={() => onSelectTask(task)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors shrink-0">Count</button>
            ) : (
              <Link href={`/floor/count?sku=${task.sku}`}>
                <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors shrink-0">Count</button>
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
