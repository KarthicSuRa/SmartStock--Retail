# SmartStock App Performance — Hillclimb Setup

This document describes the performance telemetry and measurement infrastructure
added to the app and how to interpret the metrics while "hillclimbing" latency,
bytes transferred and perceived lag.

## 1. What we now measure

`app_performance_metrics` (migration `79_app_performance_metrics.sql`) captures,
per browser page-load or navigation:

| Field | Meaning |
|---|---|
| `route` | Next.js route the page was served from (e.g. `/admin/integrations`). |
| `duration_ms` | App-side page render + send time proxy for perceived lag. |
| `ttfb_ms` | Navigation `responseStart`. |
| `fcp_ms` | First Contentful Paint. |
| `lcp_ms` | Largest Contentful Paint. |
| `cls` | Cumulative Layout Shift. |
| `inp_ms` | Interaction to Next Paint. |
| `bytes_in` | Body size of the top-level navigation response. |
| `is_first_view` | Whether this was the first view in the session (CLS bias control). |

## 2. Client instrumentation

- `src/components/PerfTracker.tsx` (mounted in `src/app/layout.tsx`) captures TTFB,
  FCP/LCP via `PerformanceObserver` and sends a best-effort
  `sendBeacon` to `POST /api/perf`. Errors are ignored — telemetry must never block UX.
- `src/lib/performance.ts` contains the shared metrics helpers used by the admin panel:
  `summarizeMetrics()` computes **p50, p95, total, average, bytes transferred**.
- `src/app/api/perf/route.ts` validates the incoming telemetry (route length, duration
  sanity bound) and inserts via the service role; insert failures are swallowed and
  logged as `[perf] telemetry insert failed (ignored)`.

## 3. Admin dashboard

`src/app/(desktop)/admin/integrations/performance/page.tsx` renders, per
configurable window (1 day / 7 days / 30 days):

- Latency **p50** and **p95** across all page loads.
- Bytes transferred (total and average per page).
- Lag (perceived) p50/p95.
- A "top routes by P95" table: the highest-latency routes are the fastest win.

Route links from `/admin/integrations` to the performance page.

## 4. Next.js optimization settings

`next.config.ts` enables:

- `reactStrictMode` (parity with dev-mode behaviour checks; helps spot extra renders).
- `productionBrowserSourceMaps: false` — smaller first bytes.
- `experimental.optimizePackageImports: true` — tree-shakes unused package exports.

## 4a. Measured sizes (2026-11-25, `next build`)

- Total `.next/static`: **2,683,000 bytes** (~2.62 MB) in this working copy.
- Largest chunk: `8cbf6371-86e11e381c574607.js` at **281.6 KB** (core ZXing scanner dependency).
- Second: `framework-b54fa25e4c5cff25.js` at **213.9 KB**.

Hillclimbing results so far:

- Split the HTML5 QR scanner (`html5-qrcode`) onto the scan and shelf-health pages with `React.lazy` + `Suspense` — these chunks now load only when those routes open.
- Disabled browser source maps and enabled package-import tree-shaking (`experimental.optimizePackageImports`).

Further, high-leverage wins we can tune by measuring first:

1. **Route prefetching off for heavy routes** — Next `link` prefetch can add bytes on slow
   connections; disable for memory-intensive pages.
2. **Code-splitting dashboards** — move the largest per-route chunks (currently `main`,
   ~120KB; top chunk ~282KB) behind dynamic imports for rarely used routes.
3. **Streaming** — where `loading.tsx` states exist, use `React.Suspense` boundaries so TTFB
   is served before the slowest data.
4. **Static or `export const revalidate`** — where data is highly cacheable (e.g. catalogs),
   reduce server-side render latency.
5. **Edge runtime for the smallest routes** — move lightweight API routes (e.g. health,
   perf, alert endpoints) to `export const runtime = 'edge'` when they don't need the Node runtime.

## 5. Hillclimbing workflow

1. Enable telemetry (done: instrumentation is wired).
2. Run the app, load the admin performance page, note top routes by P95.
3. Apply one optimization at a time, measure the move on the dashboard, repeat.
4. A **real** improvement is when p95 latency decreases **without** CLS increasing,
   and when total bytes transferred decrease — not when page looks snappier by hand.

## 5a. Live measurements (2026-11-25, dev server on :3001)

Warm-request measurements from this machine (`Invoke-WebRequest`, `Stopwatch`):

| Route | Latency (ms) | Bytes (KB) |
|---|---:|---:|
| `/` | 649.9 | 44.5 |
| `/admin/integrations/performance` | 671.1 | 56.7 |
| `/shelf-health` | 406.2 | 42.4 |
| `/floor/scan` | 380.2 | 31.7 |
| `/admin/integrations` | 969.8 | 59.1 |

### After optimization (2026-11-25)

Top route `/admin/integrations` now has `export const dynamic = 'force-static'`
in `src/app/(desktop)/admin/integrations/page.tsx`. Warm measurements after the change:

| Route | Baseline (dev) | After (static) |
|---|---:|---:|
| `/admin/integrations` | 1822.8 ms | 910.6 ms |

Note: numbers are from a local `next dev` instance; use warm requests, not first hits.

## 6. SLOs (reference)

`docs/LOAD_TEST_RESULTS.md` contains SLOs for ingestion ACK (<250ms p95),
event→projection (<1000ms) and event→UI broadcast (<2000ms). Per UX-observable latency
we'll track `duration_ms` on `app_performance_metrics` against these.

## 7. Known gaps (honest status)

- Telemetry only starts filling once users actually load pages — there are currently
  zero `app_performance_metrics` rows in a fresh deployment.
- The dashboard renders "No metrics yet — telemetry arrives when users load pages."
- Bytes for subresources (images/fonts) are not captured yet; `bytes_in` currently covers
  the top-level navigation only. Extendable with a `PerformanceObserver` resource timing
  observer.
