// /src/app/api/perf/route.ts
// Telemetry ingest endpoint used by src/lib/performance.ts. Best-effort; never blocks UX.

import { supabase } from '@/lib/supabase'
import { PerformancePayload } from '@/lib/performance'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

const MAX_USER_AGENT_LEN = 500
const MAX_REASONABLE_DURATION = 60000 // guards against timers/bugs on the client

export async function POST(req: Request) {
  try {
    // Telemetry uses the project client in src/lib/supabase.ts; app_performance_metrics
    // allows anonymous INSERTs, and writes must never block a customer page.
    const payload = (await req.json()) as PerformancePayload
    const durationMs = Number(payload.duration_ms)
    if (payload.route?.length > 100 || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_REASONABLE_DURATION) {
      return json({ ok: false, reason: 'invalid metrics payload' }, 400)
    }

    const { error } = await supabase.from('app_performance_metrics').insert({
      route: String(payload.route).slice(0, 100),
      method: typeof payload.method === 'string' ? payload.method.slice(0, 10) : 'GET',
      user_agent: typeof payload.user_agent === 'string' ? payload.user_agent.slice(0, MAX_USER_AGENT_LEN) : undefined,
      browser: payload.browser !== false,
      is_first_view: payload.is_first_view === true,
      ttfb_ms: payload.ttfb_ms ? Number(payload.ttfb_ms) : null,
      fcp_ms: payload.fcp_ms ? Number(payload.fcp_ms) : null,
      lcp_ms: payload.lcp_ms ? Number(payload.lcp_ms) : null,
      cls: payload.cls ? Number(payload.cls) : null,
      inp_ms: payload.inp_ms ? Number(payload.inp_ms) : null,
      duration_ms: durationMs,
      bytes_in: payload.bytes_in != null ? Number(payload.bytes_in) : null,
      bytes_out: payload.bytes_out != null ? Number(payload.bytes_out) : null,
      status: payload.status != null ? Number(payload.status) : null,
    })
    if (error) {
      // Telemetry must never break a customer flow; swallow write failures.
      console.warn('[perf] insert failed (ignored):', error.message)
    }
    return json({ ok: true })
  } catch (err) {
    console.warn('[perf] telemetry insert failed (ignored):', (err as Error).message)
    return json({ ok: false })
  }
}
