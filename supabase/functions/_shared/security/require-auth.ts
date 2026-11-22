// /supabase/functions/_shared/security/require-auth.ts
//
// Shared authentication guard for Edge Functions that mutate data or call SAP.
//
// Two accepted caller classes:
//
//   user    - a Supabase-issued JWT (browser / mobile client). Verified with
//             `auth.getUser(token)`, which validates signature + expiry.
//   service - the service-role key or an explicitly configured internal token.
//             Used by cron/scheduler invocations only, and only for functions
//             that opt in via `allowService`.
//
// Anything else gets 401. No function should reach SAP without passing through
// this guard: an unauthenticated write endpoint lets anyone create SAP business
// documents, which is both a fraud vector and an uncontrolled Digital Access
// consumption vector.
//
// Tenant selection rule: a user's tenant comes from the *verified* JWT claims
// (user_metadata, then app_metadata). The `x-tenant-id` header is never a
// source of truth for a user; it is only accepted when it matches the verified
// claim. Service callers may assert any tenant via that header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthContext {
  kind: "user" | "service";
  userId?: string;
  tenantId: string;
}

export type AuthOutcome =
  | { ok: true; ctx: AuthContext }
  | { ok: false; status: number; error: string };

export interface RequireAuthOptions {
  /** Permit the service-role key (or INTERNAL_SERVICE_TOKEN) as a caller. */
  allowService?: boolean;
  /** Default tenant when the caller does not assert one. */
  defaultTenantId?: string;
}

const TENANT_MISMATCH_ERROR = "Forbidden: x-tenant-id does not match the authenticated tenant";

function unauthorized(error: string): AuthOutcome {
  return { ok: false, status: 401, error };
}

export async function requireAuth(
  req: Request,
  options: RequireAuthOptions = {},
): Promise<AuthOutcome> {
  const { allowService = false, defaultTenantId = "default-tenant" } = options;

  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) return unauthorized("Unauthorized: missing Authorization header");

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return unauthorized("Unauthorized: Authorization header must use the Bearer scheme");

  const token = match[1].trim();
  if (!token) return unauthorized("Unauthorized: empty bearer token");

  const assertedTenant = req.headers.get("x-tenant-id")?.trim() || undefined;

  // --- service-to-service -------------------------------------------------
  if (allowService) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const internalToken = Deno.env.get("INTERNAL_SERVICE_TOKEN") ?? "";

    const isService =
      (serviceKey.length > 0 && token === serviceKey) ||
      (internalToken.length > 0 && token === internalToken);

    if (isService) {
      // Service callers are trusted to assert the tenant they operate on.
      return {
        ok: true,
        ctx: { kind: "service", tenantId: assertedTenant ?? defaultTenantId },
      };
    }
  }

  // --- end user -----------------------------------------------------------
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: "Internal configuration error: auth backend unavailable" };
  }

  try {
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) {
      return unauthorized("Unauthorized: invalid or expired token");
    }

    // The verified claim is the only source of truth for a user's tenant.
    // `default-tenant` is used solely when the JWT carries no tenant claim.
    const verifiedTenant =
      (data.user.user_metadata?.tenant_id as string | undefined) ??
      (data.user.app_metadata?.tenant_id as string | undefined) ??
      defaultTenantId;

    // Defense in depth: a JWT for tenant A cannot assert tenant B via header.
    if (assertedTenant && assertedTenant !== verifiedTenant) {
      return { ok: false, status: 403, error: TENANT_MISMATCH_ERROR };
    }

    return { ok: true, ctx: { kind: "user", userId: data.user.id, tenantId: verifiedTenant } };
  } catch {
    return unauthorized("Unauthorized: token verification failed");
  }
}

/**
 * Resolve the tenant an authenticated caller is allowed to operate on.
 *
 * Callers must pass only the asserted transport value (e.g. `x-tenant-id`).
 * Request-body `tenant_id` values are never passed here: for user callers the
 * body is ignored, and a service caller's asserted tenant is supplied via the
 * header. This prevents a body field from bypassing the verified claim check.
 */
export function resolveTenantScope(
  auth: AuthContext,
  assertedTenant?: string | null,
): { ok: true; tenantId: string } | { ok: false; status: 403; error: string } {
  const asserted = assertedTenant?.trim() || undefined;

  if (auth.kind === "service") {
    return { ok: true, tenantId: asserted ?? auth.tenantId };
  }

  if (asserted && asserted !== auth.tenantId) {
    return { ok: false, status: 403, error: TENANT_MISMATCH_ERROR };
  }

  return { ok: true, tenantId: auth.tenantId };
}

/** Standard 401/403 response body for a failed guard check. */
export function authFailureResponse(
  outcome: Extract<AuthOutcome, { ok: false }>,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: outcome.error }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: outcome.status },
  );
}
