// /supabase/functions/_shared/execution/dead-letter-queue.ts

export class DeadLetterQueue {
  constructor(private supabase: any) {}

  async enqueue(
    batchId: string,
    stagedPrId: string,
    entityType: string,
    payload: any,
    error: string,
    category: string,
    retryHistory: any[]
  ): Promise<void> {
    await this.supabase.from('dead_letter_queue').insert({
      tenant_id: payload.tenant_id || payload.tenantId || 'default-tenant',
      original_batch_id: batchId,
      original_staged_pr_id: stagedPrId,
      erp_entity_type: entityType,
      erp_payload: payload,
      final_error: error,
      error_category: category,
      retry_history: retryHistory,
      status: 'open'
    });

    if (stagedPrId) {
      await this.supabase.from('staged_prs').update({
        status: 'rejected',
        erp_document_status: `DEAD_LETTER: ${category}`
      }).eq('id', stagedPrId);
    }
  }

  async requeue(dlqId: string, userId: string): Promise<{ newBatchId: string }> {
    const { data: dlqItem, error } = await this.supabase
      .from('dead_letter_queue')
      .select('*')
      .eq('id', dlqId)
      .single();

    if (error || !dlqItem) throw new Error('DLQ item not found');

    if (dlqItem.original_staged_pr_id) {
      await this.supabase.from('staged_prs').update({
        status: 'approved',
        erp_document_status: null
      }).eq('id', dlqItem.original_staged_pr_id);
    }

    await this.supabase.from('dead_letter_queue').update({
      status: 'requeued',
      resolved_by: userId,
      resolved_at: new Date().toISOString()
    }).eq('id', dlqId);

    return { newBatchId: dlqItem.original_batch_id };
  }

  async reject(dlqId: string, userId: string, notes: string): Promise<void> {
    await this.supabase.from('dead_letter_queue').update({
      status: 'rejected',
      resolution_notes: notes,
      resolved_by: userId,
      resolved_at: new Date().toISOString()
    }).eq('id', dlqId);
  }
}
