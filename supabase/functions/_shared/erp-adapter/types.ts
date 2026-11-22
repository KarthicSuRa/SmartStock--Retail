// /supabase/functions/_shared/erp-adapter/types.ts

// ==================== CORE DATA TYPES ====================

export interface ERPConfig {
  id: string;
  tenant_id: string;           // Your multi-tenant identifier
  erp_type: 'sap_s4hana' | 'sap_ecc' | 'netsuite' | 'dynamics365' | 'mock';
  base_url: string;
  auth_method: 'oauth2' | 'basic' | 'x509' | 'api_key';
  auth_config: SAPAuthConfig | OAuth2Config | BasicAuthConfig;
  connection_status: 'active' | 'inactive' | 'error';
  last_sync_at?: string;
  metadata?: Record<string, unknown>;

  // SAP org-unit defaults, as configured on erp_configurations. These are
  // customer-specific and are never defaulted by the platform.
  company_code?: string;
  purchasing_org?: string;
  purchasing_group?: string;

  created_at: string;
  updated_at: string;
}

export interface SAPAuthConfig {
  client_id: string;
  client_secret: string;       // Encrypted at rest
  token_url: string;
  cloud_connector_url?: string; // For on-premise S/4HANA
  certificate_thumbprint?: string;
  /** OAuth scope, if the customer's communication arrangement requires one. */
  scope?: string;
}

export interface OAuth2Config {
  client_id: string;
  client_secret: string;
  token_url: string;
  scope: string;
}

export interface BasicAuthConfig {
  username: string;
  password: string; // Encrypted
}

// ==================== INVENTORY & MASTER DATA ====================

export interface MaterialMaster {
  sku: string;                 // Your canonical SKU
  erp_material_number: string; // SAP MATNR, NetSuite internal ID, etc.
  description: string;
  material_group: string;      // SAP MATKL equivalent
  base_uom: string;            // EA, KG, CS (case)
  sales_uom: string;
  ean_gtin?: string;
  vendor_accounts: VendorInfo[];
  is_active: boolean;
  shelf_life_days?: number;    // For FEFO/FIFO
  rounding_value?: number;     // SAP BSTRF
  min_order_qty?: number;      // SAP MINBM
  standard_price?: number;     // Moving average or standard
  store_specific?: Record<string, StoreMaterialConfig>;
}

export interface StoreMaterialConfig {
  store_id: string;
  erp_plant: string;           // SAP WERKS
  erp_storage_location: string; // SAP LGORT
  reorder_point: number;
  safety_stock: number;
  vendor_lead_days: number;
  is_active_in_store: boolean;
}

export interface VendorInfo {
  vendor_code: string;         // SAP LIFNR
  vendor_name: string;
  contract_net_price?: number; // SAP NETPR
  currency: string;
  min_order_qty: number;
  rounding_value: number;
  is_primary: boolean;
}

// ==================== INVENTORY TRANSACTIONS ====================

export interface StockBaseline {
  sku: string;
  store_id: string;
  erp_plant: string;
  erp_storage_location: string;
  quantity_unrestricted: number;
  quantity_in_quality_inspection: number;
  quantity_blocked: number;
  /** Stock in transit (InventoryStockType 06); zero when the source cannot report it. */
  quantity_in_transit?: number;
  atp_quantity: number;        // Available-to-Promise
  last_updated: string;
  /**
   * SAP InventoryStockType (NSDM_LBBSA) for this row: 01 unrestricted-use,
   * 02 quality inspection, 03 returns, 06 in transit, 07 blocked,
   * 08 restricted-use, 10 GR blocked. Present when the source can supply it.
   */
  stock_type?: string;
}

export interface InventoryMovement {
  movement_id: string;
  sku: string;
  store_id: string;
  movement_type: 'SALE' | 'GOODS_RECEIPT' | 'GOODS_ISSUE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'DAMAGE' | 'ADJUSTMENT' | 'COUNT';
  quantity: number;
  uom: string;
  reference_document?: string; // POS transaction ID, PO number, etc.
  reference_date: string;
  posted_by: string;
  erp_document_number?: string; // Filled after sync
  erp_status: 'PENDING_SYNC' | 'SYNCED' | 'FAILED' | 'REJECTED';
  retry_count: number;
  error_message?: string;
  created_at: string;

  // ---- Optional SAP-specific attributes -------------------------------
  // Only populated when the source system has the data. The SAP adapter
  // refuses to invent any of these, because a wrong value here writes a
  // wrong goods movement into the customer's stock ledger.
  storage_location?: string;
  batch?: string;
  /** Receiving plant for a one-step transfer posting (SAP mvmt type 301). */
  transfer_to_plant?: string;
  /** Receiving storage location for a one-step transfer posting (301). */
  transfer_to_storage_location?: string;
  /**
   * Explicit SAP movement type override (e.g. '551'). When set,
   * `sap_goods_movement_code` must be set too; the adapter never guesses the
   * pairing.
   */
  sap_movement_type?: string;
  /**
   * SAP `GoodsMovementCode`: 01 GR for PO, 02 GR for production order,
   * 03 goods issue, 04 transfer posting, 05 other goods receipt,
   * 06 reversal, 07 subcontracting adjustment.
   */
  sap_goods_movement_code?: string;
  /** SAP movement reason code (MB_GRUND), when the customer requires one. */
  sap_reason_code?: string;
}

// ==================== PROCUREMENT ====================

export interface PurchaseRequisition {
  pr_id: string;
  items: PRItem[];
  requested_delivery_date: string;
  priority: 'NORMAL' | 'URGENT' | 'CRITICAL';
  execution_mode: 'BATCH' | 'IMMEDIATE';
  erp_pr_number?: string;
  status: 'DRAFT' | 'STAGED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PO_CREATED';
  total_estimated_value: number;
  currency: string;
  created_by: string;
  created_at: string;
}

export interface PRItem {
  item_id: string;
  sku: string;
  quantity_requested: number;
  quantity_approved?: number;
  uom: string;
  vendor_code?: string;
  vendor_name?: string;
  estimated_unit_price?: number;
  estimated_total_price?: number;
  erp_item_number?: string;
  delivery_date?: string;
  /** SAP plant (WERKS) the item is requisitioned for. Mandatory for SAP. */
  plant?: string;
}

export interface PurchaseOrder {
  po_id: string;
  erp_po_number: string;       // SAP-PO-X format
  vendor_code: string;
  vendor_name: string;
  items: POItem[];
  total_value: number;
  currency: string;
  status: 'OPEN' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'INVOICED' | 'CANCELLED';
  created_at: string;
  /** SAP document category. 'UB' (stock transport order) is rejected unless the target release exposes an STO API. */
  po_type?: 'NB' | 'UB';
}

export interface POItem {
  item_id: string;
  sku: string;
  quantity_ordered: number;
  quantity_delivered: number;
  quantity_invoiced: number;
  uom: string;
  net_price: number;
  delivery_date: string;
  /** SAP plant (WERKS) the item is ordered for. */
  plant?: string;
}

export interface ERPCapabilities {
  inventoryRead: boolean;
  materialDocumentCreate: boolean;
  stockTransferCreate: boolean;
  purchaseOrderCreate: boolean;
  batchSupported: boolean;
  apiVersions: Record<string, string>;
}

/** One row of a batched purchase-requisition submission. */
export interface PRBatchItem {
  stagedPrId: string;
  material: string;
  plant: string;
  storageLocation?: string;
  quantity: number;
  uom: string;
  vendor?: string;
  deliveryDate?: string;
  estimatedPrice?: number;
}

export interface PostingStatusResult {
  reference: string;
  found: boolean;
  erp_document_number?: string;
  status: 'CONFIRMED' | 'NOT_FOUND' | 'FAILED';
  error_message?: string;
}

// ==================== ADAPTER INTERFACE ====================

export interface IERPAdapter {
  /**
   * True when the adapter is a development stand-in and does NOT talk to a real
   * ERP. Callers must never present simulated document numbers as real ones.
   */
  readonly simulated: boolean;

  // Capability Discovery
  capabilities(): Promise<ERPCapabilities>;

  // Connection & Health
  connect(): Promise<{ success: boolean; message: string }>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; latency_ms: number }>;
  
  // Master Data (Bidirectional)
  fetchMaterialMaster(since?: string): Promise<MaterialMaster[]>;
  fetchStockBaselines(store_id: string): Promise<StockBaseline[]>;
  fetchVendors(): Promise<VendorInfo[]>;
  
  // Transactions (Outbound to ERP)
  postInventoryMovements(movements: InventoryMovement[]): Promise<BatchResult<InventoryMovement>>;
  postPurchaseRequisition(pr: PurchaseRequisition): Promise<{ success: boolean; erp_pr_number?: string; errors?: string[] }>;
  postPurchaseOrder(po: PurchaseOrder): Promise<{ success: boolean; erp_po_number?: string; errors?: string[] }>;

  /**
   * Emergency replenishment path. An adapter that cannot distinguish it from a
   * normal purchase order may delegate; SAP delegates to postPurchaseOrder,
   * which still refuses stock transport orders (po_type 'UB').
   */
  postEmergencyPO(po: PurchaseOrder): Promise<{ success: boolean; erp_po_number?: string; errors?: string[] }>;

  /**
   * Submits several requisitions in one ERP round trip. Optional: adapters that
   * cannot batch are driven item-by-item by the caller instead.
   */
  executeBatchPR?(items: PRBatchItem[]): Promise<BatchResult<any>>;
  
  // Status check for OUTCOME_UNKNOWN resolution
  getPostingStatus(reference: string): Promise<PostingStatusResult>;

  // Procurement (Inbound from ERP)
  fetchPurchaseOrders(filters?: POFilter): Promise<PurchaseOrder[]>;
  fetchGoodsReceipts(since?: string): Promise<GoodsReceipt[]>;
  
  // ATP & Availability
  checkATP(sku: string, store_id: string, requested_qty: number): Promise<{ available: boolean; atp_qty: number; delivery_date?: string }>;
  
  // Reconciliation
  reconcileStock(store_id: string, sku?: string): Promise<ReconciliationResult>;
}

export interface BatchResult<T> {
  total: number;
  succeeded: number;
  failed: number;
  items: Array<{
    item: T;
    status: 'success' | 'failed' | 'partial';
    erp_document_number?: string;
    /** SAP material document year (MJAHR), when the ERP returns one. */
    erp_document_year?: string;
    error?: string;
  }>;
}

export interface POFilter {
  store_id?: string;
  vendor_code?: string;
  status?: string;
  since?: string;
}

export interface GoodsReceipt {
  gr_id: string;
  /** SAP material document number (the goods-receipt document). */
  erp_gr_number?: string;
  /** SAP material document year (MJAHR). */
  erp_gr_year?: string;
  erp_po_number?: string;
  erp_po_item?: string;
  po_number?: string;
  sku: string;
  quantity_received: number;
  uom: string;
  posting_date?: string;
  /** SAP PostingDate as returned by the material-document service. */
  posted_at?: string;
  store_id: string;
  erp_plant?: string;
  erp_storage_location?: string;
  batch_number?: string;
}

export interface ReconciliationResult {
  store_id: string;
  sku?: string;
  erp_total: number;
  local_total: number;
  variance: number;
  variance_percentage: number;
  last_common_transaction: string;
  discrepancies: Array<{
    sku: string;
    erp_qty: number;
    local_qty: number;
    diff: number;
  }>;
}
