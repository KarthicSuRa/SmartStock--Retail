// /supabase/functions/_shared/erp-adapter/discovery.ts
//
// Read-only SAP preflight discovery.
//
// Principle: discover STRUCTURE automatically; leave BUSINESS MEANING to a
// human. Every check records evidence, everything unobservable is reported as
// UNVERIFIABLE, and a blocker always wins over the numeric score.

import { ERPConfig } from './types.ts';
import {
  EdmxParseResult, entityFields, hasNavigation, hasProperty, parseEdmx,
} from './metadata-parser.ts';

export interface DiscoveryHttpResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json(): Promise<any>;
  headers: { get(name: string): string | null };
}

/** Implemented by SAPAdapter.rawGet — discovery performs GETs only. */
export interface DiscoveryHttpClient {
  rawGet(
    path: string,
    opts?: { accept?: string; headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<DiscoveryHttpResponse>;
}

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'UNVERIFIABLE' | 'SKIPPED';
export type CheckSeverity = 'blocker' | 'warning' | 'info';

export interface DiscoveryCheck {
  id: string;
  category: string;
  status: CheckStatus;
  severity: CheckSeverity;
  endpoint?: string;
  http_status?: number;
  evidence?: string;
  recommendation?: string;
  checked_at: string;
}

export interface DiscoveryInput {
  /** Read-only HTTP client supplied by SAPAdapter.rawGet. */
  client: DiscoveryHttpClient;
  config: ERPConfig;
  timeoutMs?: number;
  maxSample?: number;
  plants?: string[];
  sample?: { materials?: string[]; vendors?: string[]; storageLocations?: string[] };
}

export interface DiscoveryResult {
  sap: {
    odata_version: 'V2' | 'V4' | 'UNKNOWN';
    services_probed: number;
    sap_client?: string;
    release_hint: string;
  };
  verdict: 'READY' | 'CONDITIONAL' | 'BLOCKED';
  readiness_score: number;
  checks: DiscoveryCheck[];
  proposals: {
    sap_expands: Record<string, string[]>;
    sap_field_map: Record<string, Record<string, string>>;
    plant_map_candidates: Record<string, { plant: string; confidence: 'PROBABLE' | 'INCONCLUSIVE'; evidence: string }>;
    sap_defaults_candidates: { defaultStorageLocation?: string; currencyCode?: string };
  };
  human_gates: string[];
  blocking_findings: Array<{ check_id: string; code: string; message: string }>;
  profile_snapshot: Record<string, unknown>;
  metadata_hashes: Record<string, string>;
}

interface ServiceDef {
  key: string;
  root: string;
  entitySet: string;
  requiredProperties: string[];
  requiredNavigations: string[];
  /** Logical SmartStock field -> candidate SAP property names, in priority order. */
  optionalAliases: Record<string, string[]>;
  samplePath: (plant?: string) => string;
  writeService: boolean;
}

const BUILTIN_NAVIGATIONS = new Set([
  'to_Description',
  'to_MatlStkInAcctMod',
  'to_PurchaseOrderItem',
  'to_PurchaseReqnItem',
  'to_MaterialDocumentItem',
]);

const SERVICES: ServiceDef[] = [
  {
    key: 'API_PRODUCT_SRV',
    root: '/sap/opu/odata/sap/API_PRODUCT_SRV',
    entitySet: 'A_Product',
    requiredProperties: ['Product', 'BaseUnit', 'IsMarkedForDeletion'],
    requiredNavigations: ['to_Description'],
    optionalAliases: {
      sales_uom: ['SalesUnit'],
      ean_gtin: ['EAN', 'GTIN'],
      shelf_life_days: ['ShelfLife', 'MinimumShelfLife'],
      rounding_value: ['RoundingValue', 'BaseQuantity'],
      min_order_qty: ['MinOrderQuantity', 'MinimumOrderQuantity'],
      standard_price: ['StandardPrice', 'MovingAveragePrice'],
    },
    samplePath: () => '/A_Product?$top=1&$expand=to_Description',
    writeService: false,
  },
  {
    key: 'API_MATERIAL_STOCK_SRV',
    root: '/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV',
    entitySet: 'A_MaterialStock',
    requiredProperties: ['Material', 'Plant', 'StorageLocation', 'InventoryStockType'],
    requiredNavigations: ['to_MatlStkInAcctMod'],
    optionalAliases: {},
    samplePath: (plant) =>
      `/A_MaterialStock${plant ? `?$filter=${encodeURIComponent(`Plant eq '${plant}'`)}` : '?'}` +
      (plant ? '&' : '') + '$top=1&$expand=to_MatlStkInAcctMod',
    writeService: false,
  },
  {
    key: 'API_MATERIAL_DOCUMENT_SRV',
    root: '/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV',
    entitySet: 'A_MaterialDocumentHeader',
    requiredProperties: ['PostingDate', 'DocumentDate', 'GoodsMovementCode', 'MaterialDocumentHeaderText'],
    requiredNavigations: ['to_MaterialDocumentItem'],
    optionalAliases: {},
    samplePath: () => '/A_MaterialDocumentHeader?$top=1&$expand=to_MaterialDocumentItem',
    writeService: true,
  },
  {
    key: 'API_PURCHASEREQ_PROCESS_SRV',
    root: '/sap/opu/odata/sap/API_PURCHASEREQ_PROCESS_SRV',
    entitySet: 'A_PurchaseRequisitionHeader',
    requiredProperties: ['PurchaseRequisitionType', 'PurReqnDescription'],
    requiredNavigations: ['to_PurchaseReqnItem'],
    optionalAliases: { validation_only: ['PurReqnDoOnlyValidation'] },
    samplePath: () => '/A_PurchaseRequisitionHeader?$top=1',
    writeService: true,
  },
  {
    key: 'API_PURCHASEORDER_PROCESS_SRV',
    root: '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV',
    entitySet: 'A_PurchaseOrder',
    requiredProperties: ['CompanyCode', 'PurchaseOrderType', 'Supplier', 'DocumentCurrency', 'PurchasingOrganization', 'PurchasingGroup'],
    requiredNavigations: ['to_PurchaseOrderItem'],
    optionalAliases: {
      delivered_qty: ['DeliveredQuantity'],
      invoiced_qty: ['InvoicedQuantity'],
      total_value: ['TotalNetAmount', 'NetAmount'],
    },
    samplePath: () => '/A_PurchaseOrder?$top=1&$expand=to_PurchaseOrderItem',
    writeService: true,
  },
  {
    key: 'API_BUSINESS_PARTNER',
    root: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
    entitySet: 'A_Supplier',
    requiredProperties: ['Supplier', 'SupplierName'],
    requiredNavigations: [],
    optionalAliases: {
      currency: ['Currency'],
      min_order_qty: ['MinimumOrderQuantity', 'MinOrderQty'],
      rounding_value: ['RoundingValue'],
      contract_net_price: ['NetPriceAmount', 'ContractNetPrice'],
    },
    samplePath: () => '/A_Supplier?$top=1',
    writeService: false,
  },
];

const HUMAN_GATES = [
  'PLANT_MAP',
  'COMPANY_CODE',
  'PURCHASING_ORG',
  'PURCHASING_GROUP',
  'ACCOUNT_ASSIGNMENT',
  'POSTING_PERIODS',
  'NUMBER_RANGES',
];

function now(): string {
  return new Date().toISOString();
}

/** Keep only structural URL information in audit evidence. */
export function safeEndpoint(path: string): string {
  const [base, query] = path.split('?');
  if (!query) return base;
  const keys = Array.from(new URLSearchParams(query).keys());
  return `${base}?${keys.join(',')}`;
}

function shortHash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function check(
  id: string,
  category: string,
  status: CheckStatus,
  severity: CheckSeverity,
  extra: Partial<DiscoveryCheck> = {},
): DiscoveryCheck {
  return { id, category, status, severity, checked_at: now(), ...extra };
}

function rowsFrom(payload: any): any[] {
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.results)) return payload.results;
  if (payload?.d && typeof payload.d === 'object') return [payload.d];
  return [];
}

function nonNullFields(rows: any[]): Set<string> {
  const fields = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row ?? {})) {
      if (value !== null && value !== undefined && value !== '') fields.add(key);
    }
  }
  return fields;
}

async function fetchXml(
  client: DiscoveryHttpClient,
  path: string,
  timeoutMs: number,
): Promise<{ response: DiscoveryHttpResponse; xml: string } | { error: string; status?: number }> {
  try {
    const response = await client.rawGet(path, {
      accept: 'application/xml',
      headers: { 'Accept': 'application/xml' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { error: `HTTP ${response.status}`, status: response.status };
    return { response, xml: await response.text() };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function fetchSample(
  client: DiscoveryHttpClient,
  path: string,
  timeoutMs: number,
): Promise<{ rows: any[]; status: number }> {
  try {
    const response = await client.rawGet(path, {
      accept: 'application/json',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { rows: [], status: response.status };
    return { rows: rowsFrom(await response.json()), status: response.status };
  } catch {
    return { rows: [], status: 0 };
  }
}

/**
 * Runs all read-only discovery checks. Never writes to SAP and never returns
 * a "READY" verdict while a blocker or a mandatory human gate is open.
 */
export async function runDiscovery(input: DiscoveryInput): Promise<DiscoveryResult> {
  const timeoutMs = input.timeoutMs ?? 10_000;
  const config = input.config;
  const plants = (input.plants ?? []).filter(Boolean);
  const checks: DiscoveryCheck[] = [];
  const hashes: Record<string, string> = {};
  const parsedByService: Record<string, EdmxParseResult> = {};
  const sampleFieldsByService: Record<string, Set<string>> = {};

  // Three at a time, deterministic ordering of results.
  const results: Array<Awaited<ReturnType<typeof probe>>> = new Array(SERVICES.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < SERVICES.length) {
      const index = cursor++;
      results[index] = await probe(SERVICES[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, SERVICES.length) }, () => worker()));

  async function probe(service: ServiceDef) {
    const client = input.client;
    const serviceChecks: DiscoveryCheck[] = [];
    const metadataPath = `${service.root}/$metadata`;

    const fetched = await fetchXml(client, metadataPath, timeoutMs);
    if ('error' in fetched) {
      const status = fetched.error === 'Request timeout' ? 'UNVERIFIABLE' : 'FAIL';
      serviceChecks.push(check(
        `service.${service.key}.metadata`, 'service_contract', status, status === 'FAIL' ? 'blocker' : 'warning',
        {
          endpoint: safeEndpoint(metadataPath),
          http_status: fetched.status,
          evidence: fetched.error,
          recommendation: `Activate ${service.key} in SAP Gateway and grant the technical user S_SERVICE access.`,
        },
      ));
      return {
        serviceChecks,
        parsed: undefined as EdmxParseResult | undefined,
        sampleFields: new Set<string>(),
        rowsForSampling: [] as any[],
        csrfOk: false,
      };
    }

    const parsed = parseEdmx(fetched.xml);
    hashes[service.key] = shortHash(fetched.xml);
    serviceChecks.push(check(
      `service.${service.key}.metadata`, 'service_contract', 'PASS', 'info',
      { endpoint: safeEndpoint(metadataPath), http_status: fetched.response.status, evidence: `version=${parsed.version}` },
    ));

    if (parsed.version === 'V4' || parsed.version === 'UNKNOWN') {
      serviceChecks.push(check(
        `service.${service.key}.version`, 'service_contract', 'FAIL', 'blocker',
        {
          evidence: parsed.versionEvidence[0] ?? 'unparseable EDMX',
          recommendation: parsed.version === 'V4'
            ? 'This adapter supports released OData V2 services only. Expose the V2 endpoint or wait for a V4 adapter.'
            : 'Could not determine OData version; review $metadata manually.',
        },
      ));
    }

    const fields = entityFields(parsed, service.entitySet);
    if (!fields) {
      serviceChecks.push(check(
        `service.${service.key}.entity_set`, 'service_contract', 'FAIL', 'blocker',
        {
          evidence: `EntitySet ${service.entitySet} not found`,
          recommendation: `Verify ${service.key} exposes ${service.entitySet} in this release/edition.`,
        },
      ));
    } else {
      const missing = [
        ...service.requiredProperties.filter((p) => !hasProperty(parsed, service.entitySet, p)),
        ...service.requiredNavigations.filter((n) => !hasNavigation(parsed, service.entitySet, n)),
      ];
      serviceChecks.push(check(
        `service.${service.key}.entity_set`, 'service_contract', missing.length ? 'FAIL' : 'PASS',
        missing.length ? 'blocker' : 'info',
        {
          evidence: missing.length ? `missing: ${missing.join(', ')}` : `${service.entitySet} fields present`,
          recommendation: missing.length ? 'The adapter cannot build this payload; do not activate the profile.' : undefined,
        },
      ));
    }

    // Sample read: confirms the contract is actually queryable with this user.
    const sampleResult = await fetchSample(client, service.samplePath(plants[0]), timeoutMs);
    const sampleFields = nonNullFields(sampleResult.rows);
    if (sampleResult.status >= 400) {
      serviceChecks.push(check(
        `service.${service.key}.sample`, 'connectivity',
        sampleResult.status === 401 || sampleResult.status === 403 ? 'FAIL' : 'UNVERIFIABLE',
        sampleResult.status === 401 || sampleResult.status === 403 ? 'blocker' : 'warning',
        {
          endpoint: safeEndpoint(service.samplePath(plants[0])),
          http_status: sampleResult.status,
          recommendation: 'Check the communication user authorizations and S_SERVICE assignment.',
        },
      ));
    } else {
      serviceChecks.push(check(
        `service.${service.key}.sample`, 'connectivity',
        sampleResult.rows.length ? 'PASS' : 'WARN', 'info',
        {
          endpoint: safeEndpoint(service.samplePath(plants[0])),
          http_status: sampleResult.status,
          evidence: sampleResult.rows.length
            ? `sample rows=${sampleResult.rows.length}; populated fields=${sampleFields.size}`
            : 'query succeeded but returned no rows (master data may be empty)',
        },
      ));
    }

    let csrfOk = false;
    if (service.writeService) {
      const csrfPath = `${service.root}/`;
      try {
        const response = await client.rawGet(csrfPath, {
          accept: 'application/json',
          headers: { 'X-CSRF-Token': 'Fetch' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const token = response.headers.get('x-csrf-token');
        csrfOk = response.ok && Boolean(token) && token!.toLowerCase() !== 'required';
        serviceChecks.push(check(
          `service.${service.key}.csrf`, 'write_capability', csrfOk ? 'PASS' : 'FAIL',
          csrfOk ? 'info' : 'blocker',
          {
            endpoint: safeEndpoint(csrfPath),
            http_status: response.status,
            evidence: csrfOk ? 'CSRF token issued' : 'no usable CSRF token',
            recommendation: csrfOk ? undefined : 'Grant CSRF fetch access for this service root to the communication user.',
          },
        ));
      } catch (err) {
        serviceChecks.push(check(
          `service.${service.key}.csrf`, 'write_capability', 'UNVERIFIABLE', 'warning',
          { endpoint: safeEndpoint(csrfPath), evidence: (err as Error).message },
        ));
      }
    }

    return { serviceChecks, parsed, sampleFields, rowsForSampling: sampleResult.rows, csrfOk };
  }

  for (const r of results) {
    if (!r) continue;
    checks.push(...r.serviceChecks);
  }
  for (let i = 0; i < SERVICES.length; i++) {
    const r = results[i];
    if (!r?.parsed) continue;
    parsedByService[SERVICES[i].key] = r.parsed;
    sampleFieldsByService[SERVICES[i].key] = r.sampleFields;
  }

  // --- proposals -----------------------------------------------------------
  const proposals: DiscoveryResult['proposals'] = {
    sap_expands: { material: [], vendor: [], purchaseOrder: [] },
    sap_field_map: { material: {}, vendor: {} },
    plant_map_candidates: {},
    sap_defaults_candidates: {},
  };

  const expandTargets: Array<{ logical: 'material' | 'vendor' | 'purchaseOrder'; service: string; entitySet: string }> = [
    { logical: 'material', service: 'API_PRODUCT_SRV', entitySet: 'A_Product' },
    { logical: 'vendor', service: 'API_BUSINESS_PARTNER', entitySet: 'A_Supplier' },
    { logical: 'purchaseOrder', service: 'API_PURCHASEORDER_PROCESS_SRV', entitySet: 'A_PurchaseOrder' },
  ];
  for (const target of expandTargets) {
    const parsed = parsedByService[target.service];
    const fields = parsed && entityFields(parsed, target.entitySet);
    if (!fields) continue;
    proposals.sap_expands[target.logical] = fields.navigations
      .filter((n) => !BUILTIN_NAVIGATIONS.has(n))
      .filter((n) => /^[A-Za-z][A-Za-z0-9_]*$/.test(n));
  }

  const fieldTargets: Array<{ logical: 'material' | 'vendor'; service: string; entitySet: string }> = [
    { logical: 'material', service: 'API_PRODUCT_SRV', entitySet: 'A_Product' },
    { logical: 'vendor', service: 'API_BUSINESS_PARTNER', entitySet: 'A_Supplier' },
  ];
  for (const target of fieldTargets) {
    const parsed = parsedByService[target.service];
    if (!parsed) continue;
    const fields = entityFields(parsed, target.entitySet);
    const populated = sampleFieldsByService[target.service] ?? new Set<string>();
    const serviceDef = SERVICES.find((s) => s.key === target.service)!;
    for (const [logical, aliases] of Object.entries(serviceDef.optionalAliases)) {
      const matches = aliases.filter((a) => hasProperty(parsed, target.entitySet, a));
      if (matches.length === 1) {
        const property = matches[0];
        const status: CheckStatus = populated.has(property) ? 'PASS' : 'WARN';
        checks.push(check(
          `field.${target.logical}.${logical}`, 'field_mapping', status, status === 'PASS' ? 'info' : 'warning',
          {
            evidence: `${logical} -> ${property}${populated.has(property) ? '' : ' (in metadata but no non-null sample value)'}`,
          },
        ));
        if (status === 'PASS') proposals.sap_field_map[target.logical][logical] = property;
      } else if (matches.length > 1) {
        checks.push(check(
          `field.${target.logical}.${logical}`, 'field_mapping', 'WARN', 'warning',
          { evidence: `ambiguous candidates: ${matches.join(', ')}`, recommendation: 'Choose one field manually; no automatic mapping emitted.' },
        ));
      }
    }
    if (!fields) continue;
  }

  const stockRows = results[SERVICES.findIndex((s) => s.key === 'API_MATERIAL_STOCK_SRV')];
  const observedPlants = new Set<string>();
  const observedLocations = new Set<string>();
  if (stockRows?.rowsForSampling) {
    for (const row of stockRows.rowsForSampling) {
      if (row.Plant) observedPlants.add(String(row.Plant));
      if (row.StorageLocation) observedLocations.add(String(row.StorageLocation));
    }
  }
  for (const plant of plants.length ? plants : Array.from(observedPlants)) {
    proposals.plant_map_candidates[plant] = {
      plant,
      confidence: observedPlants.has(plant) ? 'PROBABLE' : 'INCONCLUSIVE',
      evidence: observedPlants.has(plant)
        ? 'Plant observed in a non-empty A_MaterialStock sample read'
        : 'Plant supplied by caller but not observed in sampled stock rows',
    };
  }
  const observedLocation = Array.from(observedLocations)[0];
  if (observedLocation) proposals.sap_defaults_candidates.defaultStorageLocation = observedLocation;

  // --- configuration and human gates -------------------------------------
  const meta = (config.metadata ?? {}) as Record<string, any>;
  const defaults = (meta.sap_defaults ?? {}) as Record<string, any>;
  const plantMap = (meta.plant_map ?? {}) as Record<string, string>;
  const orgFields: Array<[string, string | undefined, string]> = [
    ['company_code', config.company_code ?? defaults.companyCode, 'COMPANY_CODE'],
    ['purchasing_org', config.purchasing_org ?? defaults.purchasingOrganization, 'PURCHASING_ORG'],
    ['purchasing_group', config.purchasing_group ?? defaults.purchasingGroup, 'PURCHASING_GROUP'],
  ];
  for (const [id, value, gate] of orgFields) {
    checks.push(check(
      `config.${id}`, 'configuration', value ? 'PASS' : 'FAIL', value ? 'info' : 'blocker',
      {
        evidence: value ? `${id} configured` : `${id} missing`,
        recommendation: value ? undefined : `Set ${id} in erp_configurations or metadata.sap_defaults. Never guessed by the adapter.`,
      },
    ));
    if (value) {
      // Values are prefilled by discovery but still require human confirmation.
      checks.push(check(`gate.${gate}`, 'human_gate', 'WARN', 'warning', {
        evidence: `Value ${value} must be confirmed as business-correct before activation.`,
      }));
    }
  }

  const plantEntries = Object.keys(plantMap);
  checks.push(check(
    'config.plant_map', 'configuration', plantEntries.length ? 'PASS' : 'FAIL',
    plantEntries.length ? 'info' : 'blocker',
    {
      evidence: plantEntries.length
        ? `${plantEntries.length} mapping entr${plantEntries.length === 1 ? 'y' : 'ies'} (${plantEntries.some((k) => k === '*') ? 'includes wildcard' : 'no wildcard'})`
        : 'no plant_map entries',
      recommendation: plantEntries.length
        ? 'Confirm each store-to-plant relationship manually before activation.'
        : 'Add metadata.plant_map entries or a wildcard; the adapter fails closed without one.',
    },
  ));

  checks.push(check(
    'config.storage_location', 'configuration',
    defaults.defaultStorageLocation ? 'PASS' : 'WARN', 'info',
    {
      evidence: defaults.defaultStorageLocation
        ? `defaultStorageLocation=${defaults.defaultStorageLocation}`
        : 'not configured; runtime falls back to 0001',
      recommendation: defaults.defaultStorageLocation ? undefined : 'Confirm the storage location per plant; the 0001 fallback is not a business decision.',
    },
  ));

  for (const gate of ['POSTING_PERIODS', 'NUMBER_RANGES', 'ACCOUNT_ASSIGNMENT']) {
    checks.push(check(
      `gate.${gate}`, 'human_gate', 'UNVERIFIABLE', 'warning',
      {
        evidence: 'Not observable through the six released OData services.',
        recommendation: gate === 'POSTING_PERIODS'
          ? 'SAP Basis/controlling sign-off required (OB52).'
          : gate === 'NUMBER_RANGES'
            ? 'SAP Basis sign-off required (SNRO / document number ranges).'
            : 'Confirm cost centre/order/WBS before enabling goods issue with account assignment.',
      },
    ));
  }

  // --- scoring and verdict ------------------------------------------------
  const scored = (categories: string[], max: number): number => {
    const relevant = checks.filter((c) => categories.includes(c.category));
    if (!relevant.length) return 0;
    return Math.min(max, (relevant.filter((c) => c.status === 'PASS').length / relevant.length) * max);
  };
  const score = Math.round(
    scored(['auth', 'connectivity'], 15) +
    scored(['service_contract'], 30) +
    scored(['write_capability'], 15) +
    scored(['configuration'], 20) +
    scored(['human_gate'], 10) +
    scored(['field_mapping'], 10),
  );

  const blockers = checks.filter((c) => c.severity === 'blocker' && (c.status === 'FAIL' || c.status === 'UNVERIFIABLE'));
  const blockingFindings = blockers.map((c) => ({
    check_id: c.id,
    code: c.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    message: c.recommendation ?? c.evidence ?? c.status,
  }));

  const verdict: DiscoveryResult['verdict'] = blockers.length
    ? 'BLOCKED'
    : (score >= 85 && HUMAN_GATES.every((g) => checks.some((c) => c.id === `gate.${g}` && c.status === 'PASS')))
      ? 'READY'
      : 'CONDITIONAL';

  const profile_snapshot: Record<string, unknown> = {
    erp_type: config.erp_type,
    erp_name: config.erp_name,
    base_url: config.base_url,
    auth_method: config.auth_method,
    auth_config: {
      client_id: (config.auth_config as any)?.client_id,
      client_secret_env: (config.auth_config as any)?.client_secret_env,
      token_url: (config.auth_config as any)?.token_url,
      cloud_connector_url: (config.auth_config as any)?.cloud_connector_url,
      scope: (config.auth_config as any)?.scope,
      sap_client: (config.auth_config as any)?.sap_client ?? meta.sap_client,
    },
    company_code: config.company_code,
    purchasing_org: config.purchasing_org,
    purchasing_group: config.purchasing_group,
    metadata: {
      ...meta,
      sap_expands: { ...(meta.sap_expands ?? {}), ...proposals.sap_expands },
      sap_field_map: { ...(meta.sap_field_map ?? {}), ...proposals.sap_field_map },
      sap_client: (config.auth_config as any)?.sap_client ?? meta.sap_client,
    },
    discovered_at: now(),
    odata_version: Object.values(parsedByService)[0]?.version ?? 'UNKNOWN',
  };

  return {
    sap: {
      odata_version: Object.values(parsedByService)[0]?.version ?? 'UNKNOWN',
      services_probed: SERVICES.length,
      sap_client: (config.auth_config as any)?.sap_client ?? meta.sap_client,
      release_hint: 'unverified',
    },
    verdict,
    readiness_score: score,
    checks,
    proposals,
    human_gates: HUMAN_GATES,
    blocking_findings: blockingFindings,
    profile_snapshot,
    metadata_hashes: hashes,
  };
}
