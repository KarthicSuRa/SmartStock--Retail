// /supabase/functions/morning-brief/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withResilienceHandler, corsHeaders } from '../_shared/middleware/resilience.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const TWILIO_SID = Deno.env.get('TWILIO_SID');
const TWILIO_TOKEN = Deno.env.get('TWILIO_TOKEN');
const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE');

Deno.serve((req) => withResilienceHandler(req, async () => {
  const { data: stores, error: storeError } = await supabase
    .from('stores')
    .select('id, name, tenant_id, timezone, manager_phone, manager_name')
    .eq('is_active', true);

  if (storeError) throw storeError;

  const results = [];

  for (const store of stores || []) {
    const brief = await generateBrief(store.tenant_id, store.id);
    const message = formatWhatsApp(brief, store.manager_name || 'Manager', store.name);
    
    const sent = await sendWhatsApp(store.manager_phone || '+1234567890', message);
    results.push({ store: store.name, sent, preview: message.substring(0, 120) });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200
  });
}));

async function generateBrief(tenantId: string, storeId: string) {
  const { data: critical } = await supabase
    .from('live_inventory_ledger')
    .select('sku, description, current_calculated_stock, runout_days')
    .eq('tenant_id', tenantId)
    .eq('store_id', storeId)
    .eq('stock_status', 'CRITICAL_RISK')
    .limit(5);

  const today = new Date().toISOString().split('T')[0];
  const { data: incoming } = await supabase
    .from('staged_prs')
    .select('sku, description, qty_rounded, erp_po_number, fulfillment_method')
    .eq('tenant_id', tenantId)
    .eq('store_id', storeId)
    .eq('status', 'completed')
    .gte('created_at', `${today}T00:00:00`)
    .limit(3);

  const { data: expiry } = await supabase
    .from('live_inventory_ledger')
    .select('sku, description, shelf_life_days')
    .eq('tenant_id', tenantId)
    .eq('store_id', storeId)
    .eq('stock_status', 'EXPIRY_RISK')
    .limit(3);

  return { critical: critical || [], incoming: incoming || [], expiry: expiry || [] };
}

function formatWhatsApp(brief: any, managerName: string, storeName: string): string {
  const lines = [
    `👋 Good morning ${managerName}!`,
    `📍 *${storeName}* Morning Operational Brief`,
    ``,
  ];

  if (brief.critical.length > 0) {
    lines.push(`🚨 *${brief.critical.length} Critical Stock Risks:*`);
    brief.critical.forEach((c: any) => {
      lines.push(`• ${c.description} — ${c.current_calculated_stock} units remaining (${c.runout_days ? c.runout_days.toFixed(1) : 0} days left)`);
    });
    lines.push(``);
  } else {
    lines.push(`✅ Zero critical stockouts forecasted today.`);
    lines.push(``);
  }

  if (brief.incoming.length > 0) {
    lines.push(`🚚 *Incoming Today:*`);
    brief.incoming.forEach((i: any) => {
      lines.push(`• ${i.description} — ${i.qty_rounded} units (PO: ${i.erp_po_number || 'STO'})`);
    });
    lines.push(``);
  }

  if (brief.expiry.length > 0) {
    lines.push(`⏰ *Expiry Checks:*`);
    brief.expiry.forEach((e: any) => {
      lines.push(`• ${e.description}`);
    });
    lines.push(``);
  }

  lines.push(`Launch Floor PWA: https://smartstock.app/floor`);

  return lines.join('\n');
}

async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.log('[morning-brief] Mock WhatsApp dispatch to', to, ':\n', body);
    return true;
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: `whatsapp:${TWILIO_PHONE}`,
        To: `whatsapp:${to}`,
        Body: body,
      }),
    }
  );

  return response.ok;
}
