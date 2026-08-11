// /src/components/count/CountTaskList.tsx

'use client';

import { useEffect, useState } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

export function CountTaskList() {
  const { tenantId, activeStoreId } = useStoreContext();
  const [tasks, setTasks] = useState<CountTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, [tenantId, activeStoreId]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/daily-count-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId || 'default-tenant', store_id: activeStoreId || '1001', limit: 15 }),
      });
      const data = await res.json();
      setTasks(data.items || []);
    } catch {
      setTasks([]);
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
        <Badge variant="secondary">{tasks.length} items</Badge>
      </div>

      {tasks.map((task) => (
        <Card key={task.material_id} className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={task.abc_class === 'A' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}>
                    {task.abc_class}-Item
                  </Badge>
                  {task.days_since_last_count > 30 && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      <Clock className="w-3 h-3 mr-1" />
                      {task.days_since_last_count}d overdue
                    </Badge>
                  )}
                </div>
                <p className="text-xs font-mono text-slate-500">{task.sku}</p>
                <p className="font-semibold text-slate-900 truncate">{task.description}</p>
                <p className="text-xs text-slate-500 mt-1">System stock: {task.current_stock} units</p>
                <p className="text-xs text-blue-600 mt-0.5">{task.reason}</p>
              </div>
              <Link href={`/floor/count/${task.material_id}?expected=${task.current_stock}`}>
                <Button size="sm" className="shrink-0 bg-blue-600 text-white hover:bg-blue-700">Count</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
