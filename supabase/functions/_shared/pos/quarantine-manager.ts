// /supabase/functions/_shared/pos/quarantine-manager.ts
// SmartStock LiveRetail V2 — Identity, UOM & Location Quarantine Store

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CanonicalPOSTransaction } from './canonical-schema.ts';

export type QuarantineType =
  | 'PRODUCT_MAPPING_REQUIRED'
  | 'LOCATION_MAPPING_REQUIRED'
  | 'UOM_MAPPING_REQUIRED';

export class POSQuarantineManager {
  /**
   * Records an unresolved identity into pos_identity_quarantine and stores the event.
   */
  static async quarantineEvent(
    supabase: SupabaseClient,
    tenantId: string,
    posConfigId: string,
    quarantineType: QuarantineType,
    externalId: string,
    sourceSystem: string,
    transaction: CanonicalPOSTransaction
  ): Promise<string> {
    // 1. Upsert into pos_identity_quarantine
    const { data: qRecord } = await supabase
      .from('pos_identity_quarantine')
      .select('id, occurrence_count')
      .eq('tenant_id', tenantId)
      .eq('source_system', sourceSystem)
      .eq('quarantine_type', quarantineType)
      .eq('external_id', externalId)
      .maybeSingle();

    let quarantineId = qRecord?.id;

    if (qRecord) {
      await supabase
        .from('pos_identity_quarantine')
        .update({
          occurrence_count: (qRecord.occurrence_count || 1) + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', qRecord.id);
    } else {
      const { data: newQ } = await supabase
        .from('pos_identity_quarantine')
        .insert({
          tenant_id: tenantId,
          pos_config_id: posConfigId,
          quarantine_type: quarantineType,
          external_id: externalId,
          source_system: sourceSystem,
          occurrence_count: 1,
          status: 'PENDING',
        })
        .select('id')
        .single();
      quarantineId = newQ?.id;
    }

    // 2. Store the transaction in pos_quarantined_events for safe replay
    await supabase.from('pos_quarantined_events').insert({
      tenant_id: tenantId,
      pos_config_id: posConfigId,
      quarantine_id: quarantineId,
      source_transaction_id: transaction.source_transaction_id,
      raw_transaction: transaction,
      replay_status: 'PENDING',
    });

    return quarantineId || '';
  }
}
