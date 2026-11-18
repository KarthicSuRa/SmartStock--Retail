// /supabase/functions/_shared/pos/webhook-security.ts
// SmartStock LiveRetail V2 — Provider Webhook Signature Verification
//
// Each provider signs webhooks differently. All of the following are taken
// from the provider's own documentation and are verified fail-closed: if the
// secret (or another required setting) is missing we refuse the delivery
// rather than processing it unverified.
//
//   Shopify    base64(HMAC-SHA256(raw body, app client secret))
//              header: X-Shopify-Hmac-Sha256
//   Square     base64(HMAC-SHA256(notification URL + raw body, signature key))
//              header: x-square-hmacsha256-signature
//   Lightspeed hex(HMAC-SHA256(raw body, OAuth client secret))
//              header: X-Signature: signature=<hex>,algorithm=HMAC-SHA256
//   Generic    hex(HMAC-SHA256(raw body, shared secret))
//              header: x-webhook-signature
//   Clover     static shared secret, not an HMAC
//              header: X-Clover-Auth  (the app's Clover Auth Code)
//
// Every comparison is constant-time.

export type SignatureFailureReason =
  | "missing_secret"
  | "missing_signature"
  | "invalid_signature"
  | "unsupported_algorithm"
  | "missing_notification_url";

export interface SignatureResult {
  ok: boolean;
  reason?: SignatureFailureReason;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time string comparison. Length is not secret, so normalising the
 * length first is sufficient; the loop never exits early on a mismatch.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return new Uint8Array(signature);
}

// ===========================================================================
// Shopify
// ===========================================================================

export async function verifyShopifyWebhook(
  rawBody: string,
  headers: Headers,
  secret?: string | null,
): Promise<SignatureResult> {
  if (!secret) return { ok: false, reason: "missing_secret" };

  const header = headers.get("x-shopify-hmac-sha256");
  if (!header) return { ok: false, reason: "missing_signature" };

  const expected = bytesToBase64(await hmacSha256(secret, rawBody));
  return timingSafeEqual(expected, header.trim())
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
}

// ===========================================================================
// Square
// ===========================================================================
//
// Square signs `notificationUrl + rawBody`. The notification URL must be the
// exact URL configured on the webhook subscription, so it is a required
// configuration value; there is no way to verify without it.
//
export async function verifySquareWebhook(
  rawBody: string,
  headers: Headers,
  secret: string | null | undefined,
  notificationUrl: string | null | undefined,
): Promise<SignatureResult> {
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!notificationUrl) return { ok: false, reason: "missing_notification_url" };

  const header = headers.get("x-square-hmacsha256-signature");
  if (!header) return { ok: false, reason: "missing_signature" };

  const expected = bytesToBase64(
    await hmacSha256(secret, `${notificationUrl}${rawBody}`),
  );
  return timingSafeEqual(expected, header.trim())
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
}

// ===========================================================================
// Lightspeed Retail (X-Series)
// ===========================================================================
//
// Header shape:
//   X-Signature: signature=897hRT...,algorithm=HMAC-SHA256
// The signature is a hex digest of the raw request body.
//
export async function verifyLightspeedWebhook(
  rawBody: string,
  headers: Headers,
  secret?: string | null,
): Promise<SignatureResult> {
  if (!secret) return { ok: false, reason: "missing_secret" };

  const header = headers.get("x-signature");
  if (!header) return { ok: false, reason: "missing_signature" };

  const params = new Map<string, string>();
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    params.set(
      part.slice(0, separator).trim().toLowerCase(),
      part.slice(separator + 1).trim(),
    );
  }

  const algorithm = params.get("algorithm");
  if (algorithm && algorithm.toUpperCase() !== "HMAC-SHA256") {
    return { ok: false, reason: "unsupported_algorithm" };
  }

  const provided = params.get("signature");
  if (!provided) return { ok: false, reason: "missing_signature" };

  const expected = bytesToHex(await hmacSha256(secret, rawBody));
  return timingSafeEqual(expected, provided.toLowerCase())
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
}

// ===========================================================================
// Generic HTTPS webhook
// ===========================================================================

export async function verifyGenericWebhook(
  rawBody: string,
  headers: Headers,
  secret?: string | null,
): Promise<SignatureResult> {
  if (!secret) return { ok: false, reason: "missing_secret" };

  const header = headers.get("x-webhook-signature");
  if (!header) return { ok: false, reason: "missing_signature" };

  const provided = header.trim().replace(/^sha256=/i, "").toLowerCase();
  const expected = bytesToHex(await hmacSha256(secret, rawBody));
  return timingSafeEqual(expected, provided)
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
}

// ===========================================================================
// Clover
// ===========================================================================
//
// Clover's app webhook uses a shared auth code, not an HMAC. The header is
// present on every notification after the callback URL is verified.
//
export function verifyCloverWebhook(
  headers: Headers,
  authCode?: string | null,
): SignatureResult {
  if (!authCode) return { ok: false, reason: "missing_secret" };

  const header = headers.get("x-clover-auth");
  if (!header) return { ok: false, reason: "missing_signature" };

  return timingSafeEqual(authCode, header.trim())
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
}
