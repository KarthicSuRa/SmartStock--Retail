'use client';

// /src/app/(desktop)/tasks/page.tsx
// SmartStock — Store employee daily task board (cleaning, bin movements, replenishment, counts, receiving)
// plus team communication (announcements, shift notes, messages with read receipts).

import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Clock, MapPin, Megaphone, MessageSquare, Pin, Plus, StickyNote, User, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { PageHeader, RoleGuard } from '@/components/domain/RoleGuard';
import { useStoreContext } from '@/hooks/useStoreContext';
import { useToast } from '@/hooks/useToast';
import { EMPLOYEES, STORES } from '@/lib/master-data';
import { messageStore, StoreMessage, StoreTask, TASK_TYPES, taskStore, TaskStatus, TaskType } from '@/lib/tasks';
import { logActivity } from '@/lib/activity-log';
import { formatTs, newId } from '@/lib/local-store';
import { useAuthorization } from '@/lib/roles';
import { useI18n } from '@/lib/i18n';

const PRIORITY_BADGE = { high: 'critical', medium: 'warning', low: 'neutral' } as const;
const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

export default function TasksPage() {
  return (
    <RoleGuard module="tasks">
      <TasksInner />
    </RoleGuard>
  );
}

function TasksInner() {
  const { activeStoreId, role } = useStoreContext();
  const { canEdit, canApprove } = useAuthorization('tasks');
  const { toast } = useToast();
  const { t } = useI18n();
  const [tasks, setTasks] = taskStore.useStore();
  const [messages, setMessages] = messageStore.useStore();

  const taskStores = Array.from(new Set(EMPLOYEES.map((e) => e.store)));
  const [store, setStore] = useState(taskStores.includes(activeStoreId ?? '') ? (activeStoreId as string) : '1001');
  const staff = EMPLOYEES.filter((e) => e.store === store);
  const defaultMe = () => (staff.find((e) => e.role === role) ?? staff[0])?.name ?? 'Karthic B';
  const [me, setMe] = useState(defaultMe);
  const [onlyMine, setOnlyMine] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | TaskType>('all');
  const [mobileCol, setMobileCol] = useState<TaskStatus>('open');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', type: 'cleaning' as TaskType, assignee: '', due: '12:00', priority: 'medium' as StoreTask['priority'], recurrence: 'once' as StoreTask['recurrence'], location: '', checklist: '' });
  const [msgDraft, setMsgDraft] = useState<{ kind: StoreMessage['kind']; text: string }>({ kind: 'message', text: '' });
  const [nowHM, setNowHM] = useState<string | null>(null);

  useEffect(() => setMe(defaultMe()), [store, role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tick = () => setNowHM(new Date().toTimeString().slice(0, 5));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const storeTasks = useMemo(
    () => tasks.filter((tk) => tk.store === store && (!onlyMine || tk.assignee === me) && (typeFilter === 'all' || tk.type === typeFilter)).sort((a, b) => a.due.localeCompare(b.due)),
    [tasks, store, onlyMine, me, typeFilter]
  );
  const allStoreTasks = tasks.filter((tk) => tk.store === store);
  const doneCount = allStoreTasks.filter((tk) => tk.status === 'done').length;
  const isOverdue = (tk: StoreTask) => !!nowHM && tk.status !== 'done' && tk.due < nowHM;
  const overdue = allStoreTasks.filter(isOverdue).length;
  const storeMsgs = messages.filter((m) => m.store === store).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.ts.localeCompare(a.ts));

  const update = (id: string, patch: Partial<StoreTask>) => setTasks((prev) => prev.map((tk) => (tk.id === id ? { ...tk, ...patch } : tk)));
  const canWorkOn = (tk: StoreTask) => canApprove || (canEdit && tk.assignee === me);

  const setStatus = (tk: StoreTask, status: TaskStatus) => {
    if (!canWorkOn(tk)) {
      toast({ type: 'warning', title: 'Not assigned to you', description: `Only ${tk.assignee} or a manager can update this task.` });
      logActivity({ module: 'tasks', action: `Task → ${status}`, entity: `${tk.id} ${tk.title}`, status: 'error', actor: me, message: 'Not authorized: task assigned to another employee' });
      return;
    }
    if (status === 'done' && tk.checklist.some((c) => !c.done)) {
      toast({ type: 'error', title: 'Checklist incomplete', description: 'Tick off every checklist step before completing the task.' });
      logActivity({ module: 'tasks', action: 'Task completion', entity: `${tk.id} ${tk.title}`, status: 'error', actor: me, message: `${tk.checklist.filter((c) => !c.done).length} checklist step(s) open` });
      return;
    }
    update(tk.id, status === 'done' ? { status, completedAt: new Date().toISOString(), completedBy: me } : { status, completedAt: undefined, completedBy: undefined });
    logActivity({ module: 'tasks', action: `Task ${status === 'done' ? 'completed' : status === 'in_progress' ? 'started' : 'reopened'}`, entity: `${tk.id} ${tk.title}`, status: 'success', actor: me, ref: tk.id });
    if (status === 'done') toast({ type: 'success', title: 'Task completed', description: tk.title });
  };

  const toggleCheck = (tk: StoreTask, idx: number) => {
    if (!canWorkOn(tk)) return;
    update(tk.id, { checklist: tk.checklist.map((c, i) => (i === idx ? { ...c, done: !c.done } : c)), status: tk.status === 'open' ? 'in_progress' : tk.status });
  };

  const addTask = () => {
    const assignee = draft.assignee || staff[0]?.name;
    if (!draft.title.trim() || !assignee) {
      toast({ type: 'error', title: 'Title and assignee are required' });
      return;
    }
    const tk: StoreTask = {
      id: newId('TSK'),
      title: draft.title.trim(),
      type: draft.type,
      store,
      assignee,
      due: draft.due,
      priority: draft.priority,
      status: 'open',
      recurrence: draft.recurrence,
      location: draft.location.trim() || undefined,
      checklist: draft.checklist.split('\n').map((s) => s.trim()).filter(Boolean).map((text) => ({ text, done: false })),
      createdBy: me,
    };
    setTasks((prev) => [...prev, tk]);
    logActivity({ module: 'tasks', action: 'Task assigned', entity: `${tk.title} → ${assignee}`, status: 'success', actor: me, ref: tk.id });
    toast({ type: 'success', title: 'Task assigned', description: `${tk.title} → ${assignee}` });
    setDraft({ ...draft, title: '', location: '', checklist: '' });
    setAdding(false);
  };

  const postMessage = () => {
    if (!msgDraft.text.trim()) return;
    if (msgDraft.kind === 'announcement' && !canApprove) {
      toast({ type: 'warning', title: 'Announcements are manager-only' });
      return;
    }
    const m: StoreMessage = { id: newId('MSG'), ts: new Date().toISOString(), author: me, store, kind: msgDraft.kind, text: msgDraft.text.trim(), pinned: msgDraft.kind === 'announcement', acknowledgedBy: [] };
    setMessages((prev) => [...prev, m]);
    logActivity({ module: 'tasks', action: `Posted ${m.kind.replace('_', ' ')}`, entity: m.text.slice(0, 60), status: 'success', actor: me });
    setMsgDraft({ ...msgDraft, text: '' });
  };

  const acknowledge = (m: StoreMessage) => {
    if (m.acknowledgedBy.includes(me)) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, acknowledgedBy: [...x.acknowledgedBy, me] } : x)));
    logActivity({ module: 'tasks', action: 'Message acknowledged', entity: `${m.id} by ${me}`, status: 'success', actor: me });
  };

  const typeLabel = (k: TaskType) => t(TASK_TYPES.find((x) => x.key === k)?.label ?? k);
  const inp = 'border border-[#D0D5DD] rounded-lg px-2 py-1.5 text-xs bg-white';

  const renderCard = (tk: StoreTask) => (
    <div key={tk.id} className={`p-3 rounded-lg border bg-white space-y-2 ${isOverdue(tk) ? 'border-[#FDA29B]' : 'border-[#EAECF0]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-[#101828] leading-snug">{tk.title}</div>
        <Badge status={PRIORITY_BADGE[tk.priority]} size="sm" showIcon={false}>{tk.priority}</Badge>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#667085]">
        <span className="inline-flex items-center gap-1"><Badge status="info" size="sm" showIcon={false}>{typeLabel(tk.type)}</Badge></span>
        <span className={`inline-flex items-center gap-1 ${isOverdue(tk) ? 'text-[#B42318] font-bold' : ''}`}><Clock className="w-3 h-3" /> {tk.due}{isOverdue(tk) ? ' · overdue' : ''}</span>
        <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {tk.assignee}</span>
        {tk.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {tk.location}</span>}
        {tk.recurrence !== 'once' && <span className="font-mono">↻ {tk.recurrence}</span>}
      </div>
      {tk.checklist.length > 0 && (
        <ul className="space-y-1">
          {tk.checklist.map((c, i) => (
            <li key={i}>
              <label className={`flex items-center gap-2 text-[11px] ${canWorkOn(tk) ? 'cursor-pointer' : ''}`}>
                <input type="checkbox" checked={c.done} disabled={!canWorkOn(tk) || tk.status === 'done'} onChange={() => toggleCheck(tk, i)} className="accent-[#14706B]" />
                <span className={c.done ? 'line-through text-[#98A2B3]' : 'text-[#344054]'}>{c.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {tk.status === 'done' ? (
        <div className="text-[10px] text-[#027A48] font-mono flex items-center justify-between">
          <span>✓ {tk.completedBy} · {tk.completedAt ? formatTs(tk.completedAt).slice(11, 16) : ''} UTC</span>
          {canWorkOn(tk) && <button onClick={() => setStatus(tk, 'open')} className="text-[#667085] hover:underline">reopen</button>}
        </div>
      ) : (
        canWorkOn(tk) && (
          <div className="flex gap-1.5">
            {tk.status === 'open' && <button onClick={() => setStatus(tk, 'in_progress')} className="flex-1 py-1.5 text-[11px] font-semibold rounded border border-[#D0D5DD] hover:bg-[#F9FAFB]">{t('Start')}</button>}
            <button onClick={() => setStatus(tk, 'done')} className="flex-1 py-1.5 text-[11px] font-bold rounded bg-[#14706B] text-white hover:bg-[#0E5652] inline-flex items-center justify-center gap-1"><Check className="w-3 h-3" /> {t('Mark done')}</button>
          </div>
        )
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Daily Tasks')}
        subtitle="Plan and track store employees' daily work — cleaning rounds, bin movements, shelf replenishment, counts, receiving — and keep the team informed."
        badge={<Badge status="healthy" size="sm">{STORES.find((s) => s.code === store)?.name}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <select value={store} onChange={(e) => setStore(e.target.value)} className={inp} aria-label={t('Store')}>
              {taskStores.map((s) => <option key={s} value={s}>{s} · {STORES.find((x) => x.code === s)?.name}</option>)}
            </select>
            <select value={me} onChange={(e) => setMe(e.target.value)} className={inp} aria-label="Viewing as">
              {staff.map((e) => <option key={e.id} value={e.name}>Me: {e.name}</option>)}
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Today's tasks" value={String(allStoreTasks.length)} />
        <Tile label="Completed" value={`${allStoreTasks.length ? Math.round((doneCount / allStoreTasks.length) * 100) : 0}%`} bar={allStoreTasks.length ? doneCount / allStoreTasks.length : 0} />
        <Tile label="Overdue" value={nowHM ? String(overdue) : '–'} tone={overdue ? 'crit' : undefined} />
        <Tile label="My open tasks" value={String(allStoreTasks.filter((tk) => tk.assignee === me && tk.status !== 'done').length)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Board */}
        <div className="xl:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 items-center">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className={inp} aria-label="Task type">
                <option value="all">{t('All')}</option>
                {TASK_TYPES.map((x) => <option key={x.key} value={x.key}>{t(x.label)}</option>)}
              </select>
              <label className="text-xs flex items-center gap-1.5 text-[#344054]">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="accent-[#14706B]" /> My tasks only
              </label>
            </div>
            <div className="flex gap-2">
              <ExportMenu
                title={`Daily Tasks ${store}`}
                module="tasks"
                landscape
                rows={storeTasks}
                columns={[
                  { header: 'ID', value: (x) => x.id },
                  { header: 'Task', value: (x) => x.title },
                  { header: 'Type', value: (x) => TASK_TYPES.find((y) => y.key === x.type)?.label },
                  { header: 'Assignee', value: (x) => x.assignee },
                  { header: 'Due', value: (x) => x.due },
                  { header: 'Priority', value: (x) => x.priority },
                  { header: 'Status', value: (x) => x.status },
                  { header: 'Location', value: (x) => x.location ?? '' },
                  { header: 'Checklist', value: (x) => x.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join('; ') },
                  { header: 'Completed by', value: (x) => x.completedBy ?? '' },
                ]}
              />
              {canApprove && (
                <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 px-3 h-8 text-xs font-bold rounded-[6px] bg-[#14706B] text-white">
                  <Plus className="w-3.5 h-3.5" /> {t('Add Task')}
                </button>
              )}
            </div>
          </div>

          {adding && (
            <div className="op-card bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#101828]">{t('Add Task')}</h3>
                <button onClick={() => setAdding(false)} aria-label="Close"><X className="w-4 h-4 text-[#667085]" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Task title" className={`${inp} sm:col-span-2 lg:col-span-3`} />
                <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TaskType })} className={inp}>
                  {TASK_TYPES.map((x) => <option key={x.key} value={x.key}>{t(x.label)}</option>)}
                </select>
                <select value={draft.assignee || staff[0]?.name} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} className={inp}>
                  {staff.map((e) => <option key={e.id} value={e.name}>{t('Assigned to')}: {e.name} ({e.shift})</option>)}
                </select>
                <input type="time" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} className={inp} aria-label={t('Due')} />
                <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as StoreTask['priority'] })} className={inp}>
                  <option value="high">{t('Priority')}: high</option>
                  <option value="medium">{t('Priority')}: medium</option>
                  <option value="low">{t('Priority')}: low</option>
                </select>
                <select value={draft.recurrence} onChange={(e) => setDraft({ ...draft, recurrence: e.target.value as StoreTask['recurrence'] })} className={inp}>
                  <option value="once">One-off</option>
                  <option value="daily">Repeat daily</option>
                  <option value="weekly">Repeat weekly</option>
                </select>
                <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Location / bin (optional)" className={inp} />
                <textarea value={draft.checklist} onChange={(e) => setDraft({ ...draft, checklist: e.target.value })} placeholder="Checklist steps — one per line (optional)" rows={3} className={`${inp} sm:col-span-2 lg:col-span-3`} />
              </div>
              <div className="flex justify-end">
                <button onClick={addTask} className="px-4 py-2 text-xs font-bold rounded-lg bg-[#14706B] text-white">Assign task</button>
              </div>
            </div>
          )}

          {/* Mobile column switcher */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#F2F4F7] rounded-lg text-xs font-semibold md:hidden">
            {COLUMNS.map((c) => (
              <button key={c.key} onClick={() => setMobileCol(c.key)} className={`py-1.5 rounded-md ${mobileCol === c.key ? 'bg-white shadow text-[#14706B]' : 'text-[#475467]'}`}>
                {t(c.label)} ({storeTasks.filter((x) => x.status === c.key).length})
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {COLUMNS.map((c) => (
              <div key={c.key} className={`rounded-xl bg-[#F2F4F7] p-2.5 space-y-2 ${mobileCol === c.key ? '' : 'hidden md:block'}`}>
                <div className="text-[11px] font-bold text-[#475467] uppercase px-1 flex justify-between">
                  <span>{t(c.label)}</span>
                  <span className="font-mono">{storeTasks.filter((x) => x.status === c.key).length}</span>
                </div>
                {storeTasks.filter((x) => x.status === c.key).map(renderCard)}
                {storeTasks.filter((x) => x.status === c.key).length === 0 && <div className="text-[11px] text-[#98A2B3] text-center py-4">—</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Communication */}
        <div className="op-card bg-white p-4 space-y-3 h-fit">
          <h3 className="text-xs font-semibold text-[#101828] uppercase tracking-wider flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> {t('Communication')}</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#F2F4F7] rounded-lg text-[11px] font-semibold">
              {([['message', 'Message'], ['shift_note', 'Shift note'], ['announcement', 'Announce']] as [StoreMessage['kind'], string][]).map(([k, l]) => (
                <button key={k} disabled={k === 'announcement' && !canApprove} onClick={() => setMsgDraft({ ...msgDraft, kind: k })} className={`py-1 rounded-md disabled:opacity-40 ${msgDraft.kind === k ? 'bg-white shadow text-[#14706B]' : 'text-[#475467]'}`}>{l}</button>
              ))}
            </div>
            <textarea value={msgDraft.text} onChange={(e) => setMsgDraft({ ...msgDraft, text: e.target.value })} rows={2} placeholder="Write to the store team…" className={`${inp} w-full`} />
            <button onClick={postMessage} disabled={!msgDraft.text.trim()} className="w-full py-2 text-xs font-bold rounded-lg bg-[#14706B] text-white disabled:opacity-40">{t('Post')}</button>
          </div>
          <ul className="space-y-2 max-h-[560px] overflow-y-auto">
            {storeMsgs.map((m) => {
              const Icon = m.kind === 'announcement' ? Megaphone : m.kind === 'shift_note' ? StickyNote : MessageSquare;
              const acked = m.acknowledgedBy.includes(me);
              return (
                <li key={m.id} className={`p-3 rounded-lg border text-xs space-y-1.5 ${m.pinned ? 'border-[#FEDF89] bg-[#FFFCF5]' : 'border-[#EAECF0]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#101828] inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-[#14706B]" /> {m.author}</span>
                    <span className="text-[10px] text-[#98A2B3] font-mono inline-flex items-center gap-1">{m.pinned && <Pin className="w-3 h-3" />}{formatTs(m.ts).slice(11, 16)}</span>
                  </div>
                  <p className="text-[#344054] leading-relaxed">{m.text}</p>
                  <div className="flex items-center justify-between text-[10px] text-[#667085]">
                    <span title={m.acknowledgedBy.join(', ')}><CheckCheck className="w-3 h-3 inline" /> Read by {m.acknowledgedBy.length}/{staff.length}</span>
                    {m.author !== me && (
                      <button onClick={() => acknowledge(m)} disabled={acked} className={`font-semibold ${acked ? 'text-[#027A48]' : 'text-[#14706B] hover:underline'}`}>{acked ? '✓ Read' : 'Mark as read'}</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, tone, bar }: { label: string; value: string; tone?: 'crit'; bar?: number }) {
  return (
    <div className="op-card bg-white p-3">
      <div className="text-[11px] font-semibold text-[#667085]">{label}</div>
      <div className={`text-2xl font-bold ${tone === 'crit' ? 'text-[#B42318]' : 'text-[#101828]'}`}>{value}</div>
      {bar != null && (
        <div className="h-1.5 rounded-full bg-[#F2F4F7] mt-1 overflow-hidden"><div className="h-full bg-[#14706B] rounded-full" style={{ width: `${Math.round(bar * 100)}%` }} /></div>
      )}
    </div>
  );
}
