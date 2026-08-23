// /tools/demo-data/seed-pilot-demo.ts
// SmartStock LiveRetail V2 — Seed Script for Pilot Demonstration Storyboard (RC1)

import { createClient } from '@supabase/supabase-js';

export async function seedPilotDemoDataset(supabaseUrl?: string, serviceRoleKey?: string) {
  const url = supabaseUrl || process.env.SUPABASE_URL || 'http://localhost:54321';
  const key = serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';
  const supabase = createClient(url, key);

  const tenantId = 'default-tenant';
  const locationId = '1002'; // Amsterdam Flagship
  const materialId = 'MAT-33104'; // Lavazza Espresso 1kg

  console.log(`[seed-pilot-demo] Seeding demonstration narrative for ${materialId} at store ${locationId}...`);

  // 1. Initial Position
  await supabase.from('inventory_position').upsert({
    tenant_id: tenantId,
    location_id: locationId,
    material_id: materialId,
    sku: materialId,
    product_name: 'Lavazza Espresso Crema 1kg',
    uom: 'PC',
    erp_checkpoint_qty: 24,
    estimated_on_hand: 20,
    sellable_qty: 20,
    reserved_qty: 0,
    in_transit_qty: 0,
    confidence_score: 99,
    reconciliation_status: 'MATCHED',
    projection_version: 22,
    checkpoint_watermark: new Date().toISOString(),
    checkpoint_source_watermarks: { 'POS__1002': 184200 },
    updated_at: new Date().toISOString(),
  });

  // 2. Demonstration Reconciliation Record
  await supabase.from('inventory_reconciliations').insert({
    tenant_id: tenantId,
    location_id: locationId,
    sku: materialId,
    expected_qty: 20,
    sap_qty: 20,
    total_variance: 0,
    explained_variance: 0,
    unexplained_variance: 0,
    status: 'MATCHED',
    created_at: new Date().toISOString(),
  });

  console.log('[seed-pilot-demo] Pilot demonstration seeded successfully!');
}
