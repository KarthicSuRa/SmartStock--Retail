import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle pre-flight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Enforce HTTP POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  // 1. Authenticate user using Authorization header (JWT)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    console.warn('[calculate-contextual-velocity] Rejected: Missing Authorization header.')
    return new Response(
      JSON.stringify({ error: 'Unauthorized: missing authorization header' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[calculate-contextual-velocity] Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.')
      return new Response(
        JSON.stringify({ error: 'Internal server configuration error.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Initialize user client to verify JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      console.warn('[calculate-contextual-velocity] Authentication failed:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Initialize admin client to run database queries and write cache
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Parse incoming request body
    const body = await req.json().catch(() => ({}))
    const { sku, baseline_velocity } = body

    if (!sku || typeof baseline_velocity !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Bad Request: sku and baseline_velocity (number) are required.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`[calculate-contextual-velocity] Processing forecast for SKU: ${sku}, Baseline Velocity: ${baseline_velocity}`)

    // 2. Simulate rapid mock weather handshake (using Open-Meteo public free API with fallback)
    let temp = 26.5 // Default/mock temperature > 24°C to trigger anomaly
    let weather_anomaly_detected = false

    try {
      // Fetch current weather in a mock location (e.g. Dallas, TX where anomalies/heat occur)
      const weatherPromise = fetch("https://api.open-meteo.com/v1/forecast?latitude=32.7767&longitude=-96.7970&current_weather=true")
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
      
      const response = await Promise.race([weatherPromise, timeoutPromise])
      if (response && response.ok) {
        const weatherData = await response.json()
        temp = weatherData?.current_weather?.temperature ?? 26.5
        console.log(`[calculate-contextual-velocity] Weather API responded. Current Temp: ${temp}°C`)
      }
    } catch (e) {
      console.warn('[calculate-contextual-velocity] Weather API handshake timed out or failed. Using fallback temperature.', e)
    }

    if (temp > 24) {
      weather_anomaly_detected = true
      console.log('[calculate-contextual-velocity] Weather anomaly detected (> 24°C). Applying 1.25 multiplier.')
    }

    // 3. Simulate rapid mock public holiday handshake (using Nager.Date API with fallback)
    let holiday_detected = false

    try {
      const holidayPromise = fetch("https://date.nager.at/api/v3/NextPublicHolidays/US")
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))

      const response = await Promise.race([holidayPromise, timeoutPromise])
      if (response && response.ok) {
        const holidays = await response.json()
        if (Array.isArray(holidays)) {
          const now = new Date()
          const fourDaysFromNow = new Date()
          fourDaysFromNow.setDate(now.getDate() + 4)

          holiday_detected = holidays.some((h: any) => {
            const hDate = new Date(h.date)
            return hDate >= now && hDate <= fourDaysFromNow
          })
          console.log(`[calculate-contextual-velocity] Holiday API responded. Holiday in next 4 days: ${holiday_detected}`)
        }
      }
    } catch (e) {
      console.warn('[calculate-contextual-velocity] Holiday API handshake timed out or failed. Using fallback.', e)
      // Fallback: simulate public holiday falling in the next 4 days (mock true)
      holiday_detected = true
    }

    // 4. Compute multipliers
    let adjusted_velocity = baseline_velocity
    if (weather_anomaly_detected) {
      adjusted_velocity *= 1.25
    }
    if (holiday_detected) {
      adjusted_velocity *= 1.15
    }

    // 5. Query database log to evaluate target supplier's historical lead-time delays from SAP
    // We will query buffered scraps as a proxy for historical stock discrepancy incidents
    const { data: scraps } = await adminClient
      .from('buffered_scraps')
      .select('created_at')
      .eq('sku', sku)

    const historicalIncidentsCount = scraps?.length ?? 0
    // Scale safety buffer proportionally to SAP delay signals (e.g. 1.2 days base, scaled up by 0.5 per incident)
    const lead_time_safety_buffer = 1.2 + (historicalIncidentsCount * 0.5)
    console.log(`[calculate-contextual-velocity] Evaluated historical supplier delays. Safety buffer: ${lead_time_safety_buffer} days`)

    // 6. Query current stock to compute run-out horizon
    const { data: ledgerItems } = await adminClient
      .from('live_inventory_ledger')
      .select('current_calculated_stock')
      .eq('sku', sku)

    const currentStock = ledgerItems && ledgerItems.length > 0 ? ledgerItems[0].current_calculated_stock : 0
    const runout_horizon_days = adjusted_velocity > 0 
      ? Number((currentStock / adjusted_velocity).toFixed(2)) 
      : 999.0

    // 7. Write updated metrics to the temporary staging table: `contextual_forecast_cache`
    const cacheRecord = {
      sku,
      baseline_velocity,
      adjusted_velocity: Number(adjusted_velocity.toFixed(4)),
      runout_horizon_days,
      weather_anomaly_detected,
      holiday_detected,
      lead_time_safety_buffer,
      updated_at: new Date().toISOString()
    }

    const { data: upsertResult, error: upsertError } = await adminClient
      .from('contextual_forecast_cache')
      .upsert(cacheRecord)
      .select()

    if (upsertError) {
      console.error('[calculate-contextual-velocity] Failed to write to contextual_forecast_cache:', upsertError)
      throw upsertError
    }

    console.log('[calculate-contextual-velocity] Forecast computed and staged successfully.')

    // Return the response containing the forecast metrics
    return new Response(
      JSON.stringify({
        success: true,
        data: cacheRecord
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    console.error('[calculate-contextual-velocity] Execution error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
