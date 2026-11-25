'use client';

// /src/app/(desktop)/admin/integrations/performance/page.tsx
// Hillclimb dashboard: p50/p95 latency, bytes transferred and overall lag per route.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bolt, GitCompareArrows } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { summarizeMetrics, PerfMetricsSummary } from '@/lib/performance';

interface MetricRow {
  route: string;
  duration_ms: number;
  ttfb_ms?: number | null;
  fcp_ms?: number | null;
  lcp_ms?: number | null;
  cls?: number | null;
  inp_ms?: number | null;
  bytes_in?: number | null;
  bytes_out?: number | null;
  created_at: string;
}

const WINDOW_DAYS = [1, 7, 30] as const;

function toFixed2(value: number): string {
  return value.toFixed(2);
}

export default function PerfDashboard() {
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [windowDays, setWindowDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
      const { data, error: queryError } = await supabase
        .from('app_performance_metrics')
        .select('route, duration_ms, ttfb_ms, fcp_ms, lcp_ms, cls, inp_ms, bytes_in, bytes_out, created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(500);
      if (queryError) throw new Error(queryError.message);
      setRows(data as MetricRow[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeMetrics(rows.map((r) => ({ duration_ms: r.duration_ms }))), [rows]);
  const topRoutes = useMemo(() => {
    const totals = new Map<string, number[]>();
    for (const row of rows) {
      const arr = totals.get(row.route) ?? [];
      arr.push(row.duration_ms);
      totals.set(row.route, arr);
    }
    return Array.from(totals.entries())
      .map(([route, durations]) => {
        const lat = summarizeMetrics(durations.map((d) => ({ duration_ms: d })));
        return { route, p50: lat.latency.p50, p95: lat.latency.p95, count: durations.length };
      })
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 10);
  }, [rows]);

  const ttfb = rows.filter((r) => r.ttfb_ms != null) as Array<MetricRow & { ttfb_ms: number }>;
  const lcp = rows.filter((r) => r.lcp_ms != null) as Array<MetricRow & { lcp_ms: number }>;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl">
        <Link href="/admin/integrations" className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white mb-3">
          <ArrowLeft className="w-3 h-3" /> Back to control tower
        </Link>
        <div className="flex items-center gap-2">
          <Bolt className="w-5 h-5 text-violet-400" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-violet-300">App performance hillclimb</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight mt-2">Performance Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">
          Track latency, bytes transferred and overall lag — trends are only actionable when they trend down.
        </p>
        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
          <GitCompareArrows className="w-3 h-3" /> SLO targets come from the latest review; see <code className="text-violet-300">docs/LOAD_TEST_RESULTS.md</code>.
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-xs">
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Latency p50 (ms)" value={summary.latency.p50} hint="overall app latency" />
        <SummaryCard label="Latency p95 (ms)" value={summary.latency.p95} hint="upper tail drives UX" />
        <SummaryCard label="Bytes transferred (B)" value={summary.bytes.total} hint={`avg ${summary.bytes.avg} B/page`} />
        <SummaryCard label="Lag p95 (ms)" value={summary.lagMs.p95} hint="perceived responsiveness" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">Trend window</h2>
        <div className="flex gap-2">
          {WINDOW_DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`px-3 py-1 rounded-full text-xs font-bold border ${windowDays === d
                ? 'bg-violet-100 text-violet-800 border-violet-300'
                : 'bg-slate-100 text-slate-600 border-slate-200'}`}
            >
              Last {d} {d === 1 ? 'day' : 'days'}
            </button>
          ))}
          <span className="ml-2 text-[10px] text-slate-400 self-center">
            telemetry source: <code className="text-violet-600">app_performance_metrics</code> (client via /api/perf)
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">Slope of p95 latency by route</h2>
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-[10px] uppercase text-slate-500 border-b">
              <th className="py-2 pr-4 text-left">Route</th>
              <th className="py-2 pr-4 text-right">Samples</th>
              <th className="py-2 pr-4 text-right">P50 (ms)</th>
              <th className="py-2 text-right">P95 (ms)</th>
            </tr>
          </thead>
          <tbody>
            {topRoutes.map((r) => (
              <tr key={r.route} className="border-b border-slate-50">
                <td className="py-1.5 pr-4 text-slate-700">{r.route}</td>
                <td className="py-1.5 pr-4 text-right text-slate-600">{r.count}</td>
                <td className="py-1.5 pr-4 text-right text-violet-700">{toFixed2(r.p50)}</td>
                <td className="py-1.5 text-right font-bold text-rose-700">{toFixed2(r.p95)}</td>
              </tr>
            ))}
            {topRoutes.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-slate-400">No metrics yet — telemetry arrives when users load pages.</td></tr>
            )}
          </tbody>
        </table>
        <div className="text-[10px] text-slate-400 mt-2">
          Route rows are ordered by P95 descending — focus on the top few outliers first.
        </div>
      </div>

      {ttfb.length > 0 || lcp.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {ttfb.length > 0 && (
            <SummaryCard label="TTFB p50 (ms)" value={summarizeMetrics(ttfb.map((r) => ({ duration_ms: Number(r.ttfb_ms) }))).latency.p50} hint="Time To First Byte" />
          )}
          {lcp.length > 0 && (
            <SummaryCard label="LCP p50 (ms)" value={summarizeMetrics(lcp.map((r) => ({ duration_ms: Number(r.lcp_ms) }))).latency.p50} hint="Largest Contentful Paint" />
          )}
        </div>
      ) : null}

      <div className="text-[10px] text-slate-400 bg-slate-50 rounded-lg p-3 font-mono">
        {loading ? 'Loading metrics…' : `${rows.length} samples in ${windowDays}d window. Fixing the highest P95 row first has the biggest hillclimb.`}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-1">
      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{label}</div>
      <div className="text-2xl font-black text-violet-700">{toFixed2(value)}</div>
      <div className="text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}

export type { PerfMetricsSummary };
