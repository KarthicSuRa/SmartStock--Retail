// /supabase/functions/_shared/execution/gr-matcher.ts

export class GoodsReceiptMatcher {
  constructor(private supabase: any) {}

  async matchIncomingGR(gr: any): Promise<{ matched: boolean; stagedPrId?: string; variance?: number }> {
    // 1. Find staged PR matching PO number and SKU
    const { data: stagedPr } = await this.supabase
      .from('staged_prs')
      .select('id, qty_rounded, uom, status, material_id, store_id')
      .eq('tenant_id', gr.tenant_id)
      .eq('erp_po_number', gr.erp_po_number)
      .eq('sku', gr.sku)
      .maybeSingle();

    if (!stagedPr) {
      return { matched: false };
    }

    // 2. Calculate variance
    const variance = gr.quantity_received - (stagedPr.qty_rounded || 0);
    
    let matchingStatus = 'matched';
    if (Math.abs(variance) > 0.01) {
      matchingStatus = variance > 0 ? 'over_received' : 'under_received';
    }

    // 3. Insert goods_receipts record
    await this.supabase.from('goods_receipts').upsert({
      tenant_id: gr.tenant_id,
      erp_config_id: gr.erp_config_id,
      erp_gr_number: gr.erp_gr_number,
      erp_gr_year: gr.erp_gr_year || new Date().getFullYear().toString(),
      erp_po_number: gr.erp_po_number,
      erp_po_item: gr.erp_po_item || '00010',
      material_id: stagedPr.material_id,
      store_id: stagedPr.store_id,
      erp_plant: gr.erp_plant,
      erp_storage_location: gr.erp_storage_location,
      quantity_received: gr.quantity_received,
      uom: gr.uom || 'EA',
      batch_number: gr.batch_number,
      expiry_date: gr.expiry_date,
      matching_status: matchingStatus,
      matched_staged_pr_id: stagedPr.id,
      expected_qty: stagedPr.qty_rounded,
      variance_qty: variance,
      posted_at: gr.posted_at || new Date().toISOString()
    }, { onConflict: 'tenant_id,erp_gr_number,erp_gr_year,material_id' });

    // 4. Mark staged PR completed
    await this.supabase.from('staged_prs').update({
      status: 'completed',
      erp_document_status: `GR_POSTED: ${gr.erp_gr_number}`
    }).eq('id', stagedPr.id);

    // 5. Record lead time observation
    await this.recordLeadTime(stagedPr.id, gr);

    // 6. Refresh stock baseline timestamp
    await this.supabase.rpc('refresh_store_baseline', {
      p_tenant_id: gr.tenant_id,
      p_store_id: stagedPr.store_id,
      p_material_id: stagedPr.material_id
    });

    return { matched: true, stagedPrId: stagedPr.id, variance };
  }

  private async recordLeadTime(stagedPrId: string, gr: any) {
    const { data: pr } = await this.supabase
      .from('staged_prs')
      .select('created_at, vendor_id, qty_rounded, material_id, store_id')
      .eq('id', stagedPrId)
      .single();

    if (!pr) return;

    const orderDate = new Date(pr.created_at);
    const deliveryDate = new Date(gr.posted_at || Date.now());
    const actualLeadDays = Math.max(1, Math.ceil((deliveryDate.getTime() - orderDate.getTime()) / 86400000));

    const { data: vendorStats } = await this.supabase
      .from('vendor_lead_time_stats')
      .select('avg_promised_days')
      .eq('vendor_id', pr.vendor_id)
      .eq('material_id', pr.material_id)
      .maybeSingle();

    const promisedDays = vendorStats?.avg_promised_days || 7;

    await this.supabase.from('lead_time_actuals').insert({
      tenant_id: gr.tenant_id,
      material_id: pr.material_id,
      vendor_id: pr.vendor_id,
      store_id: pr.store_id,
      staged_pr_id: stagedPrId,
      erp_po_number: gr.erp_po_number,
      qty_ordered: pr.qty_rounded,
      order_submitted_at: pr.created_at,
      vendor_promised_date: new Date(orderDate.getTime() + promisedDays * 86400000).toISOString().split('T')[0],
      actual_delivery_date: deliveryDate.toISOString().split('T')[0],
      gr_posted_at: gr.posted_at || new Date().toISOString(),
      promised_lead_days: promisedDays,
      actual_lead_days: actualLeadDays,
      drift_days: actualLeadDays - promisedDays,
      drift_pct: promisedDays > 0 ? ((actualLeadDays - promisedDays) / promisedDays) * 100 : 0
    });
  }
}
