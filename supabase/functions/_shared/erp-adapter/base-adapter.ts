// /supabase/functions/_shared/erp-adapter/base-adapter.ts

import { IERPAdapter, ERPConfig, BatchResult, InventoryMovement, MaterialMaster, StockBaseline, VendorInfo, PurchaseRequisition, PurchaseOrder, GoodsReceipt, ReconciliationResult, POFilter } from './types.ts';

export abstract class BaseERPAdapter implements IERPAdapter {
  protected config: ERPConfig;
  protected requestTimeoutMs: number = 30000;
  protected maxRetries: number = 3;
  protected circuitBreakerThreshold: number = 5;
  protected failureCount: number = 0;
  protected lastFailureTime?: number;
  protected circuitOpen: boolean = false;

  constructor(config: ERPConfig) {
    this.config = config;
  }

  // ==================== CIRCUIT BREAKER PATTERN ====================
  // Prevents cascading failures when ERP is down
  
  protected isCircuitOpen(): boolean {
    if (!this.circuitOpen) return false;
    // Half-open after 60 seconds
    if (this.lastFailureTime && Date.now() - this.lastFailureTime > 60000) {
      this.circuitOpen = false;
      this.failureCount = 0;
      return false;
    }
    return true;
  }

  protected recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.circuitBreakerThreshold) {
      this.circuitOpen = true;
      console.error(`[${this.config.erp_type}] Circuit breaker OPEN for ${this.config.id}`);
    }
  }

  protected recordSuccess() {
    if (this.failureCount > 0) {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  // ==================== RETRY WRAPPER ====================
  
  protected async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (this.isCircuitOpen()) {
          throw new Error(`Circuit breaker is OPEN for ${this.config.erp_type}`);
        }
        
        const result = await this.executeWithTimeout(operation);
        this.recordSuccess();
        return result;
        
      } catch (error) {
        lastError = error as Error;
        this.recordFailure();
        
        if (attempt === this.maxRetries) {
          console.error(`[${this.config.erp_type}] ${context} failed after ${this.maxRetries} attempts:`, lastError);
          throw lastError;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(`[${this.config.erp_type}] ${context} attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    
    throw lastError!;
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), this.requestTimeoutMs)
      )
    ]);
  }

  // ==================== BATCH ERROR HANDLING ====================
  // Every adapter must implement proper partial failure handling
  
  protected createBatchResult<T>(items: T[], results: Array<{ success: boolean; error?: string; erp_doc?: string }>): BatchResult<T> {
    return {
      total: items.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      items: items.map((item, idx) => ({
        item,
        status: results[idx]?.success ? 'success' : (results[idx]?.error?.includes('partial') ? 'partial' : 'failed'),
        erp_document_number: results[idx]?.erp_doc,
        error: results[idx]?.error
      }))
    };
  }

  // Abstract methods — MUST be implemented by each ERP adapter
  abstract connect(): Promise<{ success: boolean; message: string }>;
  abstract healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; latency_ms: number }>;
  abstract fetchMaterialMaster(since?: string): Promise<MaterialMaster[]>;
  abstract fetchStockBaselines(store_id: string): Promise<StockBaseline[]>;
  abstract fetchVendors(): Promise<VendorInfo[]>;
  abstract postInventoryMovements(movements: InventoryMovement[]): Promise<BatchResult<InventoryMovement>>;
  abstract postPurchaseRequisition(pr: PurchaseRequisition): Promise<{ success: boolean; erp_pr_number?: string; errors?: string[] }>;
  abstract postPurchaseOrder(po: PurchaseOrder): Promise<{ success: boolean; erp_po_number?: string; errors?: string[] }>;
  abstract fetchPurchaseOrders(filters?: POFilter): Promise<PurchaseOrder[]>;
  abstract fetchGoodsReceipts(since?: string): Promise<GoodsReceipt[]>;
  abstract checkATP(sku: string, store_id: string, requested_qty: number): Promise<{ available: boolean; atp_qty: number; delivery_date?: string }>;
  abstract reconcileStock(store_id: string, sku?: string): Promise<ReconciliationResult>;
}
