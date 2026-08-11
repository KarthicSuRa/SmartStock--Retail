// /supabase/functions/_shared/reorder-engine/procurement-generator.ts

import { PurchaseRequisition } from '../erp-adapter/types.ts';

export interface ProcurementInput {
  tenantId: string;
  storeId: string;
  materialId: string;
  sku: string;
  currentStock: number;
  recommendedQty: number;
  uom: string;
  fulfillmentMethod: 'STO' | 'EXTERNAL_PR' | 'EMERGENCY_PO';
  sourceStoreId?: string;
  vendorId?: string;
  alertId?: string;
  executionMode: 'BATCH' | 'IMMEDIATE';
  urgencyReason: string;
}

export class ProcurementGenerator {
  constructor(private supabase: any) {}

  async generate(input: ProcurementInput): Promise<{ stagedPrId: string; pr: Partial<PurchaseRequisition> }> {
    const {
      tenantId, storeId, materialId, sku, recommendedQty, uom,
      fulfillmentMethod, sourceStoreId, vendorId, alertId, executionMode, urgencyReason
    } = input;

    const vendorInfo = await this.resolveVendor(tenantId, materialId, vendorId);
    const roundedQty = this.applyRounding(recommendedQty, vendorInfo.roundingValue, vendorInfo.minOrderQty);
    const unitPrice = vendorInfo.contractNetPrice || 0;
    const totalPrice = roundedQty * unitPrice;

    const { data: stagedPr, error } = await this.supabase
      .from('staged_prs')
      .insert({
        tenant_id: tenantId,
        store_id: storeId,
        vendor_id: vendorInfo.vendorId,
        material_id: materialId,
        sku,
        description: vendorInfo.description,
        qty_requested: recommendedQty,
        qty_rounded: roundedQty,
        uom,
        estimated_unit_price: unitPrice,
        currency: vendorInfo.currency,
        fulfillment_method: fulfillmentMethod,
        source_store_id: sourceStoreId,
        status: executionMode === 'IMMEDIATE' ? 'approved' : 'staged',
        execution_mode: executionMode,
        urgency_reason: urgencyReason,
        alert_id: alertId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    const pr: Partial<PurchaseRequisition> = {
      pr_id: stagedPr.id,
      items: [{
        item_id: crypto.randomUUID(),
        sku,
        quantity_requested: roundedQty,
        quantity_approved: roundedQty,
        uom,
        vendor_code: vendorInfo.vendorCode,
        vendor_name: vendorInfo.vendorName,
        estimated_unit_price: unitPrice,
        estimated_total_price: totalPrice,
        delivery_date: this.calculateDeliveryDate(vendorInfo.leadTimeDays)
      }],
      requested_delivery_date: this.calculateDeliveryDate(vendorInfo.leadTimeDays),
      priority: executionMode === 'IMMEDIATE' ? 'URGENT' : 'NORMAL',
      execution_mode: executionMode,
      status: executionMode === 'IMMEDIATE' ? 'SUBMITTED' : 'STAGED',
      total_estimated_value: totalPrice,
      currency: vendorInfo.currency,
      created_by: 'SYSTEM',
      created_at: new Date().toISOString()
    };

    return { stagedPrId: stagedPr.id, pr };
  }

  private async resolveVendor(tenantId: string, materialId: string, preferredVendorId?: string) {
    let query = this.supabase
      .from('material_vendor_link')
      .select('vendor_id, min_order_qty, rounding_value, planned_delivery_days, contract_net_price, is_primary_vendor, vendor_master:vendor_id (vendor_code, vendor_name, currency), material_master:material_id (description)')
      .eq('tenant_id', tenantId)
      .eq('material_id', materialId)
      .eq('is_active', true);

    if (preferredVendorId) {
      query = query.eq('vendor_id', preferredVendorId);
    } else {
      query = query.eq('is_primary_vendor', true);
    }

    const { data, error } = await query.maybeSingle();

    // Fallback if material_vendor_link is missing
    if (error || !data) {
      const { data: mat } = await this.supabase
        .from('material_master')
        .select('description, standard_price')
        .eq('id', materialId)
        .maybeSingle();

      return {
        vendorId: undefined,
        vendorCode: 'VEND-DEFAULT',
        vendorName: 'Primary Wholesale Vendor',
        currency: 'EUR',
        minOrderQty: 1,
        roundingValue: 1,
        leadTimeDays: 7,
        contractNetPrice: mat?.standard_price || 0,
        description: mat?.description || 'Material'
      };
    }

    return {
      vendorId: data.vendor_id,
      vendorCode: data.vendor_master?.vendor_code || 'V001',
      vendorName: data.vendor_master?.vendor_name || 'Vendor',
      currency: data.vendor_master?.currency || 'EUR',
      minOrderQty: data.min_order_qty || 1,
      roundingValue: data.rounding_value || 1,
      leadTimeDays: data.planned_delivery_days || 7,
      contractNetPrice: data.contract_net_price || 0,
      description: data.material_master?.description || ''
    };
  }

  private applyRounding(qty: number, roundingValue: number, minOrderQty: number): number {
    const rounded = Math.ceil(qty / Math.max(1, roundingValue)) * Math.max(1, roundingValue);
    return Math.max(rounded, minOrderQty);
  }

  private calculateDeliveryDate(leadTimeDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + leadTimeDays);
    return date.toISOString().split('T')[0];
  }
}
