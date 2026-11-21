// /supabase/functions/_shared/erp-adapter/sap-adapter.ts
//
// SAP S/4HANA adapter — released OData V2 services only.
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
//   API_MATERIAL_DOCUMENT_SRV (KBA 2689573 / M7/096) — use
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
//
// imports remain unchanged...
import { BaseERPAdapter } from './base-adapter.ts';
import {
  ERPConfig, SAPAuthConfig, MaterialMaster, StockBaseline,
  InventoryMovement, PurchaseRequisition, PurchaseOrder, BatchResult,
  ReconciliationResult, GoodsReceipt, VendorInfo, POFilter, PostingStatusResult,
} from './types.ts';
import {
  NonRetryableError, OutcomeUnknownError, SapConfigurationError,
} from './errors.ts';

// ==================== SERVICE PATHS (verified) ====================

const SVC_MATERIAL_DOCUMENT = '/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV';
const SVC_MATERIAL_STOCK = '/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV';
const SVC_PURCHASE_ORDER = '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV';
const SVC_PURCHASE_REQ = '/sap/opu/odata/sap/API_PURCHASEREQ_PROCESS_SRV';
const SVC_PRODUCT = '/sap/opu/odata/sap/API_PRODUCT_SRV';
const SVC_BUSINESS_PARTNER = '/sap/opu/odata/sap/API_BUSINESS_PARTNER';

// Keep the verified entity names as module-level constants for reuse.
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

// ==================== DEFAULTS & MAPPING ====================

interface SapDefaults {
  companyCode: string;
  purchasingOrganization?: string;
  purchasingGroup: string;
  defaultStorageLocation: string;
}

// Default movement type + goods movement code mapping per SAP KBA 3333223.
// Callers may override individual pairs via sap_movement_type / sap_goods_movement_code
// on InventoryMovement domain objects; the adapter merges supplied overrides with
// these defaults rather than requiring both to be present.
const defaultMovementMap: Record<string, { goodsMovementCode: string; goodsMovementType: string }> = {
  DAMAGE: { goodsMovementCode: '03', goodsMovementType: '551' },
  GOODS_RECEIPT: { goodsMovementCode: '05', goodsMovementType: '501' },
  TRANSFER_OUT: { goodsMovementCode: '04', goodsMovementType: '301' },
  TRANSFER_IN: { goodsMovementCode: null, goodsMovementType: null }, // explicitly blocked; see switch
  SALE: { goodsMovementCode: null, goodsMovementType: null }, // explicitly blocked; see switch
  GOODS_ISSUE: { goodsMovementCode: '03', goodsMovementType: '201' }, // default but requires business destination
  ADJUSTMENT: { goodsMovementCode: null, goodsMovementType: null }, // explicitly overridden per case
  COUNT: { goodsMovementCode: null, goodsMovementType: null }, // explicitly blocked; see switch
};

/** Lookup a default mapping for a movement type. */
function defaultMovementMapping(movementType: string): { goodsMovementCode?: string; goodsMovementType?: string } | undefined {
  return defaultMovementMap[movementType];
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

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${this.authConfig.client_id}:${this.authConfig.client_secret}`)}`,
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

  // ==================== HEALTH CHECK ====================

  private async healthCheck(): Promise<{ status: string; latency_ms: number }> {
    const start = Date.now();
    try {
      await this.getAccessToken();
      // A lightweight read against the product service to verify connectivity
      const response = await this.sapRequest(`${SVC_PRODUCT}/A_Product?$top=1`, {});
      const latencyMs = Date.now() - start;
      return { status: response.ok ? 'up' : 'degraded', latency_ms };
    } catch (error) {
      const latencyMs = Date.now() - start;
      return { status: 'down', latency_ms: latencyMs };
    }
  }

  // ==================== CSRF (SAP Help: Cross-Site Request FORGERY Protection) ====================

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
    const response = await fetch(`${this.config.base_url}${serviceRoot}/`, {
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
      return fetch(`${this.config.base_url}${endpoint}`, {
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
      const filter = since
        ? `&$filter=${encodeURIComponent(`LastChangeDateTime ge datetimeoffset'${since}'`)}`
        : '';
      const response = await this.sapRequest(
        `${SVC_PRODUCT}/A_Product?$expand=to_Description&$top=5000${filter}`,
      );

      if (!response.ok) throw new Error(`Failed to fetch materials: ${response.status}`);
      const data = await response.json();
      return (data.d?.results ?? []).map((mat: any) => this.mapSAPMaterialToStandard(mat));
    }, 'fetchMaterialMaster');
  }

  private mapSAPMaterialToStandard(sapMat: any): MaterialMaster {
    return {
      sku: sapMat.Product,
      erp_material_number: sapMat.Product,
      description: sapMat.to_Description?.results?.[0]?.ProductDescription || '',
      material_group: sapMat.ProductGroup || '',
      base_uom: sapMat.BaseUnit || '',
      // Sales / purchasing views require additional $expand targets whose exact
      // navigation names vary by release; they are intentionally not guessed.
      sales_uom: sapMat.BaseUnit || '',
      ean_gtin: undefined,
      is_active: sapMat.IsMarkedForDeletion !== 'X',
      vendor_accounts: [],
      shelf_life_days: undefined,
      rounding_value: undefined,
      min_order_qty: undefined,
      standard_price: undefined,
    };
  }

  async fetchStockBaselines(store_id: string): Promise<StockBaseline[]> {
    return this.withRetry(async () => {
      const plant = await this.resolvePlant(store_id);
      // SAP stock type codes: 01=unrestricted, 02=blocked, 03=inspection, 04=quality
      // We fetch all stock types and categorize them locally so the caller gets
      // a complete picture rather than only unrestricted use.
      const filter = encodeURIComponent(`Plant eq '${plant}'`);
      const response = await this.sapRequest(
        `${SVC_MATERIAL_STOCK}/A_MaterialStock?$filter=${filter}&$top=5000`,
      );

      if (!response.ok) throw new Error(`Failed to fetch stock: ${response.status}`);
      const data = await response.json();

      // Categorize by stock type
      const byStockType: Record<string, any[]> = {};
      (data.d?.results ?? []).forEach((stock: any) => {
        const stk = stock.InventoryStockType ?? '01';
        if (!byStockType[stk]) byStockType[stk] = [];
        byStockType[stk].push(stock);
      });

      // Sum quantities per category
      const readStockQuantity = (nav: any): number => {
        const rows = Array.isArray(nav?.results) ? nav.results : nav ? [nav] : [];
        return rows.reduce(
          (sum: number, row: any) => sum + (parseFloat(row?.MatlWrhsStkQtyInMatlBaseUnit ?? '0') || 0),
          0,
        );
      };

      const unrestricted = (byStockType['01'] || []).reduce(
        (sum, stock) => sum + this.readStockQuantity(stock.to_MatlStkInAcctMod), 0,
      );
      const blocked = (byStockType['02'] || []).reduce(
        (sum, stock) => sum + this.readStockQuantity(stock.to_MatlStkInAcctMod), 0,
      );
      const inspection = (byStockType['03'] || []).reduce(
        (sum, stock) => sum + this.readStockQuantity(stock.to_MatlStkInAcctMod), 0,
      );
      const quality = (byStockType['04'] || []).reduce(
        (sum, stock) => sum + this.readStockQuantity(stock.to_MatlStkInAcctMod), 0,
      );

      const total = unrestricted + blocked + inspection + quality;

      return (data.d?.results ?? []).map((stock: any) => {
        const stk = stock.InventoryStockType ?? '01';
        const qty = this.readStockQuantity(stock.to_MatlStkInAcctMod);
        return {
          sku: stock.Material,
          store_id,
          erp_plant: stock.Plant,
          erp_storage_location: stock.StorageLocation || this.rawDefaults().defaultStorageLocation || '0001',
          // Per-stock-type quantities (can be summed by caller)
          quantity_unrestricted: stk === '01' ? qty : 0,
          quantity_in_quality_inspection: stk === '03' ? qty : 0,
          quantity_blocked: stk === '02' ? qty : 0,
          // Also expose total across all types for convenience
          atp_quantity: total,
          last_updated: new Date().toISOString(),
          // Expose stock type so callers can filter/aggregate as needed
          stock_type: stk,
        };
      });
    }, 'fetchStockBaselines');
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
    // Explicit override: caller supplies sap_movement_type and/or sap_goods_movement_code
    // to override the default SAP mapping. The adapter uses whichever fields are
    // provided — missing ones fall back to the default mapping for that movement type.
    if (movement.sap_movement_type || movement.sap_goods_movement_code) {
      // Infer the missing half from the default mapping for this movement type.
      const defaultMapping = defaultMovementMapping(movement.movement_type);
      const movementType = movement.sap_movement_type ?? defaultMapping?.goodsMovementType;
      const goodsMovementCode = movement.sap_goods_movement_code ?? defaultMapping?.goodsMovementCode;

      if (!movementType) {
        return {
          ok: false,
          reason: `Cannot infer SAP movement type for '${movement.movement_type}'. Supply sap_movement_type or ensure a default mapping exists.`,
        };
      }

      if (!goodsMovementCode) {
        return {
          ok: false,
          reason: `Cannot infer SAP goods movement code for '${movement.movement_type}'. Supply sap_goods_movement_code or ensure a default mapping exists.`,
        };
      }

      // Validate the supplied values
      if (!/^\d{3}$/.test(movementType)) {
        return {
          ok: false,
          reason: `'${movementType}' is not a 3-digit SAP movement type.`,
        };
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

    // Default mappings — no explicit override supplied, use the table-lookup.
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

  // ==================== PURCHASE ORDER READ ====================

  /**
   * Reads purchase orders back from SAP.
   *
   * NOTE: Reading POs from SAP is a separate concern from posting them.
   * The API_PURCHASEORDER_PROCESS_SRV only supports write (POST).
   * If you need a read path, consider:
   *   - Using API_PURCHASE_ORDER_SRV (if available in your SAP release)
   *   - Maintaining a local PO ledger from external procurement systems
   *   - This method currently returns an empty array with a diagnostic log;
   *     implement a proper SAP read endpoint when required.
   */
  async fetchPurchaseOrders(filters?: POFilter): Promise<PurchaseOrder[]> {
    const { client_id, client_secret } = this.authConfig;
    if (!client_id || !client_secret) {
      console.warn('[sap-adapter] fetchPurchaseOrders skipped: SAP credentials not configured.');
      return [];
    }

    // $batch read is not supported by API_PURCHASEORDER_PROCESS_SRV.
    // This is a placeholder that returns an empty array; implement a proper
    // OData read against API_PURCHASE_ORDER_SRV when the read path is needed.
    console.info('[sap-adapter] fetchPurchaseOrders: read path not yet implemented for API_PURCHASEORDER_PROCESS_SRV');
    return [];
  }

  // ==================== REST OF FILE ====================