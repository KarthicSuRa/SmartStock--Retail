// /supabase/functions/_shared/erp-adapter/sap-adapter.ts
//
// SAP S/4HANA adapter ΓÇö released OData V2 services only.
//
// ---------------------------------------------------------------------------
// VERIFIED CONTRACT
// ---------------------------------------------------------------------------
// Service / entity names below are taken from SAP's own OData V2 service map
// (SAP/cloud-sdk, static/resources/SDKv4-ODatav2-serviceNameMappings.properties)
// and SAP Business Accelerator Hub:
//
//   API_MATERIAL_DOCUMENT_SRV      / A_MaterialDocumentHeader
//       create = POST with deep insert nav "to_MaterialDocumentItem"
//   API_MATERIAL_STOCK_SRV         / A_MaterialStock  (read only)
//       acquired quantities live on nav "to_MatlStkInAcctMod"
//   API_PURCHASEORDER_PROCESS_SRV  / A_PurchaseOrder
//       items via nav "to_PurchaseOrderItem"
//   API_PURCHASEREQ_PROCESS_SRV    / A_PurchaseRequisitionHeader
//       items via nav "to_PurchaseReqnItem"
//   API_PRODUCT_SRV                / A_Product
//   API_BUSINESS_PARTNER           / A_Supplier
//
// There is no "API_INVENTORY_TRANSACTION_SRV", "API_PURCHASEORDER_SRV" or
// "API_PURCHASEREQUISITION_SRV" in SAP's released service list, and no entity
// "A_GoodsMovementHeader". Posting through those names cannot succeed.
//
// GoodsMovementCode (SAP KBA 3333223):
//   01 GR for purchase order   02 GR for production order   03 Goods issue
//   04 Transfer posting        05 Other goods receipt       06 Reversal
//   07 Subsequent adjustment (subcontracting)
//
// Movement types (SAP Learning "Posting Unplanned Goods Issue"; KBA 3697643):
//   551 scrap from unrestricted   553 scrap from inspection   555 scrap from blocked
//   501 GR without PO (unrestricted)   301 one-step plant-to-plant transfer
//   701/702 are physical-inventory differences and are NOT accepted by
//   API_MATERIAL_DOCUMENT_SRV (KBA 2689573 / M7/096) ΓÇö use
//   API_PHYSICAL_INVENTORY_DOC_SRV instead.
//
// ---------------------------------------------------------------------------
// WRITE SAFETY
// ---------------------------------------------------------------------------
// Writes are attempted exactly once from this adapter. SAP commits the document
// before the HTTP response is serialised, so retrying after a dropped response
// would create a second, independently metered document. Retries belong to the
// outbox and must be gated on a posting-status probe.
//
// Anything the adapter cannot map with confidence is rejected with an
// actionable error instead of being written as a plausible-but-wrong movement.

import { BaseERPAdapter } from './base-adapter.ts';
import {
  ERPConfig, SAPAuthConfig, MaterialMaster, StockBaseline,
  InventoryMovement, PurchaseRequisition, PurchaseOrder, BatchResult,
  ReconciliationResult, GoodsReceipt, VendorInfo, POFilter, PostingStatusResult,
  POItem, ERPCapabilities,
} from './types.ts';
import {
  NonRetryableError, OutcomeUnknownError, SapConfigurationError,
  isNonRetryable, isTransportFailure,
} from './errors.ts';

// ==================== SERVICE PATHS (verified) ====================

const SVC_MATERIAL_DOCUMENT = '/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV';
const SVC_MATERIAL_STOCK = '/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV';
const SVC_PURCHASE_ORDER = '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV';
const SVC_PURCHASE_REQ = '/sap/opu/odata/sap/API_PURCHASEREQ_PROCESS_SRV';
const SVC_PRODUCT = '/sap/opu/odata/sap/API_PRODUCT_SRV';
const SVC_BUSINESS_PARTNER = '/sap/opu/odata/sap/API_BUSINESS_PARTNER';

const ENTITY_MATERIAL_DOCUMENT = 'A_MaterialDocumentHeader';
const ENTITY_PURCHASE_ORDER = 'A_PurchaseOrder';
const ENTITY_PURCHASE_REQ = 'A_PurchaseRequisitionHeader';

// ==================== HELPERS ====================

const CRLF = '\r\n';

/** OData V2 Edm.DateTime literal accepted by SAP Gateway: YYYY-MM-DDT00:00:00 */
function toSapDate(value?: string | null): string {
  const parsed = value ? new Date(value) : new Date();
  const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00:00`;
}

function newBoundary(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** First defined, non-null value from a list of release-dependent SAP fields. */
function firstDefined<T>(...values: Array<T | undefined | null>): T | undefined {
  return values.find((v): v is T => v !== undefined && v !== null && v !== '');
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Deterministic, 25-character-safe material-document header reference.
 *
 * The hash makes a probe possible without a custom field: the same SmartStock
 * reference always produces the same BKTXT. The readable suffix is only a hint
 * for operators; the whole string is what getPostingStatus matches on.
 */
function toPostingReference(reference: string): string {
  let hash = 2166136261;
  for (let i = 0; i < reference.length; i++) {
    hash ^= reference.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  const readable = reference.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12);
  return `SS-${hex}-${readable}`.slice(0, 25);
}

/** Extracts `name=value` pairs from Set-Cookie headers (multi-header safe). */
function collectCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  let raw: string[] = [];
  if (typeof headers.getSetCookie === 'function') {
    raw = headers.getSetCookie();
  } else {
    // Fallback: a single combined header. Splitting on ", " is unsafe because
    // Expires contains commas, so keep the whole value and strip attributes.
    const single = res.headers.get('set-cookie');
    if (single) raw = [single];
  }
  return raw
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

interface SapDefaults {
  companyCode: string;
  purchasingOrganization?: string;
  purchasingGroup: string;
  defaultStorageLocation: string;
}

// Default movement type + GoodsMovementCode pairing (SAP KBA 3333223).
// A caller override may supply either half; the other is taken from here.
// null means "no safe default exists" and the movement is rejected unless the
// caller supplies the missing value explicitly.
const defaultMovementMap: Record<string, { goodsMovementCode: string | null; goodsMovementType: string | null }> = {
  DAMAGE: { goodsMovementCode: '03', goodsMovementType: '551' },
  GOODS_RECEIPT: { goodsMovementCode: '05', goodsMovementType: '501' },
  TRANSFER_OUT: { goodsMovementCode: '04', goodsMovementType: '301' },
  TRANSFER_IN: { goodsMovementCode: null, goodsMovementType: null },
  SALE: { goodsMovementCode: null, goodsMovementType: null },
  GOODS_ISSUE: { goodsMovementCode: '03', goodsMovementType: '201' },
  ADJUSTMENT: { goodsMovementCode: null, goodsMovementType: null },
  COUNT: { goodsMovementCode: null, goodsMovementType: null },
};

function defaultMovementMapping(
  movementType: string,
): { goodsMovementCode: string | null; goodsMovementType: string | null } | undefined {
  return defaultMovementMap[movementType];
}

type MovementResolution =
  | { ok: true; goodsMovementCode: string; goodsMovementType: string }
  | { ok: false; reason: string };

interface MovementOutcome {
  success: boolean;
  erp_doc?: string;
  erp_doc_year?: string;
  error?: string;
}

// ==================== ADAPTER ====================

export class SAPAdapter extends BaseERPAdapter {
  private accessToken?: string;
  private tokenExpiry?: number;
  private authConfig: SAPAuthConfig;

  /** CSRF token + session cookie per OData service root. */
  private csrf = new Map<string, { token: string; cookie: string }>();

  constructor(config: ERPConfig) {
    super(config);
    this.authConfig = config.auth_config as SAPAuthConfig;
  }

  // ==================== REQUEST PLUMBING ====================

  /** SAP client (MANDT) from auth_config, or metadata.sap_client. */
  private get sapClient(): string | undefined {
    const metadata = (this.config.metadata ?? {}) as Record<string, unknown>;
    return this.authConfig.sap_client || (metadata.sap_client as string | undefined);
  }

  private withSapClient(endpoint: string): string {
    const client = this.sapClient;
    if (!client || /[?&]sap-client=/.test(endpoint)) return endpoint;
    return `${endpoint}${endpoint.includes('?') ? '&' : '?'}sap-client=${encodeURIComponent(client)}`;
  }

  /** Optional extra $expand targets for customer-specific releases. */
  private extraExpands(entity: 'material' | 'vendor' | 'purchaseOrder'): string {
    const metadata = (this.config.metadata ?? {}) as Record<string, any>;
    const configured = metadata.sap_expands?.[entity];
    if (typeof configured !== 'string') return '';
    // Never let configuration inject OData syntax: only navigation names.
    return configured
      .split(',')
      .map((part) => part.trim())
      .filter((part) => /^[A-Za-z][A-Za-z0-9_]*$/.test(part))
      .join(',');
  }

  /**
   * Reads every OData V2 page. SAP signals more data with `d.__next` (or the
   * v4-style `@odata.nextLink` on some Gateway versions); a bare $top would
   * silently truncate larger plants and catalogs.
   */
  private async fetchAll<T = any>(endpoint: string, context: string): Promise<T[]> {
    const rows: T[] = [];
    let next: string | undefined = endpoint;
    let pages = 0;
    const maxPages = 100;

    while (next) {
      if (++pages > maxPages) {
        throw new NonRetryableError(
          `${context}: exceeded ${maxPages} OData pages. Configure a narrower filter; refusing to return a truncated result as complete.`,
        );
      }
      const response = await this.sapRequest(this.withSapClient(next));
      if (!response.ok) throw new Error(`${context} failed: HTTP ${response.status}`);
      const data = await response.json();
      rows.push(...((data?.d?.results ?? []) as T[]));

      const link = data?.d?.__next ?? data?.d?.['@odata.nextLink'];
      if (!link) break;
      if (/^https?:\/\//i.test(link)) {
        const base = new URL(this.config.base_url);
        const target = new URL(link);
        if (target.origin !== base.origin) {
          throw new NonRetryableError(`${context}: nextLink points to a different host; refusing to follow it.`);
        }
        next = link.slice(target.origin.length);
      } else {
        next = link;
      }
    }
    return rows;
  }

  private postingReference(reference: string): string {
    return reference.startsWith('SS-') ? reference.slice(0, 25) : toPostingReference(reference);
  }

  // ==================== AUTHENTICATION ====================

  async connect(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAccessToken();
      const health = await this.healthCheck();
      return {
        success: health.status !== 'down',
        message: `SAP S/4HANA ${health.status} (latency: ${health.latency_ms}ms)`,
      };
    } catch (error) {
      return { success: false, message: `Connection failed: ${(error as Error).message}` };
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300_000) {
      return this.accessToken;
    }

    const tokenUrl = this.authConfig.cloud_connector_url
      ? `${this.authConfig.cloud_connector_url}/oauth/token`
      : this.authConfig.token_url;

    if (!tokenUrl) {
      throw new SapConfigurationError('SAP auth_config.token_url is not configured.');
    }

    // The factory normally resolves client_secret_env; this also covers direct
    // construction of SAPAdapter (unit tests, custom callers).
    const clientSecret = this.authConfig.client_secret_env
      ? Deno.env.get(this.authConfig.client_secret_env)
      : this.authConfig.client_secret;
    if (!this.authConfig.client_id || !clientSecret) {
      throw new SapConfigurationError(
        'SAP OAuth credentials are incomplete. Set auth_config.client_secret_env to an Edge secret instead of storing the secret in erp_configurations.',
      );
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${this.authConfig.client_id}:${clientSecret}`)}`,
      },
      body: new URLSearchParams(
        this.authConfig.scope
          ? { grant_type: 'client_credentials', scope: this.authConfig.scope }
          : { grant_type: 'client_credentials' },
      ),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new NonRetryableError(`SAP OAuth failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (Number(data.expires_in ?? 3600) * 1000);
    return this.accessToken!;
  }

  // ==================== CSRF (SAP Help: Cross-Site Request Forgery Protection) ====================
  //
  // A modifying request needs BOTH the token returned by a GET carrying
  // "X-CSRF-Token: Fetch" AND the anti-XSRF session cookie from that same
  // response. Sending "Fetch" on the write itself always yields 403.

  private serviceRootOf(endpoint: string): string {
    const match = endpoint.match(/^(\/sap\/opu\/odata\/sap\/[^/?]+)/);
    return match ? match[1] : endpoint;
  }

  private async fetchCsrf(serviceRoot: string, force = false): Promise<{ token: string; cookie: string }> {
    if (!force) {
      const cached = this.csrf.get(serviceRoot);
      if (cached?.token) return cached;
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.config.base_url}${this.withSapClient(`${serviceRoot}/`)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-CSRF-Token': 'Fetch',
        'Accept': 'application/json',
      },
    });

    const issued = response.headers.get('x-csrf-token');
    if (!response.ok || !issued || issued.toLowerCase() === 'required') {
      throw new NonRetryableError(
        `SAP did not issue a CSRF token for ${serviceRoot} (HTTP ${response.status}). ` +
        `Verify the communication user's authorisation for this service.`,
      );
    }

    const entry = { token: issued, cookie: collectCookies(response) };
    this.csrf.set(serviceRoot, entry);
    return entry;
  }

  /**
   * Executes a request against SAP.
   *
   * @param write modifying request -> CSRF token + cookie are attached and a
   *              single transparent retry is performed on 403 token expiry.
   */
  private async sapRequest(
    endpoint: string,
    options: RequestInit = {},
    opts: { write?: boolean } = {},
  ): Promise<Response> {
    const write = opts.write === true;
    const serviceRoot = this.serviceRootOf(endpoint);

    const send = async (csrf?: { token: string; cookie: string }): Promise<Response> => {
      const accessToken = await this.getAccessToken();
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      };
      // $batch carries its own multipart Content-Type; never clobber it.
      if (!options.headers || !('Content-Type' in (options.headers as Record<string, string>))) {
        headers['Content-Type'] = 'application/json';
      }
      if (csrf) {
        headers['X-CSRF-Token'] = csrf.token;
        if (csrf.cookie) headers['Cookie'] = csrf.cookie;
      }
      return fetch(`${this.config.base_url}${this.withSapClient(endpoint)}`, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
      });
    };

    if (!write) return send();

    let csrf = await this.fetchCsrf(serviceRoot);
    let response = await send(csrf);

    if (response.status === 403) {
      // Token expired or session rotated: refresh once, then give up.
      this.csrf.delete(serviceRoot);
      csrf = await this.fetchCsrf(serviceRoot, true);
      response = await send(csrf);
    }
    return response;
  }

  /**
   * Read-only escape hatch for preflight discovery. Deliberately exposes no
   * write path: discovery reuses the existing token, sap-client, CSRF-free
   * GET handling, timeout, retry and circuit-breaker plumbing.
   */
  async rawGet(
    path: string,
    opts: { accept?: string; headers?: Record<string, string>; signal?: AbortSignal } = {},
  ): Promise<Response> {
    return this.sapRequest(path, {
      method: 'GET',
      headers: {
        ...(opts.accept ? { Accept: opts.accept } : {}),
        ...(opts.headers ?? {}),
      },
      signal: opts.signal,
    });
  }

  private async readSapError(response: Response): Promise<string> {
    try {
      const text = await response.text();
      const match = text.match(/"message"\s*:\s*\{[^}]*"value"\s*:\s*"([^"]+)"/);
      return match ? match[1] : text.slice(0, 500);
    } catch {
      return `HTTP ${response.status}`;
    }
  }

  // ==================== MASTER DATA (read) ====================

  async fetchMaterialMaster(since?: string): Promise<MaterialMaster[]> {
    return this.withRetry(async () => {
      const extra = this.extraExpands('material');
      const params = [`$expand=to_Description${extra ? `,${extra}` : ''}`];
      if (since) {
        params.push(`$filter=${encodeURIComponent(`LastChangeDateTime ge datetimeoffset'${since}'`)}`);
      }
      const rows = await this.fetchAll<any>(
        `${SVC_PRODUCT}/A_Product?${params.join('&')}`,
        'fetchMaterialMaster',
      );
      return rows.map((mat) => this.mapSAPMaterialToStandard(mat));
    }, 'fetchMaterialMaster');
  }

  /**
   * Maps the released product header plus any release-specific fields the
   * customer has declared in erp_configurations.metadata.sap_field_map.material.
   * Navigation names are never guessed: an undeclared field stays undefined.
   */
  private mapSAPMaterialToStandard(sapMat: any): MaterialMaster {
    const description = sapMat.to_Description?.results?.[0] ?? {};
    const fieldMap = ((this.config.metadata as any)?.sap_field_map?.material ?? {}) as Record<string, string>;

    const pick = (field: string, ...defaults: string[]): unknown => {
      const candidates = [fieldMap[field], ...defaults].filter(Boolean) as string[];
      for (const key of candidates) {
        const value = firstDefined(sapMat[key], description[key]);
        if (value !== undefined) return value;
      }
      return undefined;
    };
    const optionalNumber = (field: string, ...defaults: string[]): number | undefined => {
      const raw = pick(field, ...defaults);
      if (raw === undefined) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const vendorAccounts = (sapMat.to_Supplier?.results ?? []).map((v: any) => ({
      vendor_code: v.Supplier ?? '',
      vendor_name: v.SupplierName ?? v.Supplier ?? '',
      currency: v.Currency ?? this.rawDefaults().currencyCode ?? 'EUR',
      min_order_qty: 0,
      rounding_value: 0,
      is_primary: false,
    }));

    return {
      sku: sapMat.Product,
      erp_material_number: sapMat.Product,
      description: description.ProductDescription || '',
      material_group: sapMat.ProductGroup || '',
      base_uom: sapMat.BaseUnit || '',
      sales_uom: String(pick('sales_uom', 'SalesUnit') ?? sapMat.BaseUnit ?? ''),
      ean_gtin: pick('ean_gtin', 'EAN', 'GTIN') as string | undefined,
      is_active: sapMat.IsMarkedForDeletion !== 'X',
      vendor_accounts: vendorAccounts,
      shelf_life_days: optionalNumber('shelf_life_days', 'ShelfLife', 'MinimumShelfLife'),
      rounding_value: optionalNumber('rounding_value', 'RoundingValue', 'BaseQuantity'),
      min_order_qty: optionalNumber('min_order_qty', 'MinOrderQuantity', 'MinimumOrderQuantity'),
      standard_price: optionalNumber('standard_price', 'StandardPrice', 'MovingAveragePrice'),
    };
  }

  async fetchStockBaselines(store_id: string): Promise<StockBaseline[]> {
    return this.withRetry(async () => {
      const plant = await this.resolvePlant(store_id);
      // InventoryStockType (NSDM_LBBSA) values used here:
      //   01 Unrestricted-Use   02 Stock in Quality Inspection
      //   03 Returns            06 Stock in Transit
      //   07 Blocked Stock      08 Restricted-Use   10 GR Blocked Stock
      // The quantities live on the navigation property, so it must be expanded.
      const filter = encodeURIComponent(`Plant eq '${plant}'`);
      const rows = await this.fetchAll<any>(
        `${SVC_MATERIAL_STOCK}/A_MaterialStock?$filter=${filter}&$expand=to_MatlStkInAcctMod`,
        'fetchStockBaselines',
      );

      return rows.map((stock: any) => {
        const stockType = stock.InventoryStockType ?? '01';
        const qty = this.readStockQuantity(stock.to_MatlStkInAcctMod);
        return {
          sku: stock.Material,
          store_id,
          erp_plant: stock.Plant,
          erp_storage_location: stock.StorageLocation || this.rawDefaults().defaultStorageLocation || '0001',
          // One row per stock type. Callers sum the category they care about.
          quantity_unrestricted: stockType === '01' ? qty : 0,
          quantity_in_quality_inspection: stockType === '02' ? qty : 0,
          quantity_blocked: stockType === '07' || stockType === '10' ? qty : 0,
          quantity_in_transit: stockType === '06' ? qty : 0,
          // ATP is unrestricted-use stock only; QI/blocked/returns are not
          // available to promise without an explicit release.
          atp_quantity: stockType === '01' ? qty : 0,
          last_updated: new Date().toISOString(),
          stock_type: stockType,
        };
      });
    }, 'fetchStockBaselines');
  }

  private readStockQuantity(stock: any): number {
    const nav = stock.to_MatlStkInAcctMod;
    const rows = Array.isArray(nav?.results) ? nav.results : nav ? [nav] : [];
    return rows.reduce(
      (sum: number, row: any) => sum + (parseFloat(row?.MatlWrhsStkQtyInMatlBaseUnit ?? '0') || 0),
      0,
    );
  }

  async fetchVendors(): Promise<VendorInfo[]> {
    return this.withRetry(async () => {
      const extra = this.extraExpands('vendor');
      const rows = await this.fetchAll<any>(
        `${SVC_BUSINESS_PARTNER}/A_Supplier${extra ? `?$expand=${extra}` : ''}`,
        'fetchVendors',
      );
      const fieldMap = ((this.config.metadata as any)?.sap_field_map?.vendor ?? {}) as Record<string, string>;

      return rows.map((bp: any) => {
        const pick = (field: string, ...defaults: string[]): unknown => {
          for (const key of [fieldMap[field], ...defaults].filter(Boolean) as string[]) {
            const value = firstDefined(bp[key]);
            if (value !== undefined) return value;
          }
          return undefined;
        };
        const number = (field: string, ...defaults: string[]): number | undefined => {
          const raw = pick(field, ...defaults);
          const parsed = raw === undefined ? NaN : Number(raw);
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        return {
          vendor_code: bp.Supplier,
          // A_Supplier carries SupplierName. If it is empty, use the number
          // rather than inventing a name.
          vendor_name: bp.SupplierName || bp.Supplier,
          currency: String(pick('currency', 'Currency') ?? this.rawDefaults().currencyCode ?? 'EUR'),
          // MOQ, rounding and contract price live on the purchasing info
          // record. They are read only when the customer declares the field
          // mapping; otherwise 0 means "no constraint captured here".
          min_order_qty: number('min_order_qty', 'MinimumOrderQuantity', 'MinOrderQty') ?? 0,
          rounding_value: number('rounding_value', 'RoundingValue') ?? 0,
          contract_net_price: number('contract_net_price', 'NetPriceAmount', 'ContractNetPrice'),
          is_primary: false,
        };
      });
    }, 'fetchVendors');
  }

  // ==================== INVENTORY MOVEMENTS ====================

  /**
   * Posts each movement as its own material document inside a single OData
   * $batch, one changeset per document so a rejection cannot roll back its
   * neighbours.
   *
   * Note for anyone reading the licensing story: $batch is HTTP transport
   * packaging only. Each contained POST still creates a separate material
   * document, and Digital Access is measured per created document line item.
   */
  async postInventoryMovements(movements: InventoryMovement[]): Promise<BatchResult<InventoryMovement>> {
    if (movements.length === 0) return this.createBatchResult(movements, []);

    const slots: MovementOutcome[] = new Array(movements.length);
    const postable: Array<{
      index: number;
      movement: InventoryMovement;
      goodsMovementCode: string;
      goodsMovementType: string;
    }> = [];

    movements.forEach((movement, index) => {
      const resolved = this.resolveMovement(movement);
      if (resolved.ok) {
        postable.push({
          index,
          movement,
          goodsMovementCode: resolved.goodsMovementCode,
          goodsMovementType: resolved.goodsMovementType,
        });
      } else {
        slots[index] = { success: false, error: `[UNSUPPORTED_MOVEMENT] ${resolved.reason}` };
      }
    });

    if (postable.length > 0) {
      const outcomes = await this.sendMaterialDocumentBatch(postable);
      postable.forEach((entry, i) => { slots[entry.index] = outcomes[i]; });
    }

    return this.createBatchResult(movements, slots);
  }

  /**
   * Maps a domain movement onto a SAP movement type + GoodsMovementCode pair.
   *
   * Everything that cannot be mapped without inventing missing business data is
   * rejected. A rejected movement is visible and fixable; a wrongly posted one
   * silently corrupts the stock ledger and cannot be detected later.
   */
  private resolveMovement(movement: InventoryMovement): MovementResolution {
    // Explicit override: the caller may supply either half. The missing half is
    // inferred from the default mapping for this movement type. The adapter
    // still refuses to invent a pairing it cannot derive.
    if (movement.sap_movement_type || movement.sap_goods_movement_code) {
      const defaultMapping = defaultMovementMapping(movement.movement_type);
      const movementType = movement.sap_movement_type ?? defaultMapping?.goodsMovementType;
      const goodsMovementCode = movement.sap_goods_movement_code ?? defaultMapping?.goodsMovementCode;

      if (!movementType) {
        return {
          ok: false,
          reason: `Cannot infer SAP movement type for '${movement.movement_type}'. Supply sap_movement_type or use a movement type with a default mapping.`,
        };
      }
      if (!goodsMovementCode) {
        return {
          ok: false,
          reason: `Cannot infer SAP goods movement code for '${movement.movement_type}'. Supply sap_goods_movement_code or use a movement type with a default mapping.`,
        };
      }
      if (!/^\d{3}$/.test(movementType)) {
        return { ok: false, reason: `'${movementType}' is not a 3-digit SAP movement type.` };
      }
      if (!/^0[1-7]$/.test(goodsMovementCode)) {
        return {
          ok: false,
          reason: `sap_goods_movement_code must be 01-07 (SAP KBA 3333223); received '${goodsMovementCode}'.`,
        };
      }
      return {
        ok: true,
        goodsMovementCode,
        goodsMovementType: movementType,
      };
    }

    switch (movement.movement_type) {
      case 'DAMAGE':
        // 551 = withdrawal for scrapping from unrestricted-use stock.
        // Posted as a goods issue -> GoodsMovementCode 03.
        return { ok: true, goodsMovementCode: '03', goodsMovementType: '551' };

      case 'GOODS_RECEIPT':
        // 501 = goods receipt without purchase order (unrestricted use).
        // Posted as an "other" goods receipt -> GoodsMovementCode 05.
        return { ok: true, goodsMovementCode: '05', goodsMovementType: '501' };

      case 'TRANSFER_OUT':
        if (!movement.transfer_to_plant) {
          return {
            ok: false,
            reason: 'TRANSFER_OUT requires transfer_to_plant: SAP 301 is a one-step plant-to-plant transfer and the receiving plant is mandatory. Supply sap_movement_type=303 + sap_goods_movement_code=04 for a two-step transfer instead.',
          };
        }
        return { ok: true, goodsMovementCode: '04', goodsMovementType: '301' };

      case 'TRANSFER_IN':
        return {
          ok: false,
          reason: 'TRANSFER_IN must not be posted on its own: movement type 301 already both issues and receives. Post the paired TRANSFER_OUT, or use 303 (issue) and 305 (receipt) as an explicit override.',
        };

      case 'SALE':
        return {
          ok: false,
          reason: 'A retail sale is not a goods issue against a cost centre. Post it through a sales document / delivery (goods issue for delivery, 601) or the SAP POS integration; posting 201 here would misstate cost of goods sold.',
        };

      case 'GOODS_ISSUE':
        return {
          ok: false,
          reason: 'GOODS_ISSUE needs a business destination. 201 requires a cost centre or order account assignment, which this payload does not carry. Use DAMAGE (551) for write-off, or supply an explicit sap_movement_type/sap_goods_movement_code pair.',
        };

      case 'ADJUSTMENT':
        return {
          ok: false,
          reason: 'A stock adjustment without a business process is a physical-inventory difference (701/702). Post it via API_PHYSICAL_INVENTORY_DOC_SRV, or supply an explicit sap_movement_type/sap_goods_movement_code pair plus account assignment.',
        };

      case 'COUNT':
        return {
          ok: false,
          reason: 'Movement type 701 is not accepted by API_MATERIAL_DOCUMENT_SRV (SAP KBA 2689573, error M7/096). Use API_PHYSICAL_INVENTORY_DOC_SRV for count differences.',
        };

      default:
        return { ok: false, reason: `Unmapped movement type '${movement.movement_type}'.` };
    }
  }

  private buildMaterialDocumentPayload(
    movement: InventoryMovement,
    goodsMovementCode: string,
    goodsMovementType: string,
    plant: string,
  ): Record<string, unknown> {
    const item: Record<string, string> = {
      Material: movement.sku,
      Plant: plant,
      StorageLocation: movement.storage_location || this.rawDefaults().defaultStorageLocation || '0001',
      // 551 / 501 / 301 all read the quantity out of unrestricted-use stock.
      GoodsMovementType: goodsMovementType,
      EntryUnit: movement.uom,
      QuantityInEntryUnit: Math.abs(movement.quantity).toString(),
    };

    if (movement.batch) item.Batch = movement.batch;
    if (movement.sap_reason_code) item.GoodsMovementReasonCode = movement.sap_reason_code;
    if (goodsMovementType === '301') {
      item.IssuingOrReceivingPlant = movement.transfer_to_plant!;
      if (movement.transfer_to_storage_location) {
        item.IssuingOrReceivingStorageLoc = movement.transfer_to_storage_location;
      }
    }

    // A deterministic reference is what makes OUTCOME_UNKNOWN resolvable:
    // getPostingStatus() recomputes the identical BKTXT and looks up the SAP
    // document instead of forcing a blind (and separately metered) retry.
    const headerText = this.postingReference(
      movement.external_reference ?? movement.reference_document ?? movement.movement_id,
    );

    return {
      PostingDate: toSapDate(movement.reference_date),
      DocumentDate: toSapDate(movement.reference_date),
      GoodsMovementCode: goodsMovementCode,
      // BKTXT is 25 characters; the helper never exceeds it.
      MaterialDocumentHeaderText: headerText,
      to_MaterialDocumentItem: [item],
    };
  }

  private async sendMaterialDocumentBatch(
    entries: Array<{ movement: InventoryMovement; goodsMovementCode: string; goodsMovementType: string }>,
  ): Promise<MovementOutcome[]> {
    const plantCache = new Map<string, string>();
    for (const entry of entries) {
      if (!plantCache.has(entry.movement.store_id)) {
        plantCache.set(entry.movement.store_id, await this.resolvePlant(entry.movement.store_id));
      }
    }

    const batchBoundary = newBoundary('batch');
    const changesetBoundary = newBoundary('changeset');
    const encoder = new TextEncoder();

    let body = '';
    for (const entry of entries) {
      const payload = this.buildMaterialDocumentPayload(
        entry.movement,
        entry.goodsMovementCode,
        entry.goodsMovementType,
        plantCache.get(entry.movement.store_id)!,
      );
      const json = JSON.stringify(payload);

      body += `--${batchBoundary}${CRLF}`;
      body += `Content-Type: multipart/mixed; boundary=${changesetBoundary}${CRLF}${CRLF}`;
      body += `--${changesetBoundary}${CRLF}`;
      body += `Content-Type: application/http${CRLF}`;
      body += `Content-Transfer-Encoding: binary${CRLF}${CRLF}`;
      body += `POST ${SVC_MATERIAL_DOCUMENT}/${ENTITY_MATERIAL_DOCUMENT} HTTP/1.1${CRLF}`;
      body += `Content-Type: application/json${CRLF}`;
      body += `Content-Length: ${encoder.encode(json).length}${CRLF}${CRLF}`;
      body += `${json}${CRLF}`;
      body += `--${changesetBoundary}--${CRLF}`;
    }
    body += `--${batchBoundary}--${CRLF}`;

    if (this.isCircuitOpen()) {
      throw new NonRetryableError(`Circuit breaker is OPEN for ${this.config.erp_type}`);
    }

    let response: Response;
    try {
      response = await this.sapRequest(
        `${SVC_MATERIAL_DOCUMENT}/$batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/mixed; boundary=${batchBoundary}` },
          body,
        },
        { write: true },
      );
    } catch (err) {
      // The request left this process; SAP may have committed it.
      this.recordFailure();
      throw new OutcomeUnknownError(
        `SAP material document $batch did not return a response: ${(err as Error).message}. ` +
        `The commit state is unknown; do not retry blindly.`,
        err,
      );
    }

    if (!response.ok) {
      const detail = await this.readSapError(response);
      this.recordFailure();
      if (response.status >= 500) {
        throw new OutcomeUnknownError(
          `SAP material document $batch failed with HTTP ${response.status}: ${detail}. Commit state unknown.`,
        );
      }
      throw new NonRetryableError(`SAP material document $batch rejected (HTTP ${response.status}): ${detail}`);
    }

    this.recordSuccess();
    return this.parseMaterialDocumentBatch(entries.length, await response.text(), batchBoundary);
  }

  private parseMaterialDocumentBatch(
    expected: number,
    responseText: string,
    batchBoundary: string,
  ): MovementOutcome[] {
    const chunks = responseText.split(`--${batchBoundary}`);
    const outcomes: MovementOutcome[] = [];

    for (const chunk of chunks) {
      const statusMatch = chunk.match(/HTTP\/1\.1\s+(\d{3})/);
      if (!statusMatch) continue;

      const status = Number(statusMatch[1]);
      const isSuccess = status >= 200 && status < 300;

      if (!isSuccess) {
        const message = chunk.match(/"message"\s*:\s*\{[^}]*"value"\s*:\s*"([^"]+)"/);
        outcomes.push({
          success: false,
          error: message ? message[1] : `SAP returned HTTP ${status}`,
        });
        continue;
      }

      const doc = chunk.match(/"MaterialDocument"\s*:\s*"(\d+)"/);
      const year = chunk.match(/"MaterialDocumentYear"\s*:\s*"(\d+)"/);
      if (!doc) {
        // A 2xx without a document key means the sub-response could not be
        // attributed. Never invent an identifier.
        outcomes.push({
          success: false,
          error: 'SAP returned success but no MaterialDocument key; document number is unknown.',
        });
        continue;
      }

      outcomes.push({ success: true, erp_doc: doc[1], erp_doc_year: year ? year[1] : undefined });
    }

    // Positional mapping is only safe when the counts line up. If they do not,
    // guessing would attach the wrong SAP document number to the wrong stock
    // movement, so the whole batch becomes outcome-unknown.
    if (outcomes.length !== expected) {
      throw new OutcomeUnknownError(
        `SAP $batch returned ${outcomes.length} sub-responses for ${expected} documents. ` +
        `Per-movement commit state cannot be determined; do not retry blindly.`,
      );
    }

    return outcomes;
  }

  // ==================== PROCUREMENT ====================

  private defaults(): SapDefaults & { currencyCode: string } {
    const sap = this.rawDefaults();

    const missing: string[] = [];
    if (!sap.companyCode) missing.push('companyCode');
    if (!sap.purchasingGroup) missing.push('purchasingGroup');

    if (missing.length > 0) {
      throw new SapConfigurationError(
        `SAP master data is not configured: erp_configurations.metadata.sap_defaults is missing ${missing.join(', ')}. ` +
        `These values are customer-specific and are never defaulted by the platform.`,
      );
    }

    return {
      companyCode: sap.companyCode!,
      purchasingOrganization: sap.purchasingOrganization,
      purchasingGroup: sap.purchasingGroup!,
      defaultStorageLocation: sap.defaultStorageLocation || '0001',
      currencyCode: sap.currencyCode || 'EUR',
    };
  }

  /** Never throws: safe for read paths and optional fields. */
  private rawDefaults(): Partial<SapDefaults> & { currencyCode?: string } {
    const metadata = (this.config.metadata ?? {}) as Record<string, any>;
    const sap = (metadata.sap_defaults ?? {}) as Partial<SapDefaults> & { currencyCode?: string };

    // erp_configurations carries the org units as first-class columns; honour
    // them before declaring the configuration incomplete.
    return {
      ...sap,
      companyCode: sap.companyCode ?? this.config.company_code,
      purchasingOrganization: sap.purchasingOrganization ?? this.config.purchasing_org,
      purchasingGroup: sap.purchasingGroup ?? this.config.purchasing_group,
    };
  }

  private buildPurchaseRequisitionPayload(item: {
    material: string;
    plant: string;
    quantity: number;
    uom: string;
    estimatedPrice?: number;
    reference?: string;
  }): Record<string, unknown> {
    const d = this.defaults();

    const requisitionItem: Record<string, unknown> = {
      PurchaseRequisitionItem: '10',
      PurchaseRequisitionItemText: item.material.slice(0, 40),
      Material: item.material,
      Plant: item.plant,
      CompanyCode: d.companyCode,
      PurchasingGroup: d.purchasingGroup,
      RequestedQuantity: item.quantity.toString(),
      BaseUnit: item.uom,
      // A missing estimated price is omitted rather than sent as 0. A zero
      // price is a real commercial statement and would misstate the requisition
      // value in every downstream approval report.
      to_PurchaseReqnAcctAssgmt: { results: [] },
      to_PurchaseReqnDeliveryAddress: {},
      to_PurchaseReqnItemText: { results: [] },
    };

    if (typeof item.estimatedPrice === 'number' && Number.isFinite(item.estimatedPrice)) {
      requisitionItem.PurchaseRequisitionPrice = item.estimatedPrice.toString();
      requisitionItem.PurReqnPriceQuantity = '1';
    }

    return {
      PurchaseRequisition: '',
      PurchaseRequisitionType: 'NB',
      PurReqnDescription: (item.reference || 'SmartStock replenishment').slice(0, 40),
      SourceDetermination: false,
      PurReqnDoOnlyValidation: false,
      to_PurchaseReqnItem: { results: [requisitionItem] },
    };
  }

  async postPurchaseRequisition(
    pr: PurchaseRequisition,
  ): Promise<{ success: boolean; erp_pr_number?: string; errors?: string[] }> {
    const items = pr.items ?? [];
    if (items.length === 0) {
      return { success: false, errors: ['Purchase requisition contains no items.'] };
    }
    if (items.length > 1) {
      // The released API creates one PR per request; multi-item PRs need a
      // single header payload with several to_PurchaseReqnItem entries, which
      // is handled by executeBatchPR. Fail loudly instead of silently dropping
      // all but the first item.
      return {
        success: false,
        errors: ['postPurchaseRequisition accepts a single-item requisition. Use executeBatchPR for multi-item requisitions.'],
      };
    }

    const item = items[0];
    if (!item.plant) {
      return { success: false, errors: ['A SAP plant is required to create a purchase requisition.'] };
    }
    const plant = await this.resolvePlant(item.plant);

    try {
      const payload = this.buildPurchaseRequisitionPayload({
        material: item.sku,
        plant,
        quantity: item.quantity_approved ?? item.quantity_requested,
        uom: item.uom,
        estimatedPrice: item.estimated_unit_price ?? undefined,
        reference: pr.pr_id,
      });

      const response = await this.sapRequest(
        `${SVC_PURCHASE_REQ}/${ENTITY_PURCHASE_REQ}`,
        { method: 'POST', body: JSON.stringify(payload) },
        { write: true },
      );

      if (!response.ok) {
        const detail = await this.readSapError(response);
        return { success: false, errors: [`SAP PR creation failed (HTTP ${response.status}): ${detail}`] };
      }

      const data = await response.json();
      const number = data?.d?.PurchaseRequisition;
      if (!number) {
        return { success: false, errors: ['SAP accepted the requisition but returned no PurchaseRequisition number.'] };
      }
      return { success: true, erp_pr_number: number };
    } catch (err) {
      // A transport failure after the POST was sent means SAP may have created
      // the PR. Returning success:false would invite a duplicate submission.
      if (isTransportFailure(err)) {
        throw new OutcomeUnknownError(
          `SAP PR write produced no definitive response: ${(err as Error).message}. ` +
          `Resolve with getPostingStatus() before any retry.`,
          err,
        );
      }
      if (!isNonRetryable(err)) throw err;
      return { success: false, errors: [(err as Error).message] };
    }
  }

  async executeBatchPR(items: Array<{
    stagedPrId: string;
    material: string;
    plant: string;
    storageLocation?: string;
    quantity: number;
    uom: string;
    vendor?: string;
    deliveryDate?: string;
    estimatedPrice?: number;
  }>): Promise<BatchResult<any>> {
    if (items.length === 0) return this.createBatchResult(items, []);

    const batchBoundary = newBoundary('batch');
    const changesetBoundary = newBoundary('changeset');
    const encoder = new TextEncoder();

    let body = '';
    for (const item of items) {
      const payload = this.buildPurchaseRequisitionPayload({
        material: item.material,
        plant: item.plant,
        quantity: item.quantity,
        uom: item.uom,
        estimatedPrice: item.estimatedPrice,
        reference: item.stagedPrId,
      });
      const json = JSON.stringify(payload);

      body += `--${batchBoundary}${CRLF}`;
      body += `Content-Type: multipart/mixed; boundary=${changesetBoundary}${CRLF}${CRLF}`;
      body += `--${changesetBoundary}${CRLF}`;
      body += `Content-Type: application/http${CRLF}`;
      body += `Content-Transfer-Encoding: binary${CRLF}${CRLF}`;
      body += `POST ${SVC_PURCHASE_REQ}/${ENTITY_PURCHASE_REQ} HTTP/1.1${CRLF}`;
      body += `Content-Type: application/json${CRLF}`;
      body += `Content-Length: ${encoder.encode(json).length}${CRLF}${CRLF}`;
      body += `${json}${CRLF}`;
      body += `--${changesetBoundary}--${CRLF}`;
    }
    body += `--${batchBoundary}--${CRLF}`;

    // Writes are never retried here: a retry can create a second metered
    // document. The circuit breaker only prevents sending a batch into a SAP
    // system that has already failed repeatedly on reads.
    if (this.isCircuitOpen()) {
      throw new NonRetryableError(`Circuit breaker is OPEN for ${this.config.erp_type}`);
    }

    let response: Response;
    try {
      response = await this.sapRequest(
        `${SVC_PURCHASE_REQ}/$batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/mixed; boundary=${batchBoundary}` },
          body,
        },
        { write: true },
      );
    } catch (err) {
      this.recordFailure();
      if (isTransportFailure(err)) {
        throw new OutcomeUnknownError(
          `SAP PR $batch produced no definitive response: ${(err as Error).message}. Commit state unknown.`,
          err,
        );
      }
      throw err;
    }

    if (!response.ok) {
      this.recordFailure();
      const detail = await this.readSapError(response);
      if (response.status >= 500) {
        throw new OutcomeUnknownError(`SAP PR $batch failed with HTTP ${response.status}: ${detail}`);
      }
      throw new NonRetryableError(`SAP PR $batch rejected (HTTP ${response.status}): ${detail}`);
    }
    this.recordSuccess();

    const chunks = (await response.text()).split(`--${batchBoundary}`);
    const results: Array<{ success: boolean; erp_doc?: string; error?: string }> = [];

    for (const chunk of chunks) {
      const statusMatch = chunk.match(/HTTP\/1\.1\s+(\d{3})/);
      if (!statusMatch) continue;
      const status = Number(statusMatch[1]);
      const ok = status >= 200 && status < 300;
      if (!ok) {
        const message = chunk.match(/"message"\s*:\s*\{[^}]*"value"\s*:\s*"([^"]+)"/);
        results.push({ success: false, error: message ? message[1] : `SAP returned HTTP ${status}` });
        continue;
      }
      const doc = chunk.match(/"PurchaseRequisition"\s*:\s*"(\d+)"/);
      results.push(
        doc
          ? { success: true, erp_doc: doc[1] }
          : { success: false, error: 'SAP accepted the requisition but returned no PurchaseRequisition number.' },
      );
    }

    if (results.length !== items.length) {
      throw new OutcomeUnknownError(
        `SAP PR $batch returned ${results.length} sub-responses for ${items.length} requisitions.`,
      );
    }

    return this.createBatchResult(items, results);
  }

  async postPurchaseOrder(po: PurchaseOrder): Promise<{ success: boolean; erp_po_number?: string; errors?: string[] }> {
    if (po.po_type === 'UB') {
      // Stock transport orders are not creatable through
      // API_PURCHASEORDER_PROCESS_SRV in every release. SAP shipped the
      // dedicated API_STOCKTRANSPORTORDER (OData V4) with S/4HANA Cloud Public
      // Edition 2602. Refuse rather than creating a normal PO that looks like
      // an STO but moves no stock.
      return {
        success: false,
        errors: [
          'Stock transport orders (UB) are not supported by this adapter. ' +
          'Use API_STOCKTRANSPORTORDER (S/4HANA Cloud Public Edition 2602+) or the ' +
          'customer-specific STO process; a plain PO must not be substituted.',
        ],
      };
    }

    const d = this.defaults();
    const items = po.items ?? [];
    if (items.length === 0) return { success: false, errors: ['Purchase order contains no items.'] };

    if (!d.purchasingOrganization) {
      return {
        success: false,
        errors: [
          'SAP purchasing organisation is not configured: set erp_configurations.purchasing_org (or metadata.sap_defaults.purchasingOrganization). ' +
          'It is not derived from the company code.',
        ],
      };
    }

    const missingPlant = items.filter((i) => !i.plant);
    if (missingPlant.length > 0) {
      return { success: false, errors: ['Every purchase order item requires a SAP plant.'] };
    }

    const payload = {
      CompanyCode: d.companyCode,
      PurchaseOrderType: po.po_type ?? 'NB',
      Supplier: po.vendor_code,
      DocumentCurrency: po.currency || d.currencyCode,
      PurchasingOrganization: d.purchasingOrganization,
      PurchasingGroup: d.purchasingGroup,
      to_PurchaseOrderItem: items.map((item, idx) => ({
        PurchaseOrderItem: ((idx + 1) * 10).toString().padStart(5, '0'),
        PurchaseOrderItemText: item.sku.slice(0, 40),
        Material: item.sku,
        Plant: item.plant,
        OrderQuantity: item.quantity_ordered.toString(),
        PurchaseOrderQuantityUnit: item.uom,
        NetPriceAmount: item.net_price.toString(),
        NetPriceQuantity: '1',
      })),
    };

    try {
      const response = await this.sapRequest(
        `${SVC_PURCHASE_ORDER}/${ENTITY_PURCHASE_ORDER}`,
        { method: 'POST', body: JSON.stringify(payload) },
        { write: true },
      );

      if (!response.ok) {
        const detail = await this.readSapError(response);
        return { success: false, errors: [`SAP PO creation failed (HTTP ${response.status}): ${detail}`] };
      }

      const data = await response.json();
      const number = data?.d?.PurchaseOrder;
      if (!number) {
        return { success: false, errors: ['SAP accepted the purchase order but returned no PurchaseOrder number.'] };
      }
      return { success: true, erp_po_number: number };
    } catch (err) {
      if (isTransportFailure(err)) {
        throw new OutcomeUnknownError(
          `SAP PO write produced no definitive response: ${(err as Error).message}. ` +
          `Resolve with getPostingStatus() before any retry; a duplicate PO is a second commercial commitment.`,
          err,
        );
      }
      if (!isNonRetryable(err)) throw err;
      return { success: false, errors: [(err as Error).message] };
    }
  }

  async postEmergencyPO(po: PurchaseOrder): Promise<{ success: boolean; erp_po_number?: string; errors?: string[] }> {
    return this.postPurchaseOrder(po);
  }

  // ==================== ATP & RECONCILIATION ====================

  async checkATP(
    sku: string,
    store_id: string,
    requested_qty: number,
  ): Promise<{ available: boolean; atp_qty: number; delivery_date?: string }> {
    return this.withRetry(async () => {
      const plant = await this.resolvePlant(store_id);
      // Uses $filter rather than a key predicate: the A_MaterialStock key
      // includes stock-type and special-stock dimensions whose values would
      // otherwise have to be guessed.
      const response = await this.sapRequest(
        `${SVC_MATERIAL_STOCK}/A_MaterialStock` +
        `?$filter=${encodeURIComponent(`Material eq '${sku}' and Plant eq '${plant}' and InventoryStockType eq '01'`)}` +
        `&$expand=to_MatlStkInAcctMod`,
      );

      if (!response.ok) throw new Error(`ATP check failed: ${response.status}`);
      const data = await response.json();
      const rows = data.d?.results ?? [];
      const atpQty = rows.reduce((sum: number, row: any) => sum + this.readStockQuantity(row), 0);

      return { available: atpQty >= requested_qty, atp_qty: atpQty };
    }, 'checkATP');
  }

  /**
   * Returns the SAP side of a reconciliation.
   *
   * The adapter owns no database client and must stay stateless: it reports
   * what SAP says. The caller (erp-reconciliation) joins this with the local
   * `inventory_position` read-model and computes the variance. Returning a
   * fabricated local_total here would hide real discrepancies.
   */
  async reconcileStock(store_id: string, sku?: string): Promise<ReconciliationResult> {
    const sapStock = await this.fetchStockBaselines(store_id);
    const rows = sku ? sapStock.filter((s) => s.sku === sku) : sapStock;
    const erpTotal = rows.reduce((sum, s) => sum + (s.quantity_unrestricted ?? 0), 0);

    return {
      store_id,
      sku,
      erp_total: erpTotal,
      // Local twin is supplied by the caller; the adapter never invents it.
      local_total: 0,
      variance: 0,
      variance_percentage: 0,
      last_common_transaction: new Date().toISOString(),
      // Per-SKU ERP truth. The caller fills local_qty and recomputes diff from
      // its own inventory_position read-model.
      discrepancies: rows.map((r) => ({
        sku: r.sku,
        erp_qty: r.quantity_unrestricted ?? 0,
        local_qty: 0,
        diff: 0,
      })),
    };
  }

  // ==================== GOODS RECEIPT FETCH ====================

  async fetchGoodsReceipts(since?: string): Promise<GoodsReceipt[]> {
    return this.withRetry(async () => {
      const params = ['$expand=to_MaterialDocumentItem'];
      if (since) params.push(`$filter=${encodeURIComponent(`PostingDate ge datetime'${since}'`)}`);
      const headers = await this.fetchAll<any>(
        `${SVC_MATERIAL_DOCUMENT}/${ENTITY_MATERIAL_DOCUMENT}?${params.join('&')}`,
        'fetchGoodsReceipts',
      );

      return headers.flatMap((header: any) =>
        (header.to_MaterialDocumentItem?.results ?? []).map((item: any) => ({
          gr_id: `${header.MaterialDocument}/${header.MaterialDocumentYear}/${item.MaterialDocumentItem}`,
          erp_gr_number: header.MaterialDocument,
          erp_gr_year: header.MaterialDocumentYear,
          erp_po_number: item.PurchaseOrder,
          erp_po_item: item.PurchaseOrderItem,
          sku: item.Material,
          store_id: item.Plant,
          erp_plant: item.Plant,
          erp_storage_location: item.StorageLocation,
          quantity_received: parseFloat(item.QuantityInEntryUnit || 0),
          uom: item.EntryUnit,
          batch_number: item.Batch,
          posted_at: header.PostingDate,
        }))
      );
    }, 'fetchGoodsReceipts');
  }

  async fetchPurchaseOrders(filters?: POFilter): Promise<PurchaseOrder[]> {
    return this.withRetry(async () => {
      const clauses: string[] = [];
      if (filters?.vendor_code) {
        clauses.push(`Supplier eq '${filters.vendor_code.replace(/'/g, "''")}'`);
      }
      if (filters?.since) {
        clauses.push(`CreationDate ge datetimeoffset'${filters.since}'`);
      }
      const extra = this.extraExpands('purchaseOrder');
      const params = [`$expand=${['to_PurchaseOrderItem', extra].filter(Boolean).join(',')}`];
      if (clauses.length) params.push(`$filter=${encodeURIComponent(clauses.join(' and '))}`);

      let rows: any[];
      try {
        rows = await this.fetchAll<any>(
          `${SVC_PURCHASE_ORDER}/${ENTITY_PURCHASE_ORDER}?${params.join('&')}`,
          'fetchPurchaseOrders',
        );
      } catch (err) {
        // Some releases cannot filter on CreationDate/Supplier at the header.
        // Fall back to a full read and filter in memory rather than returning [].
        if (!clauses.length || !/HTTP 400/.test((err as Error).message)) throw err;
        rows = await this.fetchAll<any>(
          `${SVC_PURCHASE_ORDER}/${ENTITY_PURCHASE_ORDER}?$expand=${['to_PurchaseOrderItem', extra].filter(Boolean).join(',')}`,
          'fetchPurchaseOrders',
        );
      }
      const plant = filters?.store_id ? await this.resolvePlant(filters.store_id) : undefined;

      const orders = rows.map((po: any): PurchaseOrder => {
        const items: POItem[] = (po.to_PurchaseOrderItem?.results ?? []).map((item: any, idx: number) => ({
          item_id: item.PurchaseOrderItem ?? String((idx + 1) * 10),
          sku: item.Material ?? '',
          quantity_ordered: asNumber(item.OrderQuantity),
          quantity_delivered: asNumber(item.DeliveredQuantity ?? item.QuantityDelivered),
          quantity_invoiced: asNumber(item.InvoicedQuantity ?? item.QuantityInvoiced),
          uom: item.PurchaseOrderQuantityUnit ?? item.BaseUnit ?? '',
          net_price: asNumber(item.NetPriceAmount),
          delivery_date: item.DeliveryDate ?? '',
          plant: item.Plant,
        }));

        const cancelled = po.IsCanceled === true || po.IsCanceled === 'X';
        let status: PurchaseOrder['status'] = 'OPEN';
        if (cancelled) status = 'CANCELLED';
        else if (items.length && items.every((i) => i.quantity_ordered > 0 && i.quantity_invoiced >= i.quantity_ordered)) status = 'INVOICED';
        else if (items.length && items.every((i) => i.quantity_ordered > 0 && i.quantity_delivered >= i.quantity_ordered)) status = 'DELIVERED';
        else if (items.some((i) => i.quantity_delivered > 0)) status = 'PARTIALLY_DELIVERED';

        const itemTotal = items.reduce((sum, i) => sum + i.quantity_ordered * i.net_price, 0);
        return {
          po_id: po.PurchaseOrder,
          erp_po_number: po.PurchaseOrder,
          vendor_code: po.Supplier ?? '',
          vendor_name: po.SupplierName ?? po.Supplier ?? '',
          items,
          total_value: asNumber(po.TotalNetAmount ?? po.NetAmount, itemTotal),
          currency: po.DocumentCurrency ?? this.rawDefaults().currencyCode ?? 'EUR',
          status,
          created_at: po.CreationDate ?? new Date().toISOString(),
          po_type: po.PurchaseOrderType === 'UB' ? 'UB' : 'NB',
        };
      });

      const scoped = plant ? orders.filter((o) => o.items.some((i) => i.plant === plant)) : orders;
      return scoped.filter((o) =>
        (!filters?.vendor_code || o.vendor_code === filters.vendor_code) &&
        (!filters?.since || new Date(o.created_at).getTime() >= new Date(filters.since).getTime()),
      );
    }, 'fetchPurchaseOrders');
  }

  // ==================== STATUS PROBE ====================

  /**
   * Resolves an OUTCOME_UNKNOWN posting by re-computing the deterministic BKTXT
   * that was written on the material document. NOT_FOUND means "SAP has no such
   * document"; FAILED means the probe itself could not be trusted — never treat
   * that as permission to retry the write.
   */
  override async getPostingStatus(reference: string): Promise<PostingStatusResult> {
    const bktxt = this.postingReference(reference);
    try {
      return await this.withRetry(async () => {
        const filter = encodeURIComponent(`MaterialDocumentHeaderText eq '${bktxt.replace(/'/g, "''")}'`);
        const url = `${SVC_MATERIAL_DOCUMENT}/${ENTITY_MATERIAL_DOCUMENT}` +
          `?$filter=${filter}&$select=MaterialDocument,MaterialDocumentYear,MaterialDocumentHeaderText`;
        const response = await this.sapRequest(this.withSapClient(url));

        let headers: any[];
        if (response.ok) {
          headers = (await response.json())?.d?.results ?? [];
        } else if (response.status === 400) {
          // Some Gateway releases do not allow $filter on BKTXT. Match locally
          // against recent documents instead of guessing a positive result.
          const recent = await this.fetchAll<any>(
            `${SVC_MATERIAL_DOCUMENT}/${ENTITY_MATERIAL_DOCUMENT}` +
            `?$orderby=${encodeURIComponent('PostingDate desc')}&$top=200`,
            'getPostingStatus',
          );
          headers = recent.filter((h: any) => h.MaterialDocumentHeaderText === bktxt);
        } else {
          throw new Error(`Posting status probe failed: HTTP ${response.status}`);
        }

        if (headers.length === 0) return { reference, found: false, status: 'NOT_FOUND' };
        if (headers.length > 1) {
          return {
            reference,
            found: true,
            status: 'FAILED',
            error_message: `${headers.length} material documents share reference '${bktxt}'; resolve manually.`,
          };
        }
        return {
          reference,
          found: true,
          erp_document_number: headers[0].MaterialDocument,
          status: 'CONFIRMED',
        };
      }, 'getPostingStatus');
    } catch (err) {
      return { reference, found: false, status: 'FAILED', error_message: (err as Error).message };
    }
  }

  /** Advertises exactly what this adapter can post, so callers can fail fast. */
  override async capabilities(): Promise<ERPCapabilities> {
    return {
      ...(await super.capabilities()),
      stockTransferCreate: true, // 301 with transfer_to_plant
      apiVersions: {
        OData: 'V2',
        materialDocument: SVC_MATERIAL_DOCUMENT,
        materialStock: SVC_MATERIAL_STOCK,
        purchaseRequisition: SVC_PURCHASE_REQ,
        purchaseOrder: SVC_PURCHASE_ORDER,
        product: SVC_PRODUCT,
        businessPartner: SVC_BUSINESS_PARTNER,
      },
      supportedMovementTypes: ['DAMAGE', 'GOODS_RECEIPT', 'TRANSFER_OUT'],
      unsupportedMovementGuidance: {
        SALE: 'Use a sales document/delivery (601) or the SAP POS integration.',
        GOODS_ISSUE: 'Supply an explicit account assignment, or use DAMAGE (551).',
        ADJUSTMENT: 'Use API_PHYSICAL_INVENTORY_DOC_SRV (701/702).',
        COUNT: 'Use API_PHYSICAL_INVENTORY_DOC_SRV (701/702).',
        TRANSFER_IN: 'Post the paired TRANSFER_OUT (301); a 301 both issues and receives.',
        UB: 'Use the stock-transport-order API available in your release, never a plain PO.',
      },
    };
  }

  // ==================== HELPERS ====================

  private async resolvePlant(store_id: string): Promise<string> {
    const metadata = (this.config.metadata ?? {}) as Record<string, any>;
    const map = (metadata.plant_map ?? {}) as Record<string, string>;

    // Priority 1: explicit plant map
    if (map[store_id]) return map[store_id];

    // Priority 2: fall back to store_id only if it looks like a plant ID
    // (3-digit numeric code). If store_id is alphanumeric or has prefixes,
    // treat it as a store reference and throw a clear error so the caller
    // cannot silently post to the wrong plant.
    const fallback = map['*'];
    if (fallback) return fallback;

    // Heuristic: 3-digit numeric = likely a plant ID; anything else = likely
    // a store code and should not be used as a plant without explicit mapping.
    if (/^\d{3}$/.test(store_id)) {
      console.warn(`[sap-adapter] No plant mapping for store_id '${store_id}'; using as plant fallback. ` +
        'Configure plant_map in erp_configurations.metadata for correct behavior.');
      return store_id;
    }

    throw new SapConfigurationError(
      `SAP plant not configured for store '${store_id}'. ` +
      'Add an entry to erp_configurations.metadata.plant_map keyed by store_id, ' +
      'or configure a wildcard plant_map["*"] for a default plant.',
    );
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; latency_ms: number }> {
    const start = Date.now();
    try {
      const response = await this.sapRequest(`${SVC_PRODUCT}/A_Product?$top=1`);
      const latency = Date.now() - start;

      if (response.ok) return { status: 'healthy', latency_ms: latency };
      if (response.status >= 500) return { status: 'degraded', latency_ms: latency };
      return { status: 'down', latency_ms: latency };
    } catch {
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }
}
