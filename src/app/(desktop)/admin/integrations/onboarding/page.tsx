'use client';

// /src/app/(desktop)/admin/integrations/onboarding/page.tsx
// SAP onboarding wizard. Runs read-only discovery, shows evidence and
// proposals, and only then lets an admin review/activate a versioned profile.

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface DiscoveryCheck {
  id: string;
  category: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'UNVERIFIABLE' | 'SKIPPED';
  severity: 'blocker' | 'warning' | 'info';
  http_status?: number;
  evidence?: string;
  recommendation?: string;
}

interface DiscoveryResult {
  run_id?: string;
  config_id?: string | null;
  verdict: 'READY' | 'CONDITIONAL' | 'BLOCKED';
  readiness_score: number;
  sap?: { odata_version?: string; services_probed?: number; sap_client?: string };
  checks: DiscoveryCheck[];
  proposals: {
    sap_expands: Record<string, string[]>;
    sap_field_map: Record<string, Record<string, string>>;
    plant_map_candidates: Record<string, { plant: string; confidence: string; evidence: string }>;
    sap_defaults_candidates: Record<string, string | undefined>;
  };
  human_gates: string[];
  blocking_findings: Array<{ check_id: string; code: string; message: string }>;
  links?: { profile_id?: string | null; profile_version?: number; apply_rpc?: string };
  secrets?: { client_secret_env: string | null; status: string };
  verify?: { drift: boolean | null };
  error?: string;
}

const initialDraft = {
  base_url: '',
  token_url: '',
  client_id: '',
  client_secret_env: '',
  cloud_connector_url: '',
  sap_client: '',
  company_code: '',
  purchasing_org: '',
  purchasing_group: '',
  plant_map: '{ "*": "1001" }',
  plants: '1001',
};

const statusStyle: Record<DiscoveryCheck['status'], string> = {
  PASS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  WARN: 'bg-amber-50 text-amber-700 border-amber-200',
  FAIL: 'bg-rose-50 text-rose-700 border-rose-200',
  UNVERIFIABLE: 'bg-slate-100 text-slate-600 border-slate-200',
  SKIPPED: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function SapOnboardingPage() {
  const [draft, setDraft] = useState(initialDraft);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');

  const setField = (key: keyof typeof initialDraft, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const buildBody = (mode: 'discover' | 'verify') => {
    let plantMap: Record<string, string> = {};
    try {
      plantMap = JSON.parse(draft.plant_map || '{}');
    } catch {
      throw new Error('plant_map must be valid JSON, for example { "*": "1001" }');
    }
    return {
      mode,
      draft: {
        erp_type: 'sap_s4hana',
        erp_name: 'SAP S/4HANA (preflight)',
        base_url: draft.base_url.trim(),
        auth_method: 'oauth2',
        auth_config: {
          client_id: draft.client_id.trim(),
          client_secret_env: draft.client_secret_env.trim(),
          token_url: draft.token_url.trim(),
          cloud_connector_url: draft.cloud_connector_url.trim() || undefined,
          sap_client: draft.sap_client.trim() || undefined,
        },
        company_code: draft.company_code.trim() || undefined,
        purchasing_org: draft.purchasing_org.trim() || undefined,
        purchasing_group: draft.purchasing_group.trim() || undefined,
        metadata: {
          plant_map: plantMap,
          sap_defaults: { defaultStorageLocation: '0001' },
        },
      },
      plants: draft.plants.split(',').map((p) => p.trim()).filter(Boolean),
      options: { check_timeout_ms: 10000, max_sample: 5 },
    };
  };

  const runDiscovery = async (mode: 'discover' | 'verify') => {
    setLoading(true);
    setError(null);
    try {
      const body = buildBody(mode);
      if (mode === 'verify' && result?.links?.profile_id) {
        Object.assign(body, { config_id: result.config_id, profile_id: result.links.profile_id });
      }
      const { data, error: invokeError } = await supabase.functions.invoke('erp-preflight', { body });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(data.error);
      setResult(data as DiscoveryResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const applyProfile = async (activate: boolean) => {
    const profileId = result?.links?.profile_id;
    if (!profileId) {
      setError('No draft profile was created by discovery.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('apply_erp_config_profile', {
        p_profile_id: profileId,
        p_activate: activate,
        p_confirmation: activate ? confirmation : undefined,
        p_reason: activate ? 'Activated from preflight wizard' : 'Reviewed from preflight wizard',
      });
      if (rpcError) throw new Error(rpcError.message);
      setConfirmation('');
      setResult((prev) => prev ? {
        ...prev,
        checks: [
          ...prev.checks,
          {
            id: `workflow.${activate ? 'activated' : 'reviewed'}`,
            category: 'workflow',
            status: 'PASS',
            severity: 'info',
            evidence: activate
              ? 'Configuration profile activated with a written confirmation.'
              : 'Configuration profile marked reviewed; active configuration unchanged.',
          },
        ],
      } : prev);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verdict = result?.verdict;
  const verdictStyle = verdict === 'BLOCKED'
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : verdict === 'CONDITIONAL'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl">
        <Link href="/admin/integrations" className="inline-flex items-center gap-1 text-xs text-indigo-200 hover:text-white mb-3">
          <ArrowLeft className="w-3 h-3" /> Back to control tower
        </Link>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-300" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">Read-only discovery</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight mt-2">SAP Connection Preflight</h1>
        <p className="text-xs text-slate-400 mt-1">
          Discover the live SAP contract, review the proposed field mapping, then activate a versioned configuration.
          Discovery never writes to SAP and never changes the active configuration.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">1. Connection details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {([
            ['base_url', 'SAP Gateway base URL', 'https://sap-gw.example.com:44300'],
            ['token_url', 'OAuth token URL', 'https://ias.example.com/oauth/token'],
            ['client_id', 'OAuth client ID', 'SMARTSTOCK_INT'],
            ['client_secret_env', 'Edge secret name (not the secret)', 'SAP_PROD_CLIENT_SECRET'],
            ['cloud_connector_url', 'Cloud Connector URL (optional)', ''],
            ['sap_client', 'SAP client / MANDT (optional)', '100'],
            ['company_code', 'Company code', '1000'],
            ['purchasing_org', 'Purchasing organisation', '1000'],
            ['purchasing_group', 'Purchasing group', '001'],
          ] as Array<[keyof typeof initialDraft, string, string]>).map(([key, label, placeholder]) => (
            <label key={key} className="block text-xs text-slate-600">
              <span className="block font-bold mb-1">{label}</span>
              <input
                value={draft[key]}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-indigo-400 outline-none"
              />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-xs text-slate-600">
            <span className="block font-bold mb-1">Plant map (JSON, proposed only)</span>
            <textarea
              value={draft.plant_map}
              onChange={(e) => setField('plant_map', e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-indigo-400 outline-none"
            />
          </label>
          <label className="block text-xs text-slate-600">
            <span className="block font-bold mb-1">Plants to validate (comma separated)</span>
            <textarea
              value={draft.plants}
              onChange={(e) => setField('plants', e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-indigo-400 outline-none"
            />
          </label>
        </div>
        <button
          onClick={() => void runDiscovery('discover')}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold transition flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Run preflight discovery
        </button>
      </div>

      {result && (
        <>
          <div className={`rounded-2xl border p-5 flex items-center justify-between ${verdictStyle}`}>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider">Discovery verdict</div>
              <div className="text-2xl font-black mt-1">{verdict}</div>
              <div className="text-xs mt-1 font-mono">
                score {result.readiness_score}/100 · OData {result.sap?.odata_version ?? 'unknown'} ·
                {' '}{result.sap?.services_probed ?? 0} services · run {result.run_id ?? 'n/a'}
              </div>
            </div>
            {result.links?.profile_id && (
              <button
                onClick={() => void runDiscovery('verify')}
                disabled={loading}
                className="px-3 py-2 rounded-lg border border-current text-xs font-bold disabled:opacity-60"
              >
                Re-verify profile
              </button>
            )}
          </div>

          {result.blocking_findings.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-2">
              <h2 className="text-sm font-black text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Blocking findings
              </h2>
              {result.blocking_findings.map((b) => (
                <div key={b.check_id} className="text-xs text-rose-700 font-mono">
                  <span className="font-bold">{b.code}</span>: {b.message}
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">2. Evidence</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {result.checks.map((c) => (
                <div key={c.id} className="flex items-start gap-3 border-b border-slate-100 pb-2">
                  <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${statusStyle[c.status]}`}>
                    {c.status}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-bold text-slate-700">{c.id}</div>
                    {c.evidence && <div className="text-[11px] text-slate-500 break-words">{c.evidence}</div>}
                    {c.recommendation && <div className="text-[11px] text-indigo-700 break-words">{c.recommendation}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">3. Proposed configuration (draft)</h2>
            <p className="text-xs text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Structural fields are proposed automatically. Business meaning below is never auto-applied.
            </p>
            <pre className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto">
{JSON.stringify(result.proposals, null, 2)}
            </pre>
            <div className="text-xs text-slate-600">
              <strong className="font-bold">Human gates:</strong> {result.human_gates.join(', ')}
            </div>
          </div>

          {result.links?.profile_id && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">4. Review and activate</h2>
              <p className="text-xs text-slate-600">
                Reviewing creates an audited reviewed version without touching the active configuration.
                Activation requires a written confirmation and is blocked while discovery reports a blocking finding.
              </p>
              <label className="block text-xs text-slate-600">
                <span className="block font-bold mb-1">Written confirmation (required for activation)</span>
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="I confirm plant mapping and org units are business-correct"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-400 outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void applyProfile(false)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold disabled:opacity-60"
                >
                  Mark reviewed
                </button>
                <button
                  onClick={() => void applyProfile(true)}
                  disabled={loading || confirmation.trim().length < 10}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold"
                >
                  Activate profile v{result.links.profile_version ?? '?'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
