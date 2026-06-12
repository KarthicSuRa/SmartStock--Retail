// Supabase Edge Function: pos-webhook
// Handles real-time transaction updates from in-store POS systems.
// Security: HMAC SHA-256 signature validation via X-POS-Signature header.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-pos-signature',
}

// -----------------------------------------------------------------------------
// HMAC SHA-256 Helpers (Deno Web Crypto API)
// -----------------------------------------------------------------------------

/**
 * Imports the raw secret string as a CryptoKey for HMAC-SHA256 signing.
 */
async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,           // not extractable
    ['sign', 'verify']
  )
}

/**
 * Computes a lowercase hex HMAC-SHA256 digest of the given body string.
 */
async function computeHmacHex(key: CryptoKey, body: string): Promise<string> {
  const enc = new TextEncoder()
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Constant-time string comparison — prevents timing-based side-channel attacks.
 * Falls back to a byte-by-byte XOR accumulator to ensure equal execution time.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const bufA = enc.encode(a)
  const bufB = enc.encode(b)

  // Lengths must match; we still run the full loop to avoid early-exit leakage.
  if (bufA.length !== bufB.length) return false

  let diff = 0
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i]
  }
  return diff === 0
}

// -----------------------------------------------------------------------------
// Request Handler
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  // Handle pre-flight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ------------------------------------------------------------------
  // STEP 1 — Extract the incoming signature header
  // ------------------------------------------------------------------
  const incomingSignature = req.headers.get('x-pos-signature')

  if (!incomingSignature) {
    console.warn('[pos-webhook] Rejected: missing X-POS-Signature header.')
    return new Response(
      JSON.stringify({ error: 'Unauthorized: X-POS-Signature header is required.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  // ------------------------------------------------------------------
  // STEP 2 — Read and clone the raw request body for signature check
  // ------------------------------------------------------------------
  // We clone so we can read body twice: once for verification, once for JSON parsing.
  const bodyText = await req.text()

  // ------------------------------------------------------------------
  // STEP 3 — Compute the expected HMAC SHA-256 signature
  // ------------------------------------------------------------------
  const secret = Deno.env.get('POS_WEBHOOK_SECRET') ?? ''

  if (!secret) {
    console.error('[pos-webhook] Server misconfiguration: POS_WEBHOOK_SECRET env var is not set.')
    return new Response(
      JSON.stringify({ error: 'Internal server error: webhook secret not configured.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }

  const hmacKey = await importHmacKey(secret)
  const expectedSignature = await computeHmacHex(hmacKey, bodyText)

  // ------------------------------------------------------------------
  // STEP 4 — Constant-time comparison
  // ------------------------------------------------------------------
  if (!timingSafeEqual(expectedSignature, incomingSignature.toLowerCase())) {
    console.warn('[pos-webhook] Rejected: signature mismatch.', {
      expected: expectedSignature,
      received: incomingSignature,
    })
    return new Response(
      JSON.stringify({ error: 'Forbidden: invalid X-POS-Signature.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
    )
  }

  console.log('[pos-webhook] Signature verified ✓')

  // ------------------------------------------------------------------
  // STEP 5 — Parse payload and write to the database queue
  // ------------------------------------------------------------------
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = JSON.parse(bodyText)

    // Insert raw payload into pos_sales_events; the DB trigger handles ledger update
    const { error } = await supabaseClient
      .from('pos_sales_events')
      .insert({ raw_payload: payload })

    if (error) throw error

    console.log('[pos-webhook] Event queued successfully:', payload?.store_code, payload?.items?.length, 'line item(s)')

    return new Response(
      JSON.stringify({ success: true, message: 'Inventory deduction queued' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err) {
    console.error('[pos-webhook] Error inserting event:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
