// /supabase/functions/_shared/sync-engine/sync-orchestrator.ts

import { IERPAdapter, MaterialMaster, StockBaseline, VendorInfo } from '../erp-adapter/types.ts';
import { DeltaTracker } from './delta-tracker.ts';
import { ConflictResolver, MergeStrategy } from './conflict-resolver.ts';
import { SyncAudit } from './sync-audit.ts';

export interface SyncJob {
  tenantId: string;
  erpConfigId: string;
  entityTypes: Array<'material_master' | 'vendors' | 'stock_baselines' | 'purchase_orders'>;
  mode: 'full' | 'delta' | 'reconciliation';
  triggeredBy: 'schedule' | 'manual' | 'webhook' | 'seed';
  userId?: string;
}

export interface SyncResult {
  entityType: string;
  status: 'success' | 'partial' | 'failed';
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsFailed: number;
  recordsUnchanged: number;
  conflicts: number;
  durationMs: number;
  errors: string[];
}

export class SyncOrchestrator {
  private supabase: any;
  private adapter: IERPAdapter;
  private deltaTracker: DeltaTracker;
  private conflictResolver: ConflictResolver;
  private audit: SyncAudit;

  constructor(
    supabaseClient: any,
    adapter: IERPAdapter,
    options: { mergeStrategy?: MergeStrategy } = {}
  ) {
    this.supabase = supabaseClient;
    this.adapter = adapter;
    this.deltaTracker = new DeltaTracker(supabaseClient);
    this.conflictResolver = new ConflictResolver(options.mergeStrategy || 'erp_wins');
    this.audit = new SyncAudit(supabaseClient);
  }

  // ==================== MAIN ENTRY POINT ====================

  async runSync(job: SyncJob): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    const syncStartTime = Date.now();

    console.log(`[SyncOrchestrator] Starting ${job.mode} sync for tenant ${job.tenantId}`);

    for (const entityType of job.entityTypes) {
      try {
        await this.deltaTracker.startSync(job.tenantId, job.erpConfigId, entityType);

        const syncWindow = await this.deltaTracker.getSyncWindow(
          job.tenantId, 
          job.erpConfigId, 
          entityType, 
          job.mode
        );

        const erpRecords = await this.fetchFromERP(entityType, syncWindow, job.tenantId, job.erpConfigId);

        const comparison = await this.compareWithLocal(job.tenantId, job.erpConfigId, entityType, erpRecords);

        const applyResult = await this.applyChanges(job, entityType, comparison);

        await this.deltaTracker.completeSync(
          job.tenantId,
          job.erpConfigId,
          entityType,
          applyResult,
          syncWindow.since
        );

        results.push({
          entityType,
          status: applyResult.failed > 0 ? (applyResult.inserted > 0 ? 'partial' : 'failed') : 'success',
          recordsProcessed: applyResult.inserted + applyResult.updated + applyResult.failed + applyResult.unchanged,
          recordsInserted: applyResult.inserted,
          recordsUpdated: applyResult.updated,
          recordsFailed: applyResult.failed,
          recordsUnchanged: applyResult.unchanged,
          conflicts: comparison.conflicts.length,
          durationMs: Date.now() - syncStartTime,
          errors: applyResult.errorMessages
        });

      } catch (error) {
        console.error(`[SyncOrchestrator] Sync failed for ${entityType}:`, error);
        
        await this.deltaTracker.failSync(
          job.tenantId,
          job.erpConfigId,
          entityType,
          (error as Error).message
        );

        results.push({
          entityType,
          status: 'failed',
          recordsProcessed: 0,
          recordsInserted: 0,
          recordsUpdated: 0,
          recordsFailed: 0,
          recordsUnchanged: 0,
          conflicts: 0,
          durationMs: Date.now() - syncStartTime,
          errors: [(error as Error).message]
        });
      }
    }

    await this.updateERPHealth(job.tenantId, job.erpConfigId, results);

    return results;
  }

  // ==================== FETCH FROM ERP ====================

  private async fetchFromERP(
    entityType: string, 
    syncWindow: { since?: string; cursor?: string },
    tenantId: string,
    erpConfigId: string
  ): Promise<any[]> {
    switch (entityType) {
      case 'material_master':
        return this.adapter.fetchMaterialMaster(syncWindow.since);
      
      case 'vendors':
        return this.adapter.fetchVendors();
      
      case 'stock_baselines': {
        const { data: stores } = await this.supabase
          .from('erp_store_mappings')
          .select('store_id, erp_plant')
          .eq('erp_config_id', erpConfigId)
          .eq('is_active', true);
        
        const allBaselines: StockBaseline[] = [];
        for (const store of stores || []) {
          const baselines = await this.adapter.fetchStockBaselines(store.store_id);
          allBaselines.push(...baselines);
        }
        return allBaselines;
      }
      
      case 'purchase_orders':
        return this.adapter.fetchPurchaseOrders({ since: syncWindow.since });
      
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  // ==================== COMPARE WITH LOCAL ====================

  private async compareWithLocal(
    tenantId: string,
    erpConfigId: string,
    entityType: string,
    erpRecords: any[]
  ): Promise<ComparisonResult> {
    const toInsert: any[] = [];
    const toUpdate: any[] = [];
    const unchanged: any[] = [];
    const conflicts: Array<{ local: any; erp: any; reason: string }> = [];

    for (const erpRecord of erpRecords) {
      const localRecord = await this.findLocalRecord(tenantId, erpConfigId, entityType, erpRecord);

      if (!localRecord) {
        toInsert.push(erpRecord);
        continue;
      }

      const diff = this.computeDiff(entityType, localRecord, erpRecord);
      
      if (!diff.hasChanges) {
        unchanged.push(erpRecord);
        continue;
      }

      const conflict = this.detectConflict(entityType, localRecord, erpRecord, diff);
      
      if (conflict) {
        conflicts.push({ local: localRecord, erp: erpRecord, reason: conflict });
      }

      toUpdate.push({ local: localRecord, erp: erpRecord, diff: diff.fields });
    }

    return { toInsert, toUpdate, unchanged, conflicts };
  }

  private async findLocalRecord(
    tenantId: string,
    erpConfigId: string,
    entityType: string,
    erpRecord: any
  ): Promise<any | null> {
    let query;
    
    switch (entityType) {
      case 'material_master':
        query = this.supabase
          .from('material_master')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('erp_config_id', erpConfigId)
          .eq('sku', erpRecord.sku)
          .maybeSingle();
        break;
      
      case 'vendors':
        query = this.supabase
          .from('vendor_master')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('erp_config_id', erpConfigId)
          .eq('vendor_code', erpRecord.vendor_code)
          .maybeSingle();
        break;
      
      case 'stock_baselines':
        query = this.supabase
          .from('stock_baselines')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('erp_config_id', erpConfigId)
          .eq('erp_plant', erpRecord.erp_plant)
          .eq('erp_storage_location', erpRecord.erp_storage_location)
          .maybeSingle();
        break;
      
      default:
        return null;
    }

    const { data, error } = await query;
    if (error) console.warn('[SyncOrchestrator] findLocalRecord warning:', error.message);
    return data;
  }

  private computeDiff(entityType: string, local: any, erp: any): { hasChanges: boolean; fields: Record<string, { old: any; new: any }> } {
    const fields: Record<string, { old: any; new: any }> = {};
    const comparableFields = this.getComparableFields(entityType);
    let hasChanges = false;
    
    for (const field of comparableFields) {
      const localVal = local[field];
      const erpVal = erp[field];
      
      if (typeof localVal === 'number' && typeof erpVal === 'number') {
        if (Math.abs(localVal - erpVal) > 0.001) {
          fields[field] = { old: localVal, new: erpVal };
          hasChanges = true;
        }
      } else if (localVal != erpVal && erpVal !== undefined) {
        fields[field] = { old: localVal, new: erpVal };
        hasChanges = true;
      }
    }
    
    return { hasChanges, fields };
  }

  private getComparableFields(entityType: string): string[] {
    switch (entityType) {
      case 'material_master':
        return ['description', 'material_group', 'base_uom', 'sales_uom', 'ean_gtin', 
                'is_active', 'erp_deletion_flag', 'shelf_life_days', 'is_perishable'];
      case 'stock_baselines':
        return ['qty_unrestricted', 'qty_in_quality_inspection', 'qty_blocked', 
                'qty_in_transit', 'moving_average_price'];
      case 'vendors':
        return ['vendor_name', 'is_active', 'is_blocked_for_purchasing', 'city', 'country_code'];
      default:
        return [];
    }
  }

  private detectConflict(entityType: string, local: any, erp: any, diff: any): string | null {
    const localModifiedAt = new Date(local.updated_at || local.last_synced_at || 0);
    const erpChangedAt = new Date(erp.erp_last_changed_at || erp.last_updated || Date.now());
    const lastSyncAt = new Date(local.last_synced_at || 0);
    
    if (localModifiedAt > lastSyncAt && erpChangedAt > lastSyncAt) {
      return `Local modified at ${localModifiedAt.toISOString()}, ERP changed at ${erpChangedAt.toISOString()}`;
    }
    
    if (entityType === 'material_master' && erp.erp_deletion_flag && !local.erp_deletion_flag) {
      return 'ERP flagged for deletion but local has active record';
    }
    
    return null;
  }

  // ==================== APPLY CHANGES ====================

  private async applyChanges(
    job: SyncJob,
    entityType: string,
    comparison: ComparisonResult
  ): Promise<{ inserted: number; updated: number; failed: number; unchanged: number; errorMessages: string[] }> {
    let inserted = 0;
    let updated = 0;
    let failed = 0;
    const errorMessages: string[] = [];

    // 1. Handle Inserts
    for (const record of comparison.toInsert) {
      try {
        await this.insertRecord(job.tenantId, job.erpConfigId, entityType, record);
        inserted++;
        await this.audit.log(job.tenantId, job.erpConfigId, entityType, null, record.sku || record.vendor_code || record.erp_plant, 'INSERT', null, record, job.triggeredBy, job.userId);
      } catch (error) {
        failed++;
        errorMessages.push(`Insert failed for ${record.sku || record.vendor_code}: ${(error as Error).message}`);
      }
    }

    // 2. Handle Updates
    for (const { local, erp, diff } of comparison.toUpdate) {
      try {
        const resolution = await this.conflictResolver.resolve(local, erp, diff, job.triggeredBy);
        await this.updateRecord(job.tenantId, job.erpConfigId, entityType, local.id, resolution.merged);
        updated++;
        
        if (resolution.hadConflict) {
          await this.audit.log(job.tenantId, job.erpConfigId, entityType, local.id, erp.sku || erp.vendor_code || erp.erp_plant, 'CONFLICT', local, resolution.merged, job.triggeredBy, job.userId, resolution.strategy, resolution.reason);
        } else {
          await this.audit.log(job.tenantId, job.erpConfigId, entityType, local.id, erp.sku || erp.vendor_code || erp.erp_plant, 'UPDATE', local, resolution.merged, job.triggeredBy, job.userId);
        }
      } catch (error) {
        failed++;
        errorMessages.push(`Update failed for ${erp.sku || erp.vendor_code}: ${(error as Error).message}`);
      }
    }

    return { inserted, updated, failed, unchanged: comparison.unchanged.length, errorMessages };
  }

  private async insertRecord(tenantId: string, erpConfigId: string, entityType: string, record: any) {
    const table = this.getTableName(entityType);
    const mapped = await this.mapERPToLocal(entityType, record, tenantId, erpConfigId);
    
    const { error } = await this.supabase.from(table).insert(mapped);
    if (error) throw error;
  }

  private async updateRecord(tenantId: string, erpConfigId: string, entityType: string, id: string, updates: any) {
    const table = this.getTableName(entityType);
    
    const { error } = await this.supabase
      .from(table)
      .update({
        ...updates,
        last_synced_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    
    if (error) throw error;
  }

  private getTableName(entityType: string): string {
    const map: Record<string, string> = {
      'material_master': 'material_master',
      'vendors': 'vendor_master',
      'stock_baselines': 'stock_baselines',
      'purchase_orders': 'purchase_orders'
    };
    return map[entityType] || entityType;
  }

  private async mapERPToLocal(entityType: string, erp: any, tenantId: string, erpConfigId: string): Promise<any> {
    const now = new Date().toISOString();
    
    switch (entityType) {
      case 'material_master':
        return {
          tenant_id: tenantId,
          erp_config_id: erpConfigId,
          sku: erp.sku,
          erp_material_number: erp.erp_material_number || erp.sku,
          description: erp.description,
          material_group: erp.material_group,
          base_uom: erp.base_uom || 'EA',
          sales_uom: erp.sales_uom || 'EA',
          ean_gtin: erp.ean_gtin,
          is_active: erp.is_active !== false,
          shelf_life_days: erp.shelf_life_days,
          rounding_value: erp.rounding_value || 1,
          min_order_qty: erp.min_order_qty || 1,
          standard_price: erp.standard_price,
          last_synced_at: now,
          erp_last_changed_at: erp.last_updated || now
        };
      
      case 'vendors':
        return {
          tenant_id: tenantId,
          erp_config_id: erpConfigId,
          vendor_code: erp.vendor_code,
          vendor_name: erp.vendor_name,
          currency: erp.currency || 'EUR',
          is_active: erp.is_active !== false,
          last_synced_at: now,
          erp_last_changed_at: erp.last_updated || now
        };

      case 'stock_baselines': {
        // Resolve material_id by matching SKU in material_master
        let materialId = erp.material_id;
        if (!materialId) {
          const { data: mat } = await this.supabase
            .from('material_master')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('sku', erp.sku)
            .maybeSingle();
          
          materialId = mat?.id;
        }

        // Resolve store_id if needed
        let storeId = erp.store_id;
        if (!storeId || storeId.length < 30) { // Not UUID
          const { data: st } = await this.supabase
            .from('stores')
            .select('id')
            .eq('tenant_id', tenantId)
            .limit(1)
            .maybeSingle();
          storeId = st?.id;
        }

        return {
          tenant_id: tenantId,
          store_id: storeId,
          erp_config_id: erpConfigId,
          material_id: materialId,
          erp_plant: erp.erp_plant || '1001',
          erp_storage_location: erp.erp_storage_location || '0001',
          qty_unrestricted: erp.quantity_unrestricted || 0,
          qty_in_quality_inspection: erp.quantity_in_quality_inspection || 0,
          qty_blocked: erp.quantity_blocked || 0,
          qty_in_transit: erp.quantity_in_transit || 0,
          uom: erp.uom || 'EA',
          last_synced_at: now,
          erp_last_changed_at: erp.last_updated || now
        };
      }
      
      default:
        return { ...erp, tenant_id: tenantId, erp_config_id: erpConfigId, last_synced_at: now };
    }
  }

  // ==================== HEALTH UPDATE ====================

  private async updateERPHealth(tenantId: string, erpConfigId: string, results: SyncResult[]) {
    const allSuccess = results.every(r => r.status === 'success');
    const anyFailed = results.some(r => r.status === 'failed');
    
    const status = anyFailed ? 'error' : (allSuccess ? 'active' : 'inactive');
    const lastSync = new Date().toISOString();
    
    await this.supabase
      .from('erp_configurations')
      .update({
        connection_status: status,
        last_sync_at: lastSync,
        last_error_message: anyFailed ? results.find(r => r.status === 'failed')?.errors[0] : null
      })
      .eq('id', erpConfigId)
      .eq('tenant_id', tenantId);
  }
}

interface ComparisonResult {
  toInsert: any[];
  toUpdate: any[];
  unchanged: any[];
  conflicts: Array<{ local: any; erp: any; reason: string }>;
}
