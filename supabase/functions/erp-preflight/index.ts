// Supabase Edge Function: erp-preflight
// Read-only SAP discovery for the plug-and-play onboarding wizard.
//
// Guarantees:
//   * No SAP writes. Discovery only performs GET requests through
//     SAPAdapter.rawGet (token POST is the adapter's own OAuth exchange).
//   * Secrets are referenced by Edge-secret name, never accepted in a body.
//   * The active ERP configuration is never changed here; apply/rollback go
//     through the reviewed, tenant-scoped apply_erp_config_profile RPC.
//   * A verdict of BLOCKED is returned with HTTP 200 and real evidence, never
//     as a fabricated "ready" or a generic 500.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"
import { SAPAdapter } from "../_shared/erp-adapter/sap-adapter.ts"
import { ERPConfig } from "../_shared/erp-adapter/types.ts"
import {
  DiscoveryResult, runDiscovery, safeEndpoint,
} from "../_shared/erp-adapter/discovery.ts"
import {
  requireAuth, authFailureResponse, resolveTenantScope, requireAdmin,
} from "../_shared/security/require-auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FORBIDDEN_SECRET_KEYS = new Set(['client_secret', 'clientsecret', 'password', 'private_key', 'secret'])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

/** Walks the request body; inline secrets are rejected before any network call. */
function findInlineSecret(value: unknown, path = 'body'): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findInlineSecret(value[i], `${path}[${i}]`)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[-_]/g, '')
      // `*_env` fields carry only the NAME of an Edge secret, never its value.
      if (!normalized.endsWith('env') && FORBIDDEN_SECRET_KEYS.has(normalized)) {
        return `${path}.${key}`
      }
      const found = findInlineSecret(child, `${path}.${key}`)
      if (found) return found
    }
  }
  return null
}

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function draftConfig(draft: any, tenantId: string): ERPConfig {
  const auth = draft.auth_config ?? {}
  const meta = draft.metadata ?? {}
  return {
    id: draft.id ?? crypto.randomUUID(),
    tenant_id: tenantId,
    erp_type: draft.erp_type ?? 'sap_s4hana',
    erp_name: draft.erp_name ?? 'SAP S/4HANA (preflight draft)',
    base_url: draft.base_url ?? '',
    auth_method: draft.auth_method ?? 'oauth2',
    auth_config: auth,
    connection_status: 'inactive',
    company_code: draft.company_code,
    purchasing_org: draft.purchasing_org,
    purchasing_group: draft.purchasing_group,
    metadata: meta,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function blockedResult(message: string, code: string, config: ERPConfig): DiscoveryResult {
  const checkedAt = new Date().toISOString()
  return {
    sap: { odata_version: 'UNKNOWN', services_probed: 0,
      sap_client: (config.auth_config as any)?.sap_client ?? (config.metadata as any)?.sap_client,
      release_hint: 'unverified' },
    verdict: 'BLOCKED',
    readiness_score: 0,
    checks: [{
      id: code.toLowerCase(),
      category: 'auth',
      status: 'FAIL',
      severity: 'blocker',
      evidence: message,
      checked_at: checkedAt,
    }],
    proposals: {
      sap_expands: { material: [], vendor: [], purchaseOrder: [] },
      sap_field_map: { material: {}, vendor: {} },
      plant_map_candidates: {},
      sap_defaults_candidates: {},
    },
    human_gates: [],
    blocking_findings: [{ check_id: code.toLowerCase(), code, message }],
    profile_snapshot: {},
    metadata_hashes: {},
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Preflight writes audit records and can influence configuration, so it is
  // human-attributable only: no service-role callers.
  const auth = await requireAuth(req, { allowService: false })
  if (!auth.ok) return authFailureResponse(auth, corsHeaders)
  const admin = requireAdmin(auth.ctx)
  if (!admin.ok) return authFailureResponse(admin, corsHeaders)

  const scope = resolveTenantScope(auth.ctx, req.headers.get('x-tenant-id'))
  if (!scope.ok) return authFailureResponse(scope, corsHeaders)
  const tenantId = scope.tenantId
  if (!UUID_RE.test(tenantId)) {
    return json({ error: 'tenant_id must be a UUID for discovery audit tables' }, 422)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const inlineSecretPath = findInlineSecret(body)
    if (inlineSecretPath) {
      return json({
        error: 'Inline secrets are rejected. Supply auth_config.client_secret_env with the name of a Supabase Edge secret.',
        field: inlineSecretPath,
      }, 422)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const mode: 'discover' | 'verify' = body.mode === 'verify' ? 'verify' : 'discover'

    let config: ERPConfig | null = null
    let configId: string | null = null

    if (body.config_id) {
      const { data } = await supabase
        .from('erp_configurations')
        .select('*')
        .eq('id', body.config_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (data) {
        config = data as ERPConfig
        configId = data.id
      }
    } else if (body.draft) {
      config = draftConfig(body.draft, tenantId)
    } else {
      const { data } = await supabase
        .from('erp_configurations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('connection_status', 'active')
        .limit(1)
        .maybeSingle()
      if (data) {
        config = data as ERPConfig
        configId = data.id
      }
    }

    if (!config) {
      return json({ error: 'No ERP configuration found. Supply config_id or a draft configuration.' }, 422)
    }

    // Secret presence is reported as a name/status only; the value is never
    // read into the response or an audit row.
    const authConfig = config.auth_config as any
    const secretEnvName = authConfig?.client_secret_env as string | undefined
    const secretPresent = secretEnvName ? Boolean(Deno.env.get(secretEnvName)) : Boolean(authConfig?.client_secret)
    if (!secretPresent) {
      const result = blockedResult(
        secretEnvName
          ? `Edge secret '${secretEnvName}' is not configured.`
          : 'No OAuth client secret configured (set auth_config.client_secret_env).',
        'AUTH_SECRET_MISSING',
        config,
      )
      result.proposals = { ...result.proposals }
      const { data: run } = await supabase.from('erp_discovery_runs').insert({
        tenant_id: tenantId,
        erp_config_id: configId,
        mode,
        verdict: result.verdict,
        readiness_score: result.readiness_score,
        actor_id: auth.ctx.userId,
        request_redacted: { mode, config_id: configId, secret_env: secretEnvName },
        result,
      }).select('run_id').single()
      return json({ ...result, run_id: run?.run_id, config_id: configId, secrets: {
        client_secret_env: secretEnvName ?? null,
        status: 'missing',
      } })
    }

    let adapter
    try {
      adapter = AdapterFactory.createAdapter(config)
    } catch (err) {
      const result = blockedResult((err as Error).message, 'ADAPTER_CONFIGURATION_INVALID', config)
      return json({ ...result, config_id: configId, secrets: { client_secret_env: secretEnvName, status: 'set' } })
    }

    if (!(adapter instanceof SAPAdapter)) {
      const result = blockedResult(
        'Preflight discovery supports SAP adapters only (sap_s4hana / sap_ecc).',
        'SAP_ADAPTER_REQUIRED',
        config,
      )
      return json({ ...result, config_id: configId })
    }

    if (mode === 'verify' && body.profile_id) {
      const { data: profile } = await supabase
        .from('erp_config_profiles')
        .select('*')
        .eq('id', body.profile_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (profile?.snapshot) {
        config = draftConfig(profile.snapshot, tenantId)
        config.id = profile.erp_config_id ?? config.id
        adapter = AdapterFactory.createAdapter(config)
      }
    }

    const result = await runDiscovery({
      client: adapter as SAPAdapter,
      config,
      timeoutMs: Number(body.options?.check_timeout_ms ?? 10_000),
      maxSample: Number(body.options?.max_sample ?? 5),
      plants: Array.isArray(body.plants) ? body.plants.map(String) : [],
      sample: body.sample,
    })

    const newFingerprint = fingerprint(result.proposals)
    const redactedRequest = {
      mode,
      config_id: configId,
      profile_id: body.profile_id ?? null,
      plants: body.plants ?? [],
      sample: body.sample ?? null,
      auth_config: {
        client_id: authConfig?.client_id ?? null,
        client_secret_env: secretEnvName ?? null,
        token_url: safeEndpoint(String(authConfig?.token_url ?? '')),
        sap_client: (authConfig?.sap_client ?? (config.metadata as any)?.sap_client) ?? null,
      },
    }

    const { data: run, error: runError } = await supabase.from('erp_discovery_runs').insert({
      tenant_id: tenantId,
      erp_config_id: configId,
      mode,
      verdict: result.verdict,
      readiness_score: result.readiness_score,
      actor_id: auth.ctx.userId,
      request_redacted: redactedRequest,
      result: { ...result, discovery_fingerprint: newFingerprint },
    }).select('run_id, id').single()
    if (runError) throw runError

    let profileId: string | null = null
    let profileVersion = 0
    if (mode === 'discover') {
      const { data: maxRow } = await supabase
        .from('erp_config_profiles')
        .select('version')
        .eq('tenant_id', tenantId)
        .eq('erp_config_id', configId ?? '00000000-0000-0000-0000-000000000000')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      profileVersion = (maxRow?.version ?? 0) + 1

      const snapshot = {
        ...result.profile_snapshot,
        discovery_fingerprint: newFingerprint,
        source_run_id: run.run_id,
      }
      const { data: profile, error: profileError } = await supabase.from('erp_config_profiles').insert({
        tenant_id: tenantId,
        erp_config_id: configId,
        version: profileVersion,
        status: 'draft',
        snapshot,
        source_run_id: run.run_id,
        created_by: auth.ctx.userId,
      }).select('id').single()
      if (profileError) throw profileError
      profileId = profile.id
    }

    let drift: boolean | null = null
    if (mode === 'verify' && body.profile_id) {
      const { data: existing } = await supabase
        .from('erp_config_profiles')
        .select('snapshot')
        .eq('id', body.profile_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      drift = existing?.snapshot?.discovery_fingerprint
        ? existing.snapshot.discovery_fingerprint !== newFingerprint
        : null
    }

    return json({
      ...result,
      run_id: run.run_id,
      audit_id: run.id,
      config_id: configId,
      secrets: { client_secret_env: secretEnvName ?? null, status: 'set' },
      links: {
        profile_id: profileId,
        profile_version: profileVersion || undefined,
        apply_rpc: 'apply_erp_config_profile',
      },
      verify: mode === 'verify'
        ? { drift, matched_profile_hash: drift === false ? newFingerprint : null }
        : undefined,
    })
  } catch (err) {
    console.error('[erp-preflight] unexpected error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
