// /supabase/functions/_shared/erp-adapter/mock-adapter.ts

import { BaseERPAdapter } from './base-adapter.ts';
import { 
  ERPConfig, InventoryMovement, PurchaseRequisition, PurchaseOrder, BatchResult, 
  ReconciliationResult, MaterialMaster, StockBaseline, VendorInfo, GoodsReceipt, POFilter 
} from './types.ts';

export class MockAdapter extends BaseERPAdapter {
  private mockDelay = 200; // ms

  async connect(): Promise<{ success: boolean; message: string }> {
    await this.delay();
    return { success: true, message: 'Mock ERP connected (development mode)' };
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; latency_ms: number }> {
    await this.delay();
    return { status: 'healthy', latency_ms: this.mockDelay };
  }

  async fetchMaterialMaster(since?: string): Promise<MaterialMaster[]> {
    await this.delay();
    return [
      {
        sku: '10000001',
        erp_material_number: '10000001',
        description: 'Coca-Cola 330ml Can',
        material_group: 'BEVERAGES',
        base_uom: 'EA',
        sales_uom: 'EA',
        ean_gtin: '5449000000996',
        vendor_accounts: [{ vendor_code: 'V001', vendor_name: 'Coca-Cola Europacific', is_primary: true, min_order_qty: 24, rounding_value: 24, currency: 'EUR' }],
        is_active: true,
        shelf_life_days: 365,
        rounding_value: 24,
        min_order_qty: 24,
        standard_price: 0.45
      }
    ];
  }

  async fetchStockBaselines(store_id: string): Promise<StockBaseline[]> {
    await this.delay();
    return [
      { 
        sku: '10000001', 
        store_id, 
        erp_plant: store_id, 
        erp_storage_location: '0001', 
        quantity_unrestricted: 150, 
        quantity_in_quality_inspection: 0,
        quantity_blocked: 0,
        atp_quantity: 150, 
        last_updated: new Date().toISOString() 
      }
    ];
  }

  async fetchVendors(): Promise<VendorInfo[]> {
    await this.delay();
    return [{ vendor_code: 'V001', vendor_name: 'Coca-Cola Europacific', is_primary: true, min_order_qty: 24, rounding_value: 24, currency: 'EUR' }];
  }

  async postInventoryMovements(movements: InventoryMovement[]): Promise<BatchResult<InventoryMovement>> {
    await this.delay();
    // Simulate 95% success rate for realistic testing
    const results = movements.map((_, idx) => ({
      success: idx % 20 !== 0, // 1 in 20 fails
      erp_doc: `MATDOC-${Date.now()}-${idx}`,
      error: idx % 20 === 0 ? 'Mock: Simulated ERP validation error' : undefined
    }));
    return this.createBatchResult(movements, results);
  }

  async postPurchaseRequisition(pr: PurchaseRequisition): Promise<{ success: boolean; erp_pr_number?: string; errors?: string[] }> {
    await this.delay();
    return { success: true, erp_pr_number: `PR-${Date.now()}` };
  }

  async postPurchaseOrder(po: PurchaseOrder): Promise<{ success: boolean; erp_po_number?: string; errors?: string[] }> {
    await this.delay();
    return { success: true, erp_po_number: `PO-${Date.now()}` };
  }

  async fetchPurchaseOrders(filters?: POFilter): Promise<PurchaseOrder[]> { return []; }
  async fetchGoodsReceipts(since?: string): Promise<GoodsReceipt[]> { return []; }

  async checkATP(sku: string, store_id: string, requested_qty: number): Promise<{ available: boolean; atp_qty: number; delivery_date?: string }> {
    await this.delay();
    return { available: true, atp_qty: 999, delivery_date: new Date(Date.now() + 7 * 86400000).toISOString() };
  }

  async reconcileStock(store_id: string, sku?: string): Promise<ReconciliationResult> {
    await this.delay();
    return {
      store_id,
      erp_total: 150,
      local_total: 148,
      variance: 2,
      variance_percentage: 1.33,
      last_common_transaction: new Date().toISOString(),
      discrepancies: sku ? [{ sku, erp_qty: 150, local_qty: 148, diff: 2 }] : []
    };
  }

  private delay(): Promise<void> {
    return new Promise(r => setTimeout(r, this.mockDelay));
  }
}
