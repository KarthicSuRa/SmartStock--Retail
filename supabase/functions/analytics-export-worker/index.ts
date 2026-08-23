// /supabase/functions/analytics-export-worker/index.ts
// SmartStock Intelligence & Analytics V1 — Incremental Export Worker

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PostgresAnalyticsSink } from '../_shared/analytics/analytics-sink.ts';
import { FactInventoryMovement, FactOperationalCase } from '../_shared/analytics/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

serve(async (req) => {
  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sink = new PostgresAnalyticsSink(supabase);

  try {
    // 1. Fetch Watermarks
    const { data: watermarks } = await supabase
      .schema('analytics')
      .from('analytics_export_watermark')
      .select('*');

    const eventWatermark = watermarks?.find((w) => w.entity_name === 'inventory_events');
    const lastEventTime = eventWatermark?.last_processed_timestamp || '1970-01-01T00:00:00Z';

    // 2. Fetch new operational events after watermark
    const { data: newEvents } = await supabase
      .from('inventory_event_ledger')
      .select('*')
      .gt('created_at', lastEventTime)
      .order('created_at', { ascending: true })
      .limit(500);

    let exportedEventsCount = 0;

    if (newEvents && newEvents.length > 0) {
      const latestEvent = newEvents[newEvents.length - 1];

      // Transform events into star schema facts
      const movementFacts: FactInventoryMovement[] = newEvents.map((evt) => {
        const d = new Date(evt.created_at || evt.business_timestamp);
        const timeKey = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

        return {
          time_key: timeKey,
          tenant_id: evt.tenant_id,
          store_key: 1, // Looked up or default
          product_key: 1,
          reason_key: 1,
          event_id: evt.id,
          event_type: evt.event_type,
          quantity_delta: evt.quantity_delta,
          financial_delta_eur: Number((evt.quantity_delta * 10.0).toFixed(2)),
          source_system: evt.source_system || 'POS',
          business_timestamp: evt.business_timestamp,
          ingested_at: evt.created_at,
        };
      });

      await sink.publishFacts('fact_inventory_movement', movementFacts as any);
      exportedEventsCount = movementFacts.length;

      // Update watermark
      await supabase
        .schema('analytics')
        .from('analytics_export_watermark')
        .update({
          last_processed_timestamp: latestEvent.created_at,
          last_processed_id: latestEvent.id,
          records_exported_total: (eventWatermark?.records_exported_total || 0) + exportedEventsCount,
          last_batch_duration_ms: Date.now() - startTime,
          updated_at: new Date().toISOString(),
        })
        .eq('entity_name', 'inventory_events');
    }

    return new Response(
      JSON.stringify({
        success: true,
        exportedEventsCount,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    console.error('[analytics-export-worker] Export cycle failed:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message, durationMs: Date.now() - startTime }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
