'use client';

// /src/app/(desktop)/admin/integrations/page.tsx
// SmartStock LiveRetail V2 — Enterprise Integration Control Tower
//
// All numbers shown here come from Supabase tables that actually exist in
// supabase/migrations. Where no table persists a signal (adapter latency,
// browser-side IndexedDB queue state), the UI says so explicitly instead of
// inventing a plausible-looking value. See docs/SAP_INTEGRATION_ARCHITECTURE.md §14 item 15.

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Database, RefreshCw, Server, Zap } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

interface ErpConfiguration {
  id: string;
  erp_name: string;
  erp_type: string;
  connection_status: string;
  last_health_check_at: string | null;
  last_sync_at: string | null;
  last_error_message: string | null;
}

interface PosFeedHealth {
  id: string;
  health_status: string;
  last_event_at: string | null;
  last_reconciled_at: string | null;
  sequence_gap_count: number | null;
  events_today: number | null;
  feed_confidence: number | null;
}

interface OutboxCounts {
  pending: number;
  retrying: number;
  outcomeUnknown: number;
  deadLetter: number;
}

const ERP_COLUMNS =
  'id, erp_name, erp_type, connection_status, last_health_check_at, last_sync_at, last_error_message';
const POS_HEALTH_COLUMNS =
  'id, health_status, last_event_at, last_reconciled_at, sequence_gap_count, events_today, feed_confidence';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatUtc(value: string | null | undefined, emptyLabel = 'Not yet probed'): string {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  const stamp = date.toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${stamp} UTC`;
}

function relativeTime(value: string | null | undefined): string {
  if (!value) return 'never';
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return 'unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - target) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function sapStatus(connectionStatus: string | undefined): { label: string; tone: Tone } {
  switch (connectionStatus) {
    case 'active':
      return { label: 'ACTIVE', tone: 'good' };
    case 'error':
      return { label: 'ERROR', tone: 'bad' };
    case 'inactive':
      return { label: 'INACTIVE', tone: 'neutral' };
    default:
      return { label: 'NOT CONFIGURED', tone: 'neutral' };
  }
}

function posStatus(healthStatus: string | undefined): { label: string; tone: Tone } {
  switch (healthStatus) {
    case 'HEALTHY':
      return { label: 'STREAMING', tone: 'good' };
    case 'DEGRADED':
      return { label: 'DEGRADED', tone: 'warn' };
    case 'STALE':
      return { label: 'STALE', tone: 'warn' };
    case 'FAILED':
      return { label: 'FAILED', tone: 'bad' };
    default:
      return { label: 'NO TELEMETRY', tone: 'neutral' };
  }
}

function StatusBadge({ label, tone, live = false }: { label: string; tone: Tone; live?: boolean }) {
  const tones: Record<Tone, { wrap: string; dot: string }> = {
    good: {
      wrap: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      dot: 'bg-emerald-500',
    },
    warn: {
      wrap: 'text-amber-700 bg-amber-50 border-amber-200',
      dot: 'bg-amber-500',
    },
    bad: {
      wrap: 'text-rose-700 bg-rose-50 border-rose-200',
      dot: 'bg-rose-500',
    },
    neutral: {
      wrap: 'text-slate-600 bg-slate-50 border-slate-200',
      dot: 'bg-slate-400',
    },
  };
  const t = tones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${t.wrap}`}
      title={live ? 'Derived from the latest persisted health signal' : 'No persisted health signal'}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot} ${live && tone === 'good' ? 'animate-ping' : ''}`} />
      {label}
    </span>
  );
}

// Static generation: Next serves /admin/integrations from the static cache
// instead of re-rendering per request — the first few seconds of the hillclimb.
export const dynamic = 'force-static'

export default function IntegrationControlTowerPage() {
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenantScoped, setTenantScoped] = useState(false);
  const [erpConfig, setErpConfig] = useState<ErpConfiguration | null>(null);
  const [posFeeds, setPosFeeds] = useState<PosFeedHealth[]>([]);
  const [outbox, setOutbox] = useState<OutboxCounts | null>(null);

  const loadTelemetry = useCallback(async () => {
    setLoading(true);
    setProbing(true);
    setError(null);

    try {
      // Resolve a tenant only when the signed-in user actually carries one.
      // A non-UUID or missing claim is never used to filter UUID columns.
      let tenantId: string | null = null;
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        const claims = user?.app_metadata?.live_retail_claims as { tenant_id?: string } | undefined;
        const candidate =
          claims?.tenant_id ??
          (user?.app_metadata?.tenant_id as string | undefined) ??
          (user?.user_metadata?.tenant_id as string | undefined);
        if (candidate && UUID_PATTERN.test(candidate)) tenantId = candidate;
      } catch {
        // Anonymous / expired session: fall back to an unscoped read below.
      }
      setTenantScoped(Boolean(tenantId));

      const problems: string[] = [];

      // --- SAP ERP: authoritative signal is erp_configurations (§14.15). ---
      let erpQuery = supabase.from('erp_configurations').select(ERP_COLUMNS);
      if (tenantId) erpQuery = erpQuery.eq('tenant_id', tenantId);
      const erpRes = await erpQuery
        .order('connection_status', { ascending: true }) // 'active' sorts first
        .order('created_at', { ascending: false })
        .limit(1);
      if (erpRes.error) {
        problems.push(`SAP configuration: ${erpRes.error.message}`);
        setErpConfig(null);
      } else {
        setErpConfig((erpRes.data?.[0] as ErpConfiguration) ?? null);
      }

      // --- POS feed telemetry (real table: migration 55). ---
      let posQuery = supabase.from('pos_feed_health').select(POS_HEALTH_COLUMNS);
      if (tenantId) posQuery = posQuery.eq('tenant_id', tenantId);
      const posRes = await posQuery.order('updated_at', { ascending: false });
      if (posRes.error) {
        problems.push(`POS feed health: ${posRes.error.message}`);
        setPosFeeds([]);
      } else {
        setPosFeeds((posRes.data ?? []) as PosFeedHealth[]);
      }

      // --- Durable outbox counts (real table: migration 35). ---
      const countOutbox = async (status: string) => {
        let q = supabase
          .from('integration_outbox')
          .select('id', { count: 'exact', head: true })
          .eq('status', status);
        if (tenantId) q = q.eq('tenant_id', tenantId);
        return q;
      };
      const [pending, retrying, outcomeUnknown, deadLetter] = await Promise.all([
        countOutbox('PENDING'),
        countOutbox('RETRYING'),
        countOutbox('OUTCOME_UNKNOWN'),
        countOutbox('DEAD_LETTER'),
      ]);
      const outboxErrors = [pending, retrying, outcomeUnknown, deadLetter]
        .filter((r) => r.error)
        .map((r) => r.error!.message);
      if (outboxErrors.length) {
        problems.push(`Integration outbox: ${outboxErrors.join('; ')}`);
        setOutbox(null);
      } else {
        setOutbox({
          pending: pending.count ?? 0,
          retrying: retrying.count ?? 0,
          outcomeUnknown: outcomeUnknown.count ?? 0,
          deadLetter: deadLetter.count ?? 0,
        });
      }

      if (problems.length) setError(problems.join(' • '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to probe integration telemetry.');
    } finally {
      setLoading(false);
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void loadTelemetry();
  }, [loadTelemetry]);

  const sap = sapStatus(erpConfig?.connection_status);
  const pos = posStatus(posFeeds[0]?.health_status);
  const hasPosTelemetry = posFeeds.length > 0;
  const totalGaps = posFeeds.reduce((sum, feed) => sum + (feed.sequence_gap_count ?? 0), 0);
  const lastSale = hasPosTelemetry
    ? posFeeds
        .map((feed) => feed.last_event_at)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0]
    : null;
  const eventsToday = posFeeds.reduce((sum, feed) => sum + (feed.events_today ?? 0), 0);

  const outboxKpis: Array<{ label: string; value: number | null; accent: string; hint: string }> = [
    {
      label: 'Pending Outbound',
      value: outbox?.pending ?? null,
      accent: 'text-blue-600',
      hint: "integration_outbox rows with status = 'PENDING'",
    },
    {
      label: 'Retrying Backoff',
      value: outbox?.retrying ?? null,
      accent: 'text-amber-600',
      hint: "integration_outbox rows with status = 'RETRYING'",
    },
    {
      label: 'Outcome Unknown',
      value: outbox?.outcomeUnknown ?? null,
      accent: 'text-slate-800',
      hint: "integration_outbox rows with status = 'OUTCOME_UNKNOWN' (SAP result may already be posted)",
    },
    {
      label: 'Dead Letter Queue',
      value: outbox?.deadLetter ?? null,
      accent: 'text-rose-600',
      hint: "integration_outbox rows with status = 'DEAD_LETTER'",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-extrabold uppercase">
              Operational Gateways Active
            </span>
            <span className="text-xs text-slate-400">Enterprise Control Tower</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-2">Integration Health &amp; Outbox Pipeline</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time feed health, SAP S/4HANA OData gateway status, and durable outbox telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/integrations/performance"
            className="px-4 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 text-xs font-bold transition flex items-center gap-2 border border-violet-400/30"
          >
            Performance Hillclimb
          </Link>
          <Link
            href="/admin/integrations/onboarding"
            className="px-4 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-100 text-xs font-bold transition flex items-center gap-2 border border-indigo-400/30"
          >
            Onboard SAP (Preflight)
          </Link>
          <button
            onClick={() => void loadTelemetry()}
            disabled={probing}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white text-xs font-bold transition flex items-center gap-2 border border-white/10"
          >
            <RefreshCw className={`w-4 h-4 ${probing ? 'animate-spin' : ''}`} />
            <span>{probing ? 'Probing…' : 'Probe Gateways'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong className="font-bold">Telemetry probe incomplete:</strong> {error}. Values that could not be
            read are shown as “—” / “No telemetry available”.
          </span>
        </div>
      )}

      {!tenantScoped && !loading && (
        <p className="text-[11px] text-slate-500">
          No tenant claim could be resolved from the current session, so ERP configuration is read unscoped (first
          available row) and is not asserted to be tenant-specific.
        </p>
      )}

      {/* Systems Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* SAP ERP */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">SAP S/4HANA OData</h3>
                <span
                  className="text-[10px] text-slate-400 font-mono block"
                  title="Gateway client / adapter latency are not persisted in erp_configurations"
                >
                  {erpConfig
                    ? `${erpConfig.erp_name} · ${erpConfig.erp_type}`
                    : 'No ERP configuration found'}
                </span>
              </div>
            </div>
            <StatusBadge label={sap.label} tone={sap.tone} live={Boolean(erpConfig)} />
          </div>
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 space-y-1 font-mono">
            <div className="flex justify-between gap-2">
              <span>
                Last health check:{' '}
                <span className="text-slate-700">{formatUtc(erpConfig?.last_health_check_at)}</span>
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>
                Last sync:{' '}
                <span className="text-slate-700">
                  {formatUtc(erpConfig?.last_sync_at, 'Not yet recorded')}
                </span>
              </span>
            </div>
            <div
              className="flex justify-between gap-2 text-slate-400"
              title="adapter.healthCheck() latency is not stored in erp_configurations; only the check timestamp is persisted"
            >
              <span>Latency not recorded</span>
            </div>
            {erpConfig?.last_error_message && (
              <div
                className="text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 break-words"
                title="last_error_message from erp_configurations"
              >
                {erpConfig.last_error_message}
              </div>
            )}
          </div>
        </div>

        {/* POS Ingestion */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">POS Stream Gateway</h3>
                <span
                  className="text-[10px] text-slate-400 font-mono block"
                  title="Active feeds are rows in pos_feed_health (migration 55), not a hard-coded register count"
                >
                  {hasPosTelemetry
                    ? `${posFeeds.length} Active ${posFeeds.length === 1 ? 'Register' : 'Registers'}`
                    : 'No connector telemetry'}
                </span>
              </div>
            </div>
            <StatusBadge label={pos.label} tone={pos.tone} live={hasPosTelemetry} />
          </div>
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 space-y-1 font-mono">
            {hasPosTelemetry ? (
              <>
                <div className="flex justify-between gap-2">
                  <span>
                    Last Sale: <span className="text-slate-700">{relativeTime(lastSale)}</span>
                  </span>
                  <span title="Sum of sequence_gap_count across reported feeds">
                    <span className="text-slate-700 font-bold">{totalGaps}</span> Sequence
                    {totalGaps === 1 ? '' : 's'} Gap{totalGaps === 1 ? '' : 's'}
                  </span>
                </div>
                <div
                  className="flex justify-between gap-2 text-[10px] text-slate-400"
                  title="events_today and feed_confidence from pos_feed_health"
                >
                  <span>{eventsToday} events today</span>
                  <span>Last reconciled: {formatUtc(posFeeds[0]?.last_reconciled_at, 'Not yet recorded')}</span>
                </div>
              </>
            ) : (
              <div
                className="text-slate-400"
                title="pos_feed_health has no rows for this tenant. Registers, last-sale time and sequence gaps are only reported once a POS connector publishes feed health."
              >
                No telemetry available
              </div>
            )}
          </div>
        </div>

        {/* PWA Mobile Offline Queue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">PWA Offline Sync</h3>
                <span
                  className="text-[10px] text-slate-400 font-mono block"
                  title="IndexedDB queue state lives in each browser and is not written to any Supabase table"
                >
                  No telemetry available
                </span>
              </div>
            </div>
            <StatusBadge label="NO TELEMETRY" tone="neutral" />
          </div>
          <div
            className="text-xs text-slate-500 pt-2 border-t border-slate-100 space-y-1 font-mono"
            title="No Supabase migration persists browser IndexedDB queue depth or flush rate; these values are intentionally not fabricated"
          >
            <div className="flex justify-between gap-2">
              <span>IndexedDB Queue: Not yet probed</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-700 font-bold">Flush rate: No telemetry available</span>
            </div>
          </div>
        </div>
      </div>

      {/* Outbox Pipeline Status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
            Durable Integration Outbox State
          </h2>
        </div>
        <p className="text-[11px] text-slate-500 -mt-2">
          Live counts by <span className="font-mono">integration_outbox.status</span>
          {tenantScoped ? ' (scoped to the resolved tenant)' : ' (no tenant claim resolved)'}.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          {outboxKpis.map((kpi) => (
            <div
              key={kpi.label}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200"
              title={kpi.hint}
            >
              <span className="text-slate-400 block text-[10px] uppercase font-bold">{kpi.label}</span>
              <span className={`text-2xl font-extrabold ${kpi.accent}`}>
                {loading ? '…' : kpi.value === null ? '—' : kpi.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
