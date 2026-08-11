// /supabase/functions/_shared/sync-engine/delta-tracker.ts

export class DeltaTracker {
  constructor(private supabase: any) {}

  async startSync(tenantId: string, erpConfigId: string, entityType: string) {
    const { error } = await this.supabase.from('sync_state').upsert({
      tenant_id: tenantId,
      erp_config_id: erpConfigId,
      entity_type: entityType,
      status: 'running',
      last_sync_at: new Date().toISOString(),
      records_processed: 0,
      records_inserted: 0,
      records_updated: 0,
      records_failed: 0
    }, { onConflict: 'tenant_id,erp_config_id,entity_type' });

    if (error) console.warn('[DeltaTracker] startSync warning:', error.message);
  }

  async getSyncWindow(
    tenantId: string, 
    erpConfigId: string, 
    entityType: string,
    mode: 'full' | 'delta' | 'reconciliation'
  ): Promise<{ since?: string; cursor?: string; erpConfigId: string }> {
    if (mode === 'full') {
      return { erpConfigId }; // No filter = full fetch
    }

    // Delta mode: get last successful sync timestamp
    const { data, error } = await this.supabase
      .from('sync_state')
      .select('last_record_timestamp, last_sync_token')
      .eq('tenant_id', tenantId)
      .eq('erp_config_id', erpConfigId)
      .eq('entity_type', entityType)
      .eq('status', 'success')
      .maybeSingle();

    if (error || !data || !data.last_record_timestamp) {
      // No previous successful sync - fallback to 7 days ago
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      return { since: sevenDaysAgo, erpConfigId };
    }

    return {
      since: data.last_record_timestamp,
      cursor: data.last_sync_token,
      erpConfigId
    };
  }

  async completeSync(
    tenantId: string,
    erpConfigId: string,
    entityType: string,
    result: { inserted: number; updated: number; failed: number; unchanged: number },
    lastRecordTimestamp?: string
  ) {
    const { error } = await this.supabase.from('sync_state').upsert({
      tenant_id: tenantId,
      erp_config_id: erpConfigId,
      entity_type: entityType,
      status: result.failed > 0 ? 'partial' : 'success',
      last_sync_at: new Date().toISOString(),
      last_record_timestamp: lastRecordTimestamp || new Date().toISOString(),
      records_processed: result.inserted + result.updated + result.failed + result.unchanged,
      records_inserted: result.inserted,
      records_updated: result.updated,
      records_failed: result.failed,
      records_unchanged: result.unchanged
    }, { onConflict: 'tenant_id,erp_config_id,entity_type' });

    if (error) console.warn('[DeltaTracker] completeSync warning:', error.message);
  }

  async failSync(tenantId: string, erpConfigId: string, entityType: string, errorMessage: string) {
    await this.supabase.from('sync_state').upsert({
      tenant_id: tenantId,
      erp_config_id: erpConfigId,
      entity_type: entityType,
      status: 'failed',
      last_sync_at: new Date().toISOString(),
      error_message: errorMessage
    }, { onConflict: 'tenant_id,erp_config_id,entity_type' });
  }
}
