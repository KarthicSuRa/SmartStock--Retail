// Supabase Edge Function: contextual-sync
// Refresh weather, holiday and promotion context used by the planning engine.
//
// Honesty rule: no signal is fabricated. Missing API keys or failed upstream
// calls leave the cache empty; the planning engine reports those factors as
// UNAVAILABLE instead of applying an invented multiplier.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { requireAuth, authFailureResponse, resolveTenantScope } from "../_shared/security/require-auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

interface SyncSummary {
  weather: string;
  holidays: string;
  promotions: string;
  warnings: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = await requireAuth(req, { allowService: true })
  if (!auth.ok) return authFailureResponse(auth, corsHeaders)
  const scope = resolveTenantScope(auth.ctx, req.headers.get('x-tenant-id'))
  if (!scope.ok) return authFailureResponse(scope, corsHeaders)
  const tenantId = scope.tenantId

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const payload = await req.json().catch(() => ({}))
    const syncType: string = payload.sync_type || 'all'
    const summary: SyncSummary = { weather: 'skipped', holidays: 'skipped', promotions: 'skipped', warnings: [] }

    if (syncType === 'all' || syncType === 'weather') {
      summary.weather = await syncWeather(supabase, tenantId, summary.warnings)
    }
    if (syncType === 'all' || syncType === 'holidays') {
      summary.holidays = await syncHolidays(supabase, tenantId, summary.warnings)
    }
    if (syncType === 'all' || syncType === 'promotions') {
      summary.promotions = await syncPromotions(supabase, tenantId, summary.warnings)
    }

    return new Response(JSON.stringify({
      status: 'completed',
      tenant_id: tenantId,
      sync_type: syncType,
      summary,
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (error) {
    console.error('[contextual-sync] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

/**
 * Writes ONLY verified forecasts. Without an API key, or for stores without
 * coordinates, nothing is written — the planning engine will see no row and
 * will report the weather factor as UNAVAILABLE.
 */
async function syncWeather(supabase: any, tenantId: string, warnings: string[]): Promise<string> {
  const apiKey = Deno.env.get('OPENWEATHER_API_KEY')
  if (!apiKey) {
    warnings.push('OPENWEATHER_API_KEY not configured; no weather rows written (factor will be UNAVAILABLE).')
    return 'not_configured'
  }

  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, lat, lng')
    .eq('tenant_id', tenantId)
  if (error) throw error
  if (!stores?.length) return 'no_stores'

  let written = 0
  for (const store of stores) {
    if (store.lat === null || store.lng === null || store.lat === undefined || store.lng === undefined) {
      warnings.push(`Store ${store.id} has no lat/lng; weather skipped.`)
      continue
    }
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${store.lat}&lon=${store.lng}&units=metric&appid=${apiKey}`,
      )
      if (!response.ok) {
        warnings.push(`Weather upstream returned HTTP ${response.status} for store ${store.id}.`)
        continue
      }
      const data = await response.json()
      const forecasts = (data.list ?? []).map((item: any) => ({
        tenant_id: tenantId,
        store_id: store.id,
        forecast_for_date: String(item.dt_txt).split(' ')[0],
        temp_max_c: item.main?.temp_max ?? null,
        temp_min_c: item.main?.temp_min ?? null,
        temp_avg_c: item.main?.temp ?? null,
        humidity_pct: item.main?.humidity ?? null,
        precipitation_mm: item.rain?.['3h'] ?? 0,
        weather_condition: item.weather?.[0]?.main ?? 'UNKNOWN',
        // The weather provider does not know this retailer's demand response.
        // Leaving the score null forces the (configurable, visible) temperature
        // proxy rather than pretending a commercial uplift was measured.
        retail_impact_score: null,
        raw_api_response: item,
        fetched_at: new Date().toISOString(),
      }))
      if (!forecasts.length) continue
      await supabase.from('weather_cache').upsert(forecasts, {
        onConflict: 'tenant_id,store_id,forecast_for_date',
      })
      written += forecasts.length
    } catch (err) {
      warnings.push(`Weather fetch failed for store ${store.id}: ${(err as Error).message}`)
    }
  }
  return written ? `synced:${written}` : 'no_data'
}

/**
 * Real public-holiday dates from Nager.Date. The provider gives DATES, not
 * commercial uplift, so sales_uplift_factor is stored as neutral 1.0 and can
 * be configured by a business user. Existing configured rows are preserved.
 */
async function syncHolidays(supabase: any, tenantId: string, warnings: string[]): Promise<string> {
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, country_code, region_code')
    .eq('tenant_id', tenantId)
  if (error) throw error

  const countries = new Set<string>(
    (stores ?? []).map((s: any) => String(s.country_code ?? '').trim().toUpperCase()).filter(Boolean),
  )
  if (!countries.size) {
    warnings.push('No store country_code values; holiday calendar skipped.')
    return 'no_country_codes'
  }

  const year = new Date().getUTCFullYear()
  let written = 0
  for (const country of countries) {
    try {
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`)
      if (!response.ok) {
        warnings.push(`Holiday provider returned HTTP ${response.status} for ${country}.`)
        continue
      }
      const holidays = await response.json() as Array<{ date: string; localName?: string; name?: string }>
      const rows = holidays.map((h) => ({
        tenant_id: tenantId,
        holiday_date: h.date,
        holiday_name: h.localName ?? h.name ?? h.date,
        country_code: country,
        region_code: '',
        is_retail_peak: false,
        is_store_closed: false,
        sales_uplift_factor: 1.0,
        category: 'public_holiday',
      }))
      if (!rows.length) continue
      await supabase.from('holiday_calendar').upsert(rows, {
        onConflict: 'tenant_id,country_code,region_code,holiday_date',
        ignoreDuplicates: true,
      })
      written += rows.length
    } catch (err) {
      warnings.push(`Holiday fetch failed for ${country}: ${(err as Error).message}`)
    }
  }
  if (written) warnings.push('Holiday rows carry neutral uplift 1.0; configure commercial uplift per event in holiday_calendar.')
  return written ? `synced:${written}` : 'no_data'
}

/**
 * Promotions can only be synced when a verified feed is configured. Otherwise
 * the function audits existing rows and flags stale data instead of claiming
 * a successful sync.
 */
async function syncPromotions(supabase: any, tenantId: string, warnings: string[]): Promise<string> {
  const feedUrl = Deno.env.get('PROMOTION_FEED_URL')
  const { data: active, error } = await supabase
    .from('promotional_calendar')
    .select('id, synced_from_erp_at, valid_to')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
  if (error) throw error

  const stale = (active ?? []).filter((p: any) => {
    if (!p.synced_from_erp_at) return true
    return Date.now() - new Date(p.synced_from_erp_at).getTime() > 7 * 86400000
  })
  if (stale.length) warnings.push(`${stale.length} active promotion rows are stale or never synced; promo factor will be ignored.`)

  if (!feedUrl) {
    warnings.push('PROMOTION_FEED_URL not configured; no promotion rows written (factor will be UNAVAILABLE/STALE).')
    return 'not_configured'
  }

  const { data: config } = await supabase
    .from('erp_configurations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('connection_status', 'active')
    .limit(1)
    .maybeSingle()
  if (!config?.id) {
    warnings.push('No active ERP configuration; promotion sync skipped.')
    return 'no_erp_config'
  }

  try {
    const response = await fetch(feedUrl)
    if (!response.ok) {
      warnings.push(`Promotion feed returned HTTP ${response.status}.`)
      return 'upstream_error'
    }
    const items = await response.json() as any[]
    if (!Array.isArray(items)) {
      warnings.push('Promotion feed did not return an array.')
      return 'invalid_feed'
    }

    let written = 0
    for (const item of items) {
      if (!item.erp_promotion_id || !item.sku || !item.valid_from || !item.valid_to) continue
      const { data: material } = await supabase
        .from('material_master')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('sku', item.sku)
        .maybeSingle()
      if (!material?.id) continue

      const { error: upsertError } = await supabase.from('promotional_calendar').upsert({
        tenant_id: tenantId,
        erp_config_id: config.id,
        material_id: material.id,
        store_id: item.store_id ?? null,
        erp_promotion_id: item.erp_promotion_id,
        erp_condition_record: item.erp_condition_record ?? null,
        promotion_name: item.promotion_name ?? item.erp_promotion_id,
        promotion_type: item.promotion_type ?? 'SAP_PROMOTION',
        valid_from: item.valid_from,
        valid_to: item.valid_to,
        discount_pct: item.discount_pct ?? null,
        uplift_factor: item.uplift_factor ?? 1.0,
        is_active: item.is_active !== false,
        synced_from_erp_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,erp_promotion_id,material_id,store_id' })
      if (!upsertError) written++
    }
    return written ? `synced:${written}` : 'no_valid_rows'
  } catch (err) {
    warnings.push(`Promotion feed failed: ${(err as Error).message}`)
    return 'upstream_error'
  }
}
