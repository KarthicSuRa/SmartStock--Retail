// /supabase/functions/fefo-recommendations/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withResilienceHandler, corsHeaders } from '../_shared/middleware/resilience.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve((req) => withResilienceHandler(req, async (r) => {
  const { tenant_id, store_id } = await r.json();

  const { data: recommendations, error } = await supabase
    .from('fefo_transfer_recommendations')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('source_store_id', store_id)
    .limit(20);

  if (error) throw error;

  const grouped = (recommendations || []).reduce((acc: any, item: any) => {
    if (!acc[item.sku]) acc[item.sku] = { ...item, targets: [] };
    acc[item.sku].targets.push({
      store_id: item.target_store_id,
      store_name: item.target_store_name,
      transfer_qty: item.suggested_transfer_qty,
      absorption: item.target_absorption_capacity,
    });
    return acc;
  }, {});

  return new Response(JSON.stringify({
    count: recommendations?.length || 0,
    total_value_at_risk: recommendations?.reduce((sum: number, r: any) => sum + (r.value_at_risk || 0), 0),
    items: Object.values(grouped),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
}));
