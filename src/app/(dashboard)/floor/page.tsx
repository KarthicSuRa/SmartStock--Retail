'use client';

// /src/app/(dashboard)/floor/page.tsx
// SmartStock Experience V1 — Floor Staff Task List

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ClipboardCheck, Tag, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';

interface FloorTask {
  id: string;
  type: 'RESTOCK' | 'VERIFY_COUNT' | 'FEFO_EXPIRY';
  priority: 'URGENT' | 'HIGH' | 'NORMAL';
  title: string;
  location: string;
  quantityHint: string;
  sku: string;
}

export default function FloorTasksPage() {
  const tasks: FloorTask[] = [
    {
      id: 'task-01',
      type: 'VERIFY_COUNT',
      priority: 'URGENT',
      title: 'Count AirPods Pro (High-Value)',
      location: 'Backroom Cabinet B4',
      quantityHint: 'System expects ~8 units',
      sku: 'AP-PRO-USB-C',
    },
    {
      id: 'task-02',
      type: 'RESTOCK',
      priority: 'URGENT',
      title: 'Restock Coca Cola Zero (24 Pack)',
      location: 'Aisle 4 · Beverage Bay 2',
      quantityHint: 'Transfer 12 units to front shelf',
      sku: 'SKU-DRINK-001',
    },
    {
      id: 'task-03',
      type: 'FEFO_EXPIRY',
      priority: 'HIGH',
      title: 'Apply 25% Markdown Sticker',
      location: 'Dairy Cooler C1 · Shelf 3',
      quantityHint: '24 units of Greek Yogurt',
      sku: 'MAT-33104',
    },
    {
      id: 'task-04',
      type: 'VERIFY_COUNT',
      priority: 'NORMAL',
      title: 'Routine Count: Olive Oil 1L',
      location: 'Aisle 2 · Cooking Oils',
      quantityHint: 'System expects ~18 units',
      sku: 'MAT-00918',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Floor User Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#E4E7EC]">
        <div>
          <h1 className="text-lg font-bold text-[#101828]">Good morning, Mia</h1>
          <p className="text-xs text-[#667085]">
            <strong className="text-[#101828] font-semibold">{tasks.length} tasks</strong> assigned to you today
          </p>
        </div>
        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[#E8F4F3] text-[#14706B] border border-[#14706B]/20">
          Store 1001
        </span>
      </div>

      {/* Task List (Large touch targets, no tables) */}
      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="op-card p-4 bg-white border border-[#E4E7EC] rounded-[8px] space-y-3 shadow-2xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Badge status={task.priority === 'URGENT' ? 'critical' : 'warning'} size="sm">
                    {task.priority}
                  </Badge>
                  <span className="font-mono text-[11px] text-[#667085]">{task.sku}</span>
                </div>
                <h3 className="text-sm font-semibold text-[#101828]">{task.title}</h3>
              </div>
            </div>

            <div className="text-xs text-[#475467] bg-[#F9FAFB] p-2.5 rounded-[6px] border border-[#EAECF0] space-y-0.5">
              <p>📍 Location: <strong className="text-[#101828]">{task.location}</strong></p>
              <p className="text-[#667085]">{task.quantityHint}</p>
            </div>

            <Link href={`/floor/count/${task.id}`} className="block">
              <Button
                variant="primary"
                size="md"
                className="w-full h-11 text-xs font-semibold"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Start Task
              </Button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
