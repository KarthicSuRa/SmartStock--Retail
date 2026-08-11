// /supabase/functions/_shared/sync-engine/sync-audit.ts

export class SyncAudit {
  constructor(private supabase: any) {}

  async log(
    tenantId: string,
    erpConfigId: string,
    entityType: string,
    entityId: string | null,
    erpKey: string,
    action: string,
    oldValues: any,
    newValues: any,
    processedBy: string,
    userId?: string,
    conflictStrategy?: string,
    conflictReason?: string
  ) {
    const { error } = await this.supabase.from('sync_audit_log').insert({
      tenant_id: tenantId,
      erp_config_id: erpConfigId,
      entity_type: entityType,
      entity_id: entityId,
      erp_key: erpKey,
      action,
      old_values: oldValues,
      new_values: newValues,
      processed_by: userId || processedBy,
      conflict_strategy: conflictStrategy,
      conflict_reason: conflictReason,
      requires_review: action === 'CONFLICT' && conflictStrategy === 'manual_review'
    });

    if (error) {
      console.error('[SyncAudit] Audit log insert failed:', error.message);
    }
  }
}
