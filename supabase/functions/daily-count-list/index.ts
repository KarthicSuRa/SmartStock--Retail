// /supabase/functions/daily-count-list/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withResilienceHandler, corsHeaders } from '../_shared/middleware/resilience.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve((req) => withResilienceHandler(req, async (r) => {
  const { tenant_id, store_id, limit = 15 } = await r.json();

  const { data: recommendations, error } = await supabase
    .from('daily_count_recommendations')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('store_id', store_id)
    .in('recommendation', ['COUNT_TODAY', 'COUNT_THIS_WEEK'])
    .order('priority_score', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const today = new Date().toISOString().split('T')[0];
  const materialIds = recommendations?.map(rec => rec.material_id) || [];
  
  let alreadyCounted: any[] = [];
  if (materialIds.length > 0) {
    const { data } = await supabase
      .from('physical_counts')
      .select('material_id')
      .eq('tenant_id', tenant_id)
      .eq('store_id', store_id)
      .in('material_id', materialIds)
      .gte('counted_at', `${today}T00:00:00`);
    alreadyCounted = data || [];
  }

  const countedSet = new Set(alreadyCounted.map(c => c.material_id));
  const filtered = recommendations?.filter(rec => !countedSet.has(rec.material_id)) || [];

  return new Response(JSON.stringify({
    date: today,
    total_recommended: recommendations?.length || 0,
    remaining: filtered.length,
    items: filtered.map(item => ({
      material_id: item.material_id,
      sku: item.sku,
      description: item.description,
      current_stock: item.current_calculated_stock,
      priority_score: item.priority_score,
      reason: item.last_variance_abs_pct > 10 
        ? `Last count had ${item.last_variance_abs_pct.toFixed(0)}% variance`
        : item.abc_class === 'A' 
        ? 'High-value item - weekly count required'
        : 'Overdue for count',
      abc_class: item.abc_class,
      days_since_last_count: item.days_since_last_count,
    }))
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
}));
