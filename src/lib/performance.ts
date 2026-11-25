// /src/lib/performance.ts
// Client-side performance telemetry + server route helpers.
//
// Design: capture the Web-Vitals we can without a dependency, ship with
// sendBeacon (fire-and-forget), and insert server-side via /api/perf.
// The admin performance panel reads app_performance_metrics to hillclimb
// latency, bytes transferred and perceived lag.

export type PerfRoute = string;

export interface PerformancePayload {
  route: PerfRoute;
  duration_ms?: number;
  ttfb_ms?: number;
  fcp_ms?: number;
  lcp_ms?: number;
  cls?: number;
  inp_ms?: number;
  bytes_in?: number;
  bytes_out?: number;
  is_first_view?: boolean;
  user_agent?: string;
  tenant_id?: string | null;
  browser?: boolean;
  [key: string]: unknown;
}

export interface PerfMetricsSummary {
  p50: number;
  p95: number;
  total: number;
  avg: number;
}

export function p50(values: number[]): number {
  return percentile(values, 50);
}
export function p95(values: number[]): number {
  return percentile(values, 95);
}
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

export function summarizeMetrics(
  metrics: Array<{ duration_ms?: number | null; bytes_in?: number | null }>,
): { latency: PerfMetricsSummary; lagMs: PerfMetricsSummary; bytes: { total: number; avg: number } } {
  const lat = metrics.map((m) => Number(m.duration_ms ?? 0)).filter(Number.isFinite);
  const lagMs = lat; // overall perceived lag is the duration itself
  const bytes = metrics.reduce((sum, m) => sum + (m.bytes_in ?? 0), 0);
  return {
    latency: { p50: p50(lat), p95: p95(lat), total: lat.reduce((a, b) => a + b, 0), avg: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0 },
    lagMs: { p50: p50(lagMs), p95: p95(lagMs), total: lagMs.reduce((a, b) => a + b, 0), avg: lagMs.length ? lagMs.reduce((a, b) => a + b, 0) / lagMs.length : 0 },
    bytes: { total: Number(bytes.toFixed(0)), avg: lat.length ? Number((bytes / lat.length).toFixed(2)) : 0 },
  };
}

export function sendPerformanceBeacon(payload: PerformancePayload): void {
  if (typeof window === 'undefined') return
  const data = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const canSendBeacon = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
  if (canSendBeacon) {
    try {
      navigator.sendBeacon('/api/perf', data)
    } catch {
      /* ignore: telemetry is best-effort */
    }
    return
  }
  // Fallback: fetch keeps the promise; errors ignored (telemetry must not break UX).
  fetch('/api/perf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined)
}
