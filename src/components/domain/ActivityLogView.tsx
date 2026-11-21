'use client';

// /src/components/domain/ActivityLogView.tsx
// Shared view for the Audit Log (who / what / when) and Transaction Success & Error Logs (per module).

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Search, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { BarChart, STATUS_COLORS } from '@/components/ui/Charts';
import { activityStore, ActivityEntry, LOG_MODULES, moduleLabel } from '@/lib/activity-log';
import { formatTs } from '@/lib/local-store';
import { roleLabel } from '@/lib/roles';
import { useI18n } from '@/lib/i18n';

const STATUS_BADGE: Record<ActivityEntry['status'], 'healthy' | 'critical' | 'warning'> = { success: 'healthy', error: 'critical', warning: 'warning' };

export function ActivityLogView({ mode }: { mode: 'audit' | 'transactions' }) {
  const [entries] = activityStore.useStore();
  const { t } = useI18n();
  const [module, setModule] = useState('all');
  const [status, setStatus] = useState<'all' | ActivityEntry['status']>('all');
  const [source, setSource] = useState<'all' | 'user' | 'system'>(mode === 'audit' ? 'user' : 'all');
  const [actor, setActor] = useState('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const actors = useMemo(() => Array.from(new Set(entries.map((e) => e.actor))).sort(), [entries]);

  const rows = useMemo(
    () =>
      entries
        .filter((e) => (module === 'all' || e.module === module) && (status === 'all' || e.status === status) && (source === 'all' || e.source === source) && (actor === 'all' || e.actor === actor))
        .filter((e) => {
          const q = query.trim().toLowerCase();
          return !q || [e.actor, e.action, e.entity, e.message ?? '', e.ref ?? '', e.ts].some((v) => v.toLowerCase().includes(q));
        })
        .slice()
        .sort((a, b) => b.ts.localeCompare(a.ts)),
    [entries, module, status, source, actor, query]
  );

  const summary = useMemo(() => {
    const s: Record<string, { success: number; error: number; warning: number }> = {};
    entries.forEach((e) => {
      s[e.module] = s[e.module] ?? { success: 0, error: 0, warning: 0 };
      s[e.module][e.status]++;
    });
    return s;
  }, [entries]);

  const totals = rows.reduce((acc, e) => ({ ...acc, [e.status]: acc[e.status] + 1 }), { success: 0, error: 0, warning: 0 } as Record<ActivityEntry['status'], number>);
  const summaryModules = LOG_MODULES.filter((m) => summary[m.key]);

  const columns = [
    { header: 'Timestamp (UTC)', value: (e: ActivityEntry) => formatTs(e.ts) },
    { header: 'Actor', value: (e: ActivityEntry) => e.actor },
    { header: 'Role', value: (e: ActivityEntry) => (e.role === 'system' ? 'System' : roleLabel(e.role)) },
    { header: 'Source', value: (e: ActivityEntry) => e.source },
    { header: 'Module', value: (e: ActivityEntry) => moduleLabel(e.module) },
    { header: 'Action', value: (e: ActivityEntry) => e.action },
    { header: 'Entity', value: (e: ActivityEntry) => e.entity },
    { header: 'Reference', value: (e: ActivityEntry) => e.ref ?? '' },
    { header: 'Outcome', value: (e: ActivityEntry) => e.status },
    { header: 'Duration (ms)', value: (e: ActivityEntry) => e.durationMs ?? '' },
    { header: 'Message', value: (e: ActivityEntry) => e.message ?? '' },
  ];

  const sel = 'border border-[#D0D5DD] rounded-lg text-xs px-2 py-2 bg-white';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile icon={CheckCircle2} label={t('Success')} value={totals.success} tone="text-[#027A48]" onClick={() => setStatus(status === 'success' ? 'all' : 'success')} active={status === 'success'} />
        <SummaryTile icon={XCircle} label={t('Error')} value={totals.error} tone="text-[#B42318]" onClick={() => setStatus(status === 'error' ? 'all' : 'error')} active={status === 'error'} />
        <SummaryTile icon={AlertTriangle} label={t('Warning')} value={totals.warning} tone="text-[#B54708]" onClick={() => setStatus(status === 'warning' ? 'all' : 'warning')} active={status === 'warning'} />
      </div>

      {mode === 'transactions' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="op-card bg-white p-4 lg:col-span-3">
            <h3 className="text-xs font-semibold text-[#101828] uppercase tracking-wider mb-2">Outcomes by module (all time)</h3>
            <BarChart
              ariaLabel="Success, error and warning counts by module"
              labels={summaryModules.map((m) => m.label)}
              series={[
                { name: 'Success', color: STATUS_COLORS.success, values: summaryModules.map((m) => summary[m.key].success) },
                { name: 'Error', color: STATUS_COLORS.error, values: summaryModules.map((m) => summary[m.key].error) },
                { name: 'Warning', color: STATUS_COLORS.warning, values: summaryModules.map((m) => summary[m.key].warning) },
              ]}
            />
          </div>
          <div className="op-card bg-white overflow-hidden lg:col-span-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#F9FAFB] text-[#667085] border-b border-[#EAECF0]">
                  <th className="py-2 px-3 text-start font-semibold">Module</th>
                  <th className="py-2 px-2 text-end font-semibold">✓</th>
                  <th className="py-2 px-2 text-end font-semibold">✕</th>
                  <th className="py-2 px-2 text-end font-semibold">▲</th>
                  <th className="py-2 px-3 text-end font-semibold">Success rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAECF0]">
                {summaryModules.map((m) => {
                  const s = summary[m.key];
                  const total = s.success + s.error + s.warning;
                  const rate = Math.round((s.success / total) * 100);
                  return (
                    <tr key={m.key} className={`cursor-pointer hover:bg-[#F9FAFB] ${module === m.key ? 'bg-[#E8F4F3]' : ''}`} onClick={() => setModule(module === m.key ? 'all' : m.key)}>
                      <td className="py-2 px-3 font-semibold text-[#101828]">{m.label}</td>
                      <td className="py-2 px-2 text-end font-mono text-[#027A48]">{s.success}</td>
                      <td className="py-2 px-2 text-end font-mono text-[#B42318]">{s.error}</td>
                      <td className="py-2 px-2 text-end font-mono text-[#B54708]">{s.warning}</td>
                      <td className="py-2 px-3 text-end font-mono">{rate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="op-card bg-white overflow-hidden">
        <div className="p-3 border-b border-[#EAECF0] flex flex-col xl:flex-row xl:items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute start-2.5 top-2.5 text-[#98A2B3]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search action, entity, ref, message…" className="ps-8 pe-3 py-2 border border-[#D0D5DD] rounded-lg text-xs w-full sm:w-60" />
            </div>
            <select value={module} onChange={(e) => setModule(e.target.value)} className={sel} aria-label="Module">
              <option value="all">{t('All')} modules</option>
              {LOG_MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={sel} aria-label="Outcome">
              <option value="all">{t('All')} outcomes</option>
              <option value="success">{t('Success')}</option>
              <option value="error">{t('Error')}</option>
              <option value="warning">{t('Warning')}</option>
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className={sel} aria-label="Source">
              <option value="all">User + system</option>
              <option value="user">User actions</option>
              <option value="system">System transactions</option>
            </select>
            <select value={actor} onChange={(e) => setActor(e.target.value)} className={sel} aria-label="Actor">
              <option value="all">All users</option>
              {actors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <ExportMenu
            title={mode === 'audit' ? 'Audit Log' : 'Transaction Success & Error Log'}
            subtitle={`${rows.length} entries · filters: module=${module}, outcome=${status}, source=${source}, user=${actor}`}
            module={mode === 'audit' ? 'audit' : 'translogs'}
            landscape
            rows={rows}
            columns={columns}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[#EAECF0] bg-[#F9FAFB] text-[#667085]">
                <th className="py-2.5 px-3 font-semibold text-start">When (UTC)</th>
                <th className="py-2.5 px-3 font-semibold text-start">Who</th>
                <th className="py-2.5 px-3 font-semibold text-start">Module</th>
                <th className="py-2.5 px-3 font-semibold text-start">What</th>
                <th className="py-2.5 px-3 font-semibold text-start">{mode === 'audit' ? 'Target' : 'Ref'}</th>
                <th className="py-2.5 px-3 font-semibold text-start">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAECF0]">
              {rows.map((e) => (
                <React.Fragment key={e.id}>
                  <tr className={`hover:bg-[#F9FAFB] cursor-pointer ${e.status === 'error' ? 'bg-[#FFFBFA]' : ''}`} onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                    <td className="py-2.5 px-3 font-mono text-[#667085] whitespace-nowrap">{formatTs(e.ts)}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-[#101828]">{e.actor}</div>
                      <div className="text-[10px] text-[#667085]">{e.role === 'system' ? 'System' : roleLabel(e.role)}</div>
                    </td>
                    <td className="py-2.5 px-3 text-[#475467]">{moduleLabel(e.module)}</td>
                    <td className="py-2.5 px-3 text-[#344054]">
                      <div className="font-medium">{e.action}</div>
                      {mode === 'transactions' && <div className="text-[10px] text-[#667085]">{e.entity}</div>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#475467]">{mode === 'audit' ? e.entity : e.ref ?? '—'}</td>
                    <td className="py-2.5 px-3"><Badge status={STATUS_BADGE[e.status]} size="sm">{e.status}</Badge></td>
                  </tr>
                  {expanded === e.id && (
                    <tr className="bg-[#F9FAFB]">
                      <td colSpan={6} className="px-3 py-2.5 text-[11px] text-[#475467] space-y-0.5">
                        <div><b>Entity:</b> {e.entity}</div>
                        {e.ref && <div><b>Reference:</b> <span className="font-mono">{e.ref}</span></div>}
                        {e.durationMs != null && <div><b>Duration:</b> <span className="font-mono">{e.durationMs} ms</span></div>}
                        <div><b>Message:</b> {e.message ?? '—'}</div>
                        <div className="font-mono text-[10px] text-[#98A2B3]">id {e.id} · source {e.source}</div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-[#667085]">No log entries match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value, tone, onClick, active }: { icon: React.ElementType; label: string; value: number; tone: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={`op-card bg-white p-3 text-start transition-all ${active ? 'ring-2 ring-[#14706B]/30 border-[#14706B]' : ''}`}>
      <div className={`text-[11px] font-semibold flex items-center gap-1.5 ${tone}`}><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className="text-2xl font-bold text-[#101828]">{value}</div>
    </button>
  );
}
