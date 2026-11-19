'use client';

// /src/lib/tasks.ts
// SmartStock — Store employee daily tasks (cleaning, bin movements, replenishment, counts…) & team communications.
// Mirrors DB tables store_tasks / store_task_checklist / store_messages (migration 75).

import { createPersistentStore } from './local-store';

export type TaskType = 'cleaning' | 'bin_movement' | 'replenish' | 'count' | 'receiving' | 'other';
export type TaskStatus = 'open' | 'in_progress' | 'done';
export type TaskPriority = 'high' | 'medium' | 'low';

export const TASK_TYPES: { key: TaskType; label: string }[] = [
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'bin_movement', label: 'Bin Movement' },
  { key: 'replenish', label: 'Replenish Shelf' },
  { key: 'count', label: 'Cycle Count' },
  { key: 'receiving', label: 'Goods Receiving' },
  { key: 'other', label: 'Other' },
];

export interface StoreTask {
  id: string;
  title: string;
  type: TaskType;
  store: string;
  assignee: string;
  due: string; // HH:MM local shift time
  priority: TaskPriority;
  status: TaskStatus;
  recurrence: 'daily' | 'weekly' | 'once';
  location?: string;
  checklist: { text: string; done: boolean }[];
  createdBy: string;
  completedAt?: string;
  completedBy?: string;
}

export interface StoreMessage {
  id: string;
  ts: string;
  author: string;
  store: string;
  kind: 'announcement' | 'shift_note' | 'message';
  text: string;
  pinned?: boolean;
  acknowledgedBy: string[];
}

const TASK_SEED: StoreTask[] = [
  { id: 'TSK-301', title: 'Chiller aisle deep clean', type: 'cleaning', store: '1001', assignee: 'Lars Van Dijk', due: '07:30', priority: 'high', status: 'done', recurrence: 'daily', location: 'Aisle 3 chillers', checklist: [{ text: 'Remove & check expiring stock', done: true }, { text: 'Sanitise shelves & glass', done: true }, { text: 'Log chiller temperature', done: true }], createdBy: 'Sarah Jenkins', completedAt: '2026-11-19T07:24:00Z', completedBy: 'Lars Van Dijk' },
  { id: 'TSK-302', title: 'Entrance & checkout area cleaning', type: 'cleaning', store: '1001', assignee: 'Emma Smit', due: '09:00', priority: 'medium', status: 'in_progress', recurrence: 'daily', location: 'Front of store', checklist: [{ text: 'Mop entrance', done: true }, { text: 'Wipe checkout belts', done: false }, { text: 'Empty bins', done: false }], createdBy: 'Sarah Jenkins' },
  { id: 'TSK-303', title: 'Move AirPods Pro to shelf (below min)', type: 'bin_movement', store: '1001', assignee: 'Priya Raman', due: '10:00', priority: 'high', status: 'open', recurrence: 'once', location: 'BS-S-01-01 → SF-12-A', checklist: [{ text: 'Pick 9 EA from secure cage', done: false }, { text: 'Face shelf & apply security tags', done: false }], createdBy: 'System (replenishment trigger)' },
  { id: 'TSK-304', title: 'Re-slot chocolate to bin BS-A-03-02', type: 'bin_movement', store: '1001', assignee: 'Yusuf Kaya', due: '15:00', priority: 'low', status: 'open', recurrence: 'once', location: 'BS-A-03-01 → BS-A-03-02', checklist: [], createdBy: 'Sarah Jenkins' },
  { id: 'TSK-305', title: 'Morning milk replenishment', type: 'replenish', store: '1001', assignee: 'Lars Van Dijk', due: '08:00', priority: 'high', status: 'done', recurrence: 'daily', location: 'SF-03-B', checklist: [{ text: 'FEFO rotation (oldest front)', done: true }], createdBy: 'Sarah Jenkins', completedAt: '2026-11-19T07:58:00Z', completedBy: 'Lars Van Dijk' },
  { id: 'TSK-306', title: 'Blind count — Electronics wall', type: 'count', store: '1001', assignee: 'Noah de Jong', due: '18:00', priority: 'medium', status: 'open', recurrence: 'weekly', location: 'SF-12', checklist: [], createdBy: 'System (count prioritizer)' },
  { id: 'TSK-307', title: 'Receive DC Tilburg delivery (ASN 88213)', type: 'receiving', store: '1001', assignee: 'Priya Raman', due: '11:30', priority: 'high', status: 'open', recurrence: 'once', location: 'RCV-01', checklist: [{ text: 'Check seal & pallet count', done: false }, { text: 'Scan ASN & post GR', done: false }, { text: 'Put away to bins', done: false }], createdBy: 'SAP (inbound delivery)' },
  { id: 'TSK-308', title: 'Back-store aisle sweep & cardboard baling', type: 'cleaning', store: '1001', assignee: 'Yusuf Kaya', due: '20:00', priority: 'low', status: 'open', recurrence: 'daily', location: 'Back-store', checklist: [], createdBy: 'Sarah Jenkins' },
  { id: 'TSK-401', title: 'Bakery shelf cleaning', type: 'cleaning', store: '1002', assignee: 'Mila Visser', due: '08:30', priority: 'medium', status: 'done', recurrence: 'daily', checklist: [], createdBy: 'Daan Bakker', completedAt: '2026-11-19T08:21:00Z', completedBy: 'Mila Visser' },
  { id: 'TSK-402', title: 'Replenish chips from BS-A-02-01', type: 'replenish', store: '1002', assignee: 'Mila Visser', due: '12:00', priority: 'medium', status: 'open', recurrence: 'once', checklist: [], createdBy: 'System (replenishment trigger)' },
];

const MSG_SEED: StoreMessage[] = [
  { id: 'MSG-1', ts: '2026-11-19T06:45:00Z', author: 'Sarah Jenkins', store: '1001', kind: 'announcement', pinned: true, text: 'Regional manager visit today 14:00. Please make sure chiller aisles and the electronics wall are fully faced by 13:30.', acknowledgedBy: ['Lars Van Dijk', 'Priya Raman'] },
  { id: 'MSG-2', ts: '2026-11-19T07:05:00Z', author: 'Lars Van Dijk', store: '1001', kind: 'shift_note', text: 'Early shift: freezer BS-F-01-01 door seal is loose — reported to facilities (ticket FAC-2210).', acknowledgedBy: ['Sarah Jenkins'] },
  { id: 'MSG-3', ts: '2026-11-19T08:40:00Z', author: 'Priya Raman', store: '1001', kind: 'message', text: 'DC delivery ETA moved to 11:15. I will need one extra person on the dock.', acknowledgedBy: [] },
  { id: 'MSG-4', ts: '2026-11-19T07:30:00Z', author: 'Daan Bakker', store: '1002', kind: 'announcement', pinned: true, text: 'Black Friday promo planogram changes start tomorrow — check the task list tonight.', acknowledgedBy: [] },
];

export const taskStore = createPersistentStore<StoreTask[]>('ss.tasks.v1', () => TASK_SEED);
export const messageStore = createPersistentStore<StoreMessage[]>('ss.messages.v1', () => MSG_SEED);
