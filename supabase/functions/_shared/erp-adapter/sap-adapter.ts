// /supabase/functions/_shared/erp-adapter/sap-adapter.ts

import { BaseERPAdapter } from './base-adapter.ts';
import { 
  IERPAdapter, ERPConfig, SAPAuthConfig, MaterialMaster, StockBaseline,
  InventoryMovement, PurchaseRequisition, PurchaseOrder, BatchResult,
  ReconciliationResult, GoodsReceipt, VendorInfo, POFilter
} from './types.ts';

export class SAPAdapter extends BaseERPAdapter {
  private accessToken?: string;
  private tokenExpiry?: number;
  private authConfig: SAPAuthConfig;

  constructor(config: ERPConfig) {
    super(config);
    this.authConfig = config.auth_config as SAPAuthConfig;
  }

  // ==================== AUTHENTICATION (REPLACES SIMULATED HASHES) ====================
  
  async connect(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAccessToken();
      const health = await this.healthCheck();
      return {
        success: health.status !== 'down',
        message: `SAP S/4HANA ${health.status} (latency: ${health.latency_ms}ms)`
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${(error as Error).message}`
      };
    }
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5min buffer)
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    // For on-premise S/4HANA behind SAP Cloud Connector
    const tokenUrl = this.authConfig.cloud_connector_url 
      ? `${this.authConfig.cloud_connector_url}/oauth/token`
      : this.authConfig.token_url;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${this.authConfig.client_id}:${this.authConfig.client_secret}`)}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'sap_btp_erp_integration' // Adjust per your SAP setup
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SAP OAuth failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
    
    return this.accessToken;
  }

  private async sapRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const url = `${this.config.base_url}${endpoint}`;
    
    return fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-csrf-token': 'fetch', // Required for state-changing SAP OData calls
        ...options.headers
      }
    });
  }

  // ==================== MASTER DATA FETCH ====================

  async fetchMaterialMaster(since?: string): Promise<MaterialMaster[]> {
    return this.withRetry(async () => {
      // Use SAP OData API for Product Master (API_PRODUCT_SRV)
      // or custom CDS view exposing MARA + MAKT + MVKE + EINA
      const filter = since ? `&$filter=LastChangeDateTime ge datetimeoffset'${since}'` : '';
      const response = await this.sapRequest(
        `/sap/opu/odata/sap/API_PRODUCT_SRV/A_Product?$expand=to_Description,to_SalesDelivery,to_Purchasing${filter}&$top=5000`
      );
      
      if (!response.ok) throw new Error(`Failed to fetch materials: ${response.status}`);
      
      const data = await response.json();
      return data.d.results.map((mat: any) => this.mapSAPMaterialToStandard(mat));
    }, 'fetchMaterialMaster');
  }

  private mapSAPMaterialToStandard(sapMat: any): MaterialMaster {
    return {
      sku: sapMat.Product, // MATNR
      erp_material_number: sapMat.Product,
      description: sapMat.to_Description?.results?.[0]?.ProductDescription || '',
      material_group: sapMat.ProductGroup || '', // MATKL
      base_uom: sapMat.BaseUnit || 'PC',
      sales_uom: sapMat.to_SalesDelivery?.results?.[0]?.SalesUnit || sapMat.BaseUnit || 'PC',
      ean_gtin: sapMat.to_SalesDelivery?.results?.[0]?.EANUPC || undefined,
      is_active: sapMat.IsMarkedForDeletion !== 'X',
      // Vendor info requires separate EINA/EINE fetch or custom CDS
      vendor_accounts: [], // Populated via fetchVendors()
      shelf_life_days: sapMat.to_Purchasing?.results?.[0]?.ShelfLifeExpirationControl ? 30 : undefined,
      rounding_value: undefined, // From EINE-BSTRF
      min_order_qty: undefined,  // From EINE-MINBM
      standard_price: undefined  // From MBEW-VERPR or MBEW-STPRS
    };
  }

  async fetchStockBaselines(store_id: string): Promise<StockBaseline[]> {
    return this.withRetry(async () => {
      // Use API_MATERIAL_STOCK_SRV or custom CDS
      // Map your store_id to SAP Plant (WERKS) + Storage Location (LGORT)
      const plant = await this.resolvePlant(store_id);
      
      const response = await this.sapRequest(
        `/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV/A_MaterialStock?$filter=Plant eq '${plant}'&$expand=to_MaterialStockTP`
      );
      
      if (!response.ok) throw new Error(`Failed to fetch stock: ${response.status}`);
      
      const data = await response.json();
      return data.d.results.map((stock: any) => ({
        sku: stock.Material,
        store_id,
        erp_plant: stock.Plant,
        erp_storage_location: stock.StorageLocation || '0001',
        quantity_unrestricted: parseFloat(stock.to_MaterialStockTP?.MatlWrhsStkQtyInMatlBaseUnit || 0),
        quantity_in_quality_inspection: 0, // Map from relevant field
        quantity_blocked: 0,
        atp_quantity: parseFloat(stock.to_MaterialStockTP?.MatlWrhsStkQtyInMatlBaseUnit || 0),
        last_updated: new Date().toISOString()
      }));
    }, 'fetchStockBaselines');
  }

  async fetchVendors(): Promise<VendorInfo[]> {
    return this.withRetry(async () => {
      // API_BUSINESS_PARTNER or custom CDS with EINA/EINE/KNVV
      const response = await this.sapRequest(
        `/sap/opu/odata/sap/API_BUSINESS_PARTNER_SRV/A_BusinessPartner?$filter=BusinessPartnerType eq '2'&$expand=to_BusinessPartnerSupplier`
      );
      
      if (!response.ok) throw new Error(`Failed to fetch vendors: ${response.status}`);
      const data = await response.json();
      return data.d.results.map((bp: any) => ({
        vendor_code: bp.BusinessPartner,
        vendor_name: bp.BusinessPartnerFullName || bp.OrganizationBPName1 || 'SAP Vendor',
        currency: 'EUR',
        min_order_qty: 1,
        rounding_value: 1,
        is_primary: true
      }));
    }, 'fetchVendors');
  }

  // ==================== INVENTORY MOVEMENTS (THE DAILY BATCH) ====================

  async postInventoryMovements(movements: InventoryMovement[]): Promise<BatchResult<InventoryMovement>> {
    return this.withRetry(async () => {
      // Build OData $batch payload
      // Group by movement type for efficient processing
      const batchBody = this.buildODataBatch(movements);
      
      const response = await this.sapRequest('/sap/opu/odata/sap/API_INVENTORY_TRANSACTION_SRV/$batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/mixed; boundary=batch_boundary'
        },
        body: batchBody
      });

      if (!response.ok) {
        throw new Error(`Batch request failed: ${response.status}`);
      }

      const responseText = await response.text();
      return this.parseBatchResponse(movements, responseText);
      
    }, 'postInventoryMovements');
  }

  private buildODataBatch(movements: InventoryMovement[]): string {
    // Proper OData $batch multipart construction
    let batchBody = '--batch_boundary\n';
    batchBody += 'Content-Type: application/http\n';
    batchBody += 'Content-Transfer-Encoding: binary\n\n';
    
    for (const movement of movements) {
      // Map your movement types to SAP movement types
      // 101 = GR, 102 = GR reversal, 201 = GI, 261 = GI for order, etc.
      const sapMovementType = this.mapMovementType(movement.movement_type);
      
      const payload = {
        Material: movement.sku,
        Plant: movement.store_id, // Map via resolvePlant()
        StorageLocation: '0001', // Default or map from config
        GoodsMovementType: sapMovementType,
        EntryUnit: movement.uom,
        QuantityInEntryUnit: Math.abs(movement.quantity).toString(),
        DocumentDate: movement.reference_date,
        PostingDate: new Date().toISOString().split('T')[0]
      };

      batchBody += `POST /sap/opu/odata/sap/API_INVENTORY_TRANSACTION_SRV/A_GoodsMovementHeader HTTP/1.1\n`;
      batchBody += `Content-Type: application/json\n\n`;
      batchBody += `${JSON.stringify(payload)}\n`;
      batchBody += '--batch_boundary\n';
    }
    
    batchBody += '--batch_boundary--';
    return batchBody;
  }

  private mapMovementType(type: string): string {
    const mapping: Record<string, string> = {
      'SALE': '201',           // GI for customer
      'GOODS_RECEIPT': '101',  // GR
      'GOODS_ISSUE': '201',    // GI
      'TRANSFER_IN': '101',    // GR (with special stock indicator)
      'TRANSFER_OUT': '301',   // Transfer posting
      'DAMAGE': '201',         // GI with reason code
      'ADJUSTMENT': '501',     // Receipt without PO (adjustment)
      'COUNT': '701'           // Inventory difference
    };
    return mapping[type] || '201';
  }

  private parseBatchResponse(movements: InventoryMovement[], responseText: string): BatchResult<InventoryMovement> {
    // Parse multipart response and match each sub-response to its movement
    const parts = responseText.split('--batch_boundary');
    const results = parts.map((part, idx) => {
      if (idx === 0 || idx >= movements.length + 1) return null;
      
      const isSuccess = part.includes('HTTP/1.1 201') || part.includes('HTTP/1.1 200');
      const docMatch = part.match(/"MaterialDocument":"(\d+)"/);
      const errorMatch = part.match(/"error".*?"message":{"lang":"\w+","value":"([^"]+)"/);
      
      return {
        success: isSuccess,
        erp_doc: docMatch ? docMatch[1] : undefined,
        error: !isSuccess ? (errorMatch ? errorMatch[1] : 'Unknown batch error') : undefined
      };
    }).filter(Boolean) as Array<{ success: boolean; erp_doc?: string; error?: string }>;
    
    return this.createBatchResult(movements, results);
  }

  // ==================== PROCUREMENT ====================

  async postPurchaseRequisition(pr: PurchaseRequisition): Promise<{ success: boolean; erp_pr_number?: string; errors?: string[] }> {
    return this.withRetry(async () => {
      // API_PURCHASEREQUISITION_SRV
      const response = await this.sapRequest('/sap/opu/odata/sap/API_PURCHASEREQUISITION_SRV/A_PurchaseRequisitionHeader', {
        method: 'POST',
        body: JSON.stringify({
          PurchaseRequisitionType: 'NB', // Standard PR
          PurchaseRequisitionDate: new Date().toISOString().split('T')[0],
          to_PurchaseReqnItem: pr.items.map(item => ({
            PurchaseRequisitionItemText: item.sku,
            Plant: pr.items[0] ? item.sku : '1001', // Plant mapping
            Material: item.sku,
            RequestedQuantity: item.quantity_requested.toString(),
            BaseUnit: item.uom,
            PurchaseRequisitionPrice: item.estimated_unit_price?.toString() || '0',
            Currency: pr.currency
          }))
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`PR creation failed: ${error}`);
      }

      const data = await response.json();
      return {
        success: true,
        erp_pr_number: data.d.PurchaseRequisition
      };
    }, 'postPurchaseRequisition');
  }

  async postPurchaseOrder(po: PurchaseOrder): Promise<{ success: boolean; erp_po_number?: string; errors?: string[] }> {
    // API_PURCHASEORDER_SRV for emergency PO bypass
    return this.withRetry(async () => {
      const response = await this.sapRequest('/sap/opu/odata/sap/API_PURCHASEORDER_SRV/A_PurchaseOrder', {
        method: 'POST',
        body: JSON.stringify({
          CompanyCode: '1000', // Should come from config
          PurchasingOrganization: '1000',
          PurchasingGroup: '001',
          Supplier: po.vendor_code,
          to_PurchaseOrderItem: po.items.map(item => ({
            Material: item.sku,
            Plant: '1001',
            OrderQuantity: item.quantity_ordered.toString(),
            NetPriceAmount: item.net_price.toString()
          }))
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`PO creation failed: ${error}`);
      }

      const data = await response.json();
      return {
        success: true,
        erp_po_number: data.d.PurchaseOrder
      };
    }, 'postPurchaseOrder');
  }

  // ==================== ATP & RECONCILIATION ====================

  async checkATP(sku: string, store_id: string, requested_qty: number): Promise<{ available: boolean; atp_qty: number; delivery_date?: string }> {
    return this.withRetry(async () => {
      // Use API_MATERIAL_STOCK_SRV or custom ATP CDS
      const plant = await this.resolvePlant(store_id);
      const response = await this.sapRequest(
        `/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV/A_MaterialStock(Material='${sku}',Plant='${plant}',StorageLocation='0001')?$expand=to_MaterialStockTP`
      );
      
      if (!response.ok) throw new Error(`ATP check failed: ${response.status}`);
      
      const data = await response.json();
      const atpQty = parseFloat(data.d.to_MaterialStockTP?.MatlWrhsStkQtyInMatlBaseUnit || 0);
      
      return {
        available: atpQty >= requested_qty,
        atp_qty: atpQty,
        delivery_date: undefined // Would come from vendor lead time + scheduling
      };
    }, 'checkATP');
  }

  async reconcileStock(store_id: string, sku?: string): Promise<ReconciliationResult> {
    // Fetch current SAP stock and compare with local ledger
    const sapStock = await this.fetchStockBaselines(store_id);
    return {
      store_id,
      erp_total: sapStock.reduce((sum, s) => sum + s.quantity_unrestricted, 0),
      local_total: 0, // Fetch from Supabase in caller
      variance: 0,
      variance_percentage: 0,
      last_common_transaction: new Date().toISOString(),
      discrepancies: []
    };
  }

  // ==================== HELPER METHODS ====================

  private async resolvePlant(store_id: string): Promise<string> {
    // Map internal store_id to SAP Plant (WERKS)
    return store_id;
  }

  // ==================== BATCH PROCUREMENT EXECUTION ====================

  async executeBatchPR(items: Array<{
    stagedPrId: string;
    material: string;
    plant: string;
    storageLocation: string;
    quantity: number;
    uom: string;
    vendor: string;
    deliveryDate: string;
    estimatedPrice: number;
  }>): Promise<BatchResult<any>> {
    return this.withRetry(async () => {
      const boundary = `batch_${crypto.randomUUID()}`;
      let batchBody = '';

      for (const item of items) {
        const payload = {
          PurchaseRequisitionType: 'NB',
          PurchaseRequisitionDate: new Date().toISOString().split('T')[0],
          to_PurchaseReqnItem: [{
            PurchaseRequisitionItemText: item.material,
            Plant: item.plant,
            StorageLocation: item.storageLocation,
            Material: item.material,
            RequestedQuantity: item.quantity.toString(),
            BaseUnit: item.uom,
            PurchaseRequisitionPrice: item.estimatedPrice.toString(),
            Currency: 'EUR',
            RequisitionerName: 'LIVE_RETAIL_SYSTEM',
            DesiredVendor: item.vendor,
            PlannedDeliveryDuration: '7'
          }]
        };

        batchBody += `--${boundary}\n`;
        batchBody += `Content-Type: application/http\n`;
        batchBody += `Content-Transfer-Encoding: binary\n\n`;
        batchBody += `POST /sap/opu/odata/sap/API_PURCHASEREQUISITION_SRV/A_PurchaseRequisitionHeader HTTP/1.1\n`;
        batchBody += `Content-Type: application/json\n`;
        batchBody += `Content-ID: ${item.stagedPrId}\n\n`;
        batchBody += `${JSON.stringify(payload)}\n`;
      }

      batchBody += `--${boundary}--`;

      const response = await this.sapRequest('/sap/opu/odata/sap/API_PURCHASEREQUISITION_SRV/$batch', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/mixed; boundary=${boundary}`
        },
        body: batchBody
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Batch PR failed: ${response.status} - ${errorText}`);
      }

      const responseText = await response.text();
      return this.parsePRBatchResponse(items, responseText, boundary);

    }, 'executeBatchPR');
  }

  private parsePRBatchResponse(
    items: any[], 
    responseText: string, 
    boundary: string
  ): BatchResult<any> {
    const parts = responseText.split(`--${boundary}`);
    const results = [];

    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      
      const statusMatch = part.match(/HTTP\/1\.1 (\d{3})/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;
      const isSuccess = statusCode >= 200 && statusCode < 300;
      
      let erpDoc = undefined;
      let error = undefined;
      
      if (isSuccess) {
        const docMatch = part.match(/"PurchaseRequisition":"(\d+)"/);
        erpDoc = docMatch ? docMatch[1] : undefined;
      } else {
        const errorMatch = part.match(/"message":{"lang":"\w+","value":"([^"]+)"/);
        error = errorMatch ? errorMatch[1] : `HTTP ${statusCode} error`;
      }

      results.push({
        success: isSuccess,
        erp_doc: erpDoc,
        error
      });
    }

    return this.createBatchResult(items, results);
  }

  // ==================== GOODS RECEIPT FETCH ====================

  async fetchGoodsReceipts(since?: string): Promise<GoodsReceipt[]> {
    return this.withRetry(async () => {
      const filter = since ? `&$filter=PostingDate ge datetime'${since}'` : '';
      
      const response = await this.sapRequest(
        `/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader?$expand=to_MaterialDocumentItem${filter}&$top=5000`
      );

      if (!response.ok) throw new Error(`GR fetch failed: ${response.status}`);
      
      const data = await response.json();
      
      return data.d.results.flatMap((header: any) => 
        header.to_MaterialDocumentItem?.results?.map((item: any) => ({
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
          posted_at: header.PostingDate
        })) || []
      );
    }, 'fetchGoodsReceipts');
  }

  // ==================== EMERGENCY PO ====================

  async postEmergencyPO(po: PurchaseOrder): Promise<{ success: boolean; erp_po_number?: string; errors?: string[] }> {
    return this.withRetry(async () => {
      if (!this.accessToken) {
        await this.getAccessToken();
      }

      const response = await this.sapRequest('/sap/opu/odata/sap/API_PURCHASEORDER_SRV/A_PurchaseOrder', {
        method: 'POST',
        body: JSON.stringify({
          CompanyCode: po.items[0]?.companyCode || '1000',
          PurchasingOrganization: po.items[0]?.purchasingOrg || '1000',
          PurchasingGroup: po.items[0]?.purchasingGroup || '001',
          Supplier: po.vendor_code,
          DocumentDate: new Date().toISOString().split('T')[0],
          to_PurchaseOrderItem: po.items.map((item, idx) => ({
            PurchaseOrderItem: (idx + 1).toString().padStart(5, '0'),
            Material: item.sku,
            Plant: item.plant || '1001',
            OrderQuantity: item.quantity_ordered.toString(),
            OrderQuantityUnit: item.uom,
            NetPriceAmount: item.net_price.toString(),
            NetPriceCurrency: po.currency || 'EUR',
            TaxCode: 'V1',
            RequisitionerName: 'LIVE_RETAIL_EMERGENCY'
          }))
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          errors: [`SAP PO creation failed: ${response.status}`, errorBody]
        };
      }

      const data = await response.json();
      return {
        success: true,
        erp_po_number: data.d.PurchaseOrder
      };
    }, 'postEmergencyPO');
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; latency_ms: number }> {
    const start = Date.now();
    try {
      const response = await this.sapRequest('/sap/opu/odata/sap/API_PRODUCT_SRV/A_Product?$top=1');
      const latency = Date.now() - start;
      
      if (response.ok) return { status: 'healthy', latency_ms: latency };
      if (response.status >= 500) return { status: 'degraded', latency_ms: latency };
      return { status: 'down', latency_ms: latency };
    } catch {
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  async fetchPurchaseOrders(filters?: POFilter): Promise<PurchaseOrder[]> { return []; }
}
