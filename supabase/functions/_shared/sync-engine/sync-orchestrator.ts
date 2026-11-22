// /supabase/functions/_shared/sync-engine/sync-orchestrator.ts

import { IERPAdapter, MaterialMaster, StockBaseline, VendorInfo } from '../erp-adapter/types.ts';
import { DeltaTracker } from './delta-tracker.ts';
import { ConflictResolver, MergeStrategy } from './conflict-resolver.ts';
import { SyncAudit } from './sync-audit.ts';

/**
 * PostgreSQL accepts any 8-4-4-4-12 hex string for a `uuid` column. Anything
 * else (e.g. the legacy string tenant id "default-tenant") must never be sent
 * to a UUID `tenant_id` column: it would fail with an opaque Postgres cast
 * error instead of an actionable message.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Upper bound on concurrent per-store stock baseline fetches. */
const STOCK_FETCH_CONCURRENCY = 5;

/** Keeps generated PostgREST `.in()` URLs bounded for large catalogs. */
const BULK_SELECT_CHUNK = 200;

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
        
        try {
          await this.deltaTracker.failSync(
            job.tenantId,
            job.erpConfigId,
            entityType,
            (error as Error).message
          );
        } catch (trackingError) {
          // A non-UUID tenant cannot be written to sync_state either; never let
          // bookkeeping hide the real sync error.
          console.warn('[SyncOrchestrator] failSync warning:', (trackingError as Error).message);
        }

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

    // erp_configurations.tenant_id is a UUID column too. Skip the health write
    // for non-UUID tenants rather than emitting a cryptic Postgres cast error.
    if (!UUID_PATTERN.test(job.tenantId)) {
      console.warn(`[SyncOrchestrator] Skipping ERP health update for non-UUID tenantId "${job.tenantId}"`);
      return results;
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

        const mappedStores = stores || [];
        if (mappedStores.length === 0) return [];

        // Bounded parallelism: at most STOCK_FETCH_CONCURRENCY stores are in
        // flight at once. Results are written back by store index, so the
        // concatenated order is identical to the original sequential loop.
        const baselinesByStore: StockBaseline[][] = Array.from(
          { length: mappedStores.length },
          () => [] as StockBaseline[]
        );
        const storeFailures: string[] = [];
        let nextStore = 0;

        const worker = async (): Promise<void> => {
          while (true) {
            const index = nextStore++;
            if (index >= mappedStores.length) return;

            const store = mappedStores[index];
            try {
              baselinesByStore[index] = await this.adapter.fetchStockBaselines(store.store_id);
            } catch (error) {
              // Isolate the failure: the remaining stores keep being fetched.
              storeFailures.push(`store ${store.store_id}: ${(error as Error).message}`);
              baselinesByStore[index] = [];
            }
          }
        };

        const workerCount = Math.min(STOCK_FETCH_CONCURRENCY, mappedStores.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        if (storeFailures.length > 0) {
          // Preserve the fail-closed semantics of the old sequential loop, but
          // only after every other store has been attempted.
          throw new Error(
            `Stock baseline fetch failed for ${storeFailures.length} of ${mappedStores.length} store(s): ${storeFailures.join('; ')}`
          );
        }

        return baselinesByStore.flat();
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
    // One bulk read (per related table) instead of one query per ERP record.
    const lookup = await this.buildLookupContext(tenantId, erpConfigId, entityType, erpRecords);

    const toInsert: any[] = [];
    const toUpdate: any[] = [];
    const unchanged: any[] = [];
    const conflicts: Array<{ local: any; erp: any; reason: string }> = [];

    for (const erpRecord of erpRecords) {
      const localRecord = lookup.localByKey.get(this.localRecordKey(entityType, erpRecord)) || null;

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

    return { toInsert, toUpdate, unchanged, conflicts, lookup };
  }

  /**
   * Loads local rows in bulk and indexes them by the exact key the former
   * per-record `findLocalRecord()` lookup used, so insert/update/conflict
   * decisions are unchanged.
   */
  private async buildLookupContext(
    tenantId: string,
    erpConfigId: string,
    entityType: string,
    erpRecords: any[]
  ): Promise<LookupContext> {
    const lookup: LookupContext = {
      localByKey: new Map<string, any>(),
      materialIdBySku: new Map<string, string>(),
      defaultStoreId: undefined
    };

    switch (entityType) {
      case 'material_master': {
        const rows = await this.bulkSelectByKeys(
          'material_master', tenantId, erpConfigId, 'sku', erpRecords.map(r => r.sku)
        );
        for (const row of rows) {
          const key = this.localRecordKey(entityType, row);
          if (!lookup.localByKey.has(key)) lookup.localByKey.set(key, row);
          if (row.sku != null && !lookup.materialIdBySku.has(String(row.sku))) {
            lookup.materialIdBySku.set(String(row.sku), row.id);
          }
        }
        break;
      }

      case 'vendors': {
        const rows = await this.bulkSelectByKeys(
          'vendor_master', tenantId, erpConfigId, 'vendor_code', erpRecords.map(r => r.vendor_code)
        );
        for (const row of rows) {
          const key = this.localRecordKey(entityType, row);
          if (!lookup.localByKey.has(key)) lookup.localByKey.set(key, row);
        }
        break;
      }

      case 'stock_baselines': {
        const baselines = await this.bulkSelectByKeys(
          'stock_baselines', tenantId, erpConfigId, 'erp_plant', erpRecords.map(r => r.erp_plant)
        );
        for (const row of baselines) {
          const key = this.localRecordKey(entityType, row);
          if (!lookup.localByKey.has(key)) lookup.localByKey.set(key, row);
        }

        // Material ids were resolved with one query per ERP row before; now a
        // single key-scoped read serves the whole batch.
        const materials = await this.bulkSelectByKeys(
          'material_master', tenantId, erpConfigId, 'sku', erpRecords.map(r => r.sku)
        );
        for (const row of materials) {
          if (row.sku != null && !lookup.materialIdBySku.has(String(row.sku))) {
            lookup.materialIdBySku.set(String(row.sku), row.id);
          }
        }

        // The old code selected the first store once per ERP record. One read
        // for the whole sync is enough.
        const { data: store } = await this.supabase
          .from('stores')
          .select('id')
          .eq('tenant_id', tenantId)
          .limit(1)
          .maybeSingle();
        lookup.defaultStoreId = store?.id;
        break;
      }

      default:
        // Unknown entity types were never matched locally before either.
        break;
    }

    return lookup;
  }

  private async bulkSelectByKeys(
    table: string,
    tenantId: string,
    erpConfigId: string,
    column: string,
    keys: any[]
  ): Promise<any[]> {
    const uniqueKeys = [...new Set(
      keys.filter(k => k !== undefined && k !== null && k !== '').map(String)
    )];
    if (uniqueKeys.length === 0) return [];

    const rows: any[] = [];
    for (let i = 0; i < uniqueKeys.length; i += BULK_SELECT_CHUNK) {
      const chunk = uniqueKeys.slice(i, i + BULK_SELECT_CHUNK);
      const { data, error } = await this.supabase
        .from(table)
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('erp_config_id', erpConfigId)
        .in(column, chunk);

      if (error) {
        console.warn(`[SyncOrchestrator] bulk select from ${table} warning:`, error.message);
        continue;
      }
      if (data) rows.push(...data);
    }
    return rows;
  }

  /** The key used by the former per-record findLocalRecord() lookup. */
  private localRecordKey(entityType: string, record: any): string {
    switch (entityType) {
      case 'material_master':
        return `sku:${record.sku}`;
      case 'vendors':
        return `vendor:${record.vendor_code}`;
      case 'stock_baselines':
        return `plant:${record.erp_plant}|loc:${record.erp_storage_location}`;
      default:
        return '';
    }
  }

  /** Fail closed instead of sending a non-UUID value to a UUID tenant_id column. */
  private assertUuidTenant(tenantId: string, entityType: string): void {
    const table = this.getTableName(entityType);
    if (!UUID_PATTERN.test(tenantId)) {
      throw new Error(
        `Refusing to write ${table}: tenant_id is a UUID column but tenantId "${tenantId}" is not a valid UUID`
      );
    }
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
        await this.insertRecord(job.tenantId, job.erpConfigId, entityType, record, comparison.lookup);
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

  private async insertRecord(
    tenantId: string,
    erpConfigId: string,
    entityType: string,
    record: any,
    lookup: LookupContext
  ) {
    this.assertUuidTenant(tenantId, entityType);
    const table = this.getTableName(entityType);
    const mapped = await this.mapERPToLocal(entityType, record, tenantId, erpConfigId, lookup);
    
    const { error } = await this.supabase.from(table).insert(mapped);
    if (error) throw error;
  }

  private async updateRecord(tenantId: string, erpConfigId: string, entityType: string, id: string, updates: any) {
    this.assertUuidTenant(tenantId, entityType);
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

  private async mapERPToLocal(
    entityType: string,
    erp: any,
    tenantId: string,
    erpConfigId: string,
    lookup: LookupContext
  ): Promise<any> {
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
        // A missing plant must fail the row, never be fabricated. Attributing
        // stock to a made-up plant is worse than dropping the record.
        if (!erp.erp_plant) {
          throw new Error(
            `ERP record for SKU "${erp.sku}" (store ${erp.store_id}) has no erp_plant; refusing to fabricate a plant`
          );
        }

        // Resolve material_id / store_id from the maps built once per sync,
        // instead of issuing one query per ERP record.
        const materialId = erp.material_id || lookup.materialIdBySku.get(String(erp.sku));

        let storeId = erp.store_id;
        if (!storeId || String(storeId).length < 30) { // Not a UUID
          storeId = lookup.defaultStoreId;
        }

        return {
          tenant_id: tenantId,
          store_id: storeId,
          erp_config_id: erpConfigId,
          material_id: materialId,
          erp_plant: erp.erp_plant,
          erp_storage_location: erp.erp_storage_location,
          qty_unrestricted: erp.quantity_unrestricted || 0,
          qty_in_quality_inspection: erp.quantity_in_quality_inspection || 0,
          qty_blocked: erp.quantity_blocked || 0,
          qty_in_transit: erp.quantity_in_transit || 0,
          uom: erp.uom,
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

interface LookupContext {
  /** Existing local rows keyed by the former per-record lookup key. */
  localByKey: Map<string, any>;
  /** material_master.id by sku, for stock baseline material resolution. */
  materialIdBySku: Map<string, string>;
  /** First store for the tenant, for stock rows without a valid store id. */
  defaultStoreId?: string;
}

interface ComparisonResult {
  toInsert: any[];
  toUpdate: any[];
  unchanged: any[];
  conflicts: Array<{ local: any; erp: any; reason: string }>;
  lookup: LookupContext;
}
