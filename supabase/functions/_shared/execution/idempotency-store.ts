// /supabase/functions/_shared/execution/idempotency-store.ts

export class IdempotencyStore {
  constructor(private supabase: any) {}

  async generateKey(tenantId: string, type: string, items: any[]): Promise<string> {
    const itemIds = items.map(i => i.id || i.staged_pr_id).sort().join('|');
    const dateStr = new Date().toISOString().split('T')[0];
    const raw = `${tenantId}:${type}:${dateStr}:${itemIds}`;
    
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `idemp_${Math.abs(hash).toString(16)}`;
  }

  async isProcessed(key: string): Promise<{ processed: boolean; batchId?: string }> {
    const { data, error } = await this.supabase
      .from('execution_batches')
      .select('id, status')
      .eq('idempotency_key', key)
      .in('status', ['success', 'partial_success', 'running'])
      .maybeSingle();

    if (error) console.warn('[IdempotencyStore] Check warning:', error.message);
    
    return {
      processed: !!data,
      batchId: data?.id
    };
  }

  async markAsProcessed(key: string, batchId: string): Promise<void> {
    // Recorded directly via execution_batches entry
  }
}
