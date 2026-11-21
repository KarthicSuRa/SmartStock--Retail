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

interface SapDefaults {
  companyCode: string;
  purchasingOrganization?: string;
  purchasingGroup: string;
  defaultStorageLocation: string;
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
      const response = await this.sapRequest(
        `${SVC_BUSINESS_PARTNER}/A_Supplier?$select=Supplier,SupplierName&$top=5000`,
      );
      if (!response.ok) throw new Error(`Failed to fetch vendors: ${response.status}`);
      const data = await response.json();

      return (data.d?.results ?? []).map((bp: any) => ({
        vendor_code: bp.Supplier,
        // A_Supplier carries SupplierName. If the field is empty, fall back to
        // the supplier number rather than inventing a name.
        vendor_name: bp.SupplierName || bp.Supplier,
        currency: this.rawDefaults().currencyCode || 'EUR',
        // MOQ and rounding are properties of the info record, not the supplier
        // master; 0 means "no constraint captured here".
        min_order_qty: 0,
        rounding_value: 0,
        is_primary: false,
      }));
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
    // Explicit override: both halves are required. The adapter never guesses
    // which GoodsMovementCode belongs to a given movement type.
    if (movement.sap_movement_type || movement.sap_goods_movement_code) {
      if (!movement.sap_movement_type || !movement.sap_goods_movement_code) {
        return {
          ok: false,
          reason: 'Supply both sap_movement_type and sap_goods_movement_code when overriding the default SAP mapping.',
        };
      }
      if (!/^\d{3}$/.test(movement.sap_movement_type)) {
        return { ok: false, reason: `'${movement.sap_movement_type}' is not a 3-digit SAP movement type.` };
      }
      if (!/^0[1-7]$/.test(movement.sap_goods_movement_code)) {
        return {
          ok: false,
          reason: `sap_goods_movement_code must be 01-07 (SAP KBA 3333223); received '${movement.sap_goods_movement_code}'.`,
        };
      }
      return {
        ok: true,
        goodsMovementCode: movement.sap_goods_movement_code,
        goodsMovementType: movement.sap_movement_type,
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

    const headerText = `SmartStock ${movement.reference_document ?? movement.movement_id}`;

    return {
      PostingDate: toSapDate(movement.reference_date),
      DocumentDate: toSapDate(movement.reference_date),
      GoodsMovementCode: goodsMovementCode,
      // BKTXT is 25 characters; truncation is explicit rather than silent.
      MaterialDocumentHeaderText: headerText.slice(0, 25),
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

    const response = await this.sapRequest(
      `${SVC_PURCHASE_REQ}/$batch`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/mixed; boundary=${batchBoundary}` },
        body,
      },
      { write: true },
    );

    if (!response.ok) {
      const detail = await this.readSapError(response);
      if (response.status >= 500) {
        throw new OutcomeUnknownError(`SAP PR $batch failed with HTTP ${response.status}: ${detail}`);
      }
      throw new NonRetryableError(`SAP PR $batch rejected (HTTP ${response.status}): ${detail}`);
    }

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

  async reconcileStock(store_id: string, _sku?: string): Promise<ReconciliationResult> {
    const sapStock = await this.fetchStockBaselines(store_id);
    const erpTotal = sapStock.reduce((sum, s) => sum + (s.atp_quantity ?? s.quantity_unrestricted ?? 0), 0);

    // Query the operational inventory ledger for the local twin state.
    // We sum sellable_qty (or estimated_on_hand) per SKU to compare against ERP.
    // If no SKU filter was requested, we still compute a store-level delta.
    const skuFilter = _sku
      ? `sku eq '${_sku}'`
      : `store_id eq '${store_id}'`;
    const { data: ledger, error } = await supabase
      .from('inventory_position')
      .select('sellable_qty, material_id')
      .eq('tenant_id', this.config.tenant_id ?? 'default-tenant')
      .eq('location_id', store_id)
      .eq('reconciliation_status', 'MATCHED');

    if (error) {
      console.error('[sap-adapter] reconcileStock ledger query error:', error);
      // Fall back to zero local total so the discrepancy is still visible.
    }

    const localTotal = ledger
      ?.reduce((sum, row) => sum + (row.sellable_qty ?? 0), 0) ?? 0;

    const variance = localTotal - erpTotal;
    const variancePercentage = erpTotal
      ? Math.round((variance / erpTotal) * 100)
      : 0;

    // Collect per-SKU discrepancies when a specific SKU was requested
    const discrepancies: Array<{ sku: string; local: number; erp: number; variance: number }> = [];
    if (_sku && ledger) {
      ledger.forEach((row: any) => {
        const erpEntry = sapStock.find((s: any) => s.sku === row.material_id);
        if (erpEntry) {
          const local = row.sellable_qty ?? 0;
          const erpQty = erpEntry.atp_quantity ?? erpEntry.quantity_unrestricted ?? 0;
          discrepancies.push({
            sku: row.material_id,
            local,
            erp: erpQty,
            variance: local - erpQty,
          });
        }
      });
    }

    return {
      store_id,
      erp_total: erpTotal,
      local_total: localTotal,
      variance,
      variance_percentage,
      last_common_transaction: new Date().toISOString(),
      discrepancies,
    };
  }

  // ==================== GOODS RECEIPT FETCH ====================

  async fetchGoodsReceipts(since?: string): Promise<GoodsReceipt[]> {
    return this.withRetry(async () => {
      const filter = since ? `&$filter=${encodeURIComponent(`PostingDate ge datetime'${since}'`)}` : '';
      const response = await this.sapRequest(
        `${SVC_MATERIAL_DOCUMENT}/${ENTITY_MATERIAL_DOCUMENT}?$expand=to_MaterialDocumentItem${filter}&$top=5000`,
      );

      if (!response.ok) throw new Error(`GR fetch failed: ${response.status}`);
      const data = await response.json();

      return (data.d?.results ?? []).flatMap((header: any) =>
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

  async fetchPurchaseOrders(_filters?: POFilter): Promise<PurchaseOrder[]> {
    // Not implemented: reading POs back is a separate concern from the write
    // path and is deliberately not guessed here.
    return [];
  }

  // ==================== STATUS PROBE ====================

  override async getPostingStatus(_reference: string): Promise<PostingStatusResult> {
    // Deliberately unimplemented rather than faked. Resolving OUTCOME_UNKNOWN
    // requires a deterministic external reference stored on the SAP document,
    // which this payload does not yet write. Until that exists, callers must
    // treat OUTCOME_UNKNOWN as "needs a human", not "retry".
    throw new NonRetryableError(
      'getPostingStatus() is not implemented for SAPAdapter: no deterministic external reference is written to the material document yet.',
    );
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
      'Add an entry to erp_configurations.metadata.plant_map keyed by store_id, ` +
      'or configure a wildcard plant_map["*"] for a default plant.'
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
