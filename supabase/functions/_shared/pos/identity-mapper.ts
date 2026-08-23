// /supabase/functions/_shared/pos/identity-mapper.ts
// SmartStock LiveRetail V2 — Universal Product & Location Identity Resolver

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ResolvedProduct {
  smartstock_sku: string;
  sap_material_id?: string;
  id_type: string;
}

export class POSIdentityMapper {
  /**
   * Resolves a vendor product identifier (variant ID, barcode, PLU, etc.) to SmartStock's canonical SKU.
   */
  static async resolveProduct(
    supabase: SupabaseClient,
    tenantId: string,
    sourceSystem: string,
    externalId: string,
    idTypeHint?: string
  ): Promise<ResolvedProduct> {
    if (!externalId) {
      return { smartstock_sku: 'UNKNOWN_SKU', id_type: 'UNKNOWN' };
    }

    // 1. Check exact match in pos_product_identity_map
    const query = supabase
      .from('pos_product_identity_map')
      .select('smartstock_sku, sap_material_id, id_type')
      .eq('tenant_id', tenantId)
      .eq('source_system', sourceSystem)
      .eq('external_id', externalId)
      .eq('is_active', true);

    if (idTypeHint) {
      query.eq('id_type', idTypeHint);
    }

    const { data } = await query.maybeSingle();

    if (data) {
      return {
        smartstock_sku: data.smartstock_sku,
        sap_material_id: data.sap_material_id,
        id_type: data.id_type,
      };
    }

    // 2. Fallback: check materials table direct SKU or barcode
    const { data: matData } = await supabase
      .from('materials')
      .select('id, sku, barcode')
      .eq('tenant_id', tenantId)
      .or(`sku.eq.${externalId},barcode.eq.${externalId}`)
      .maybeSingle();

    if (matData) {
      return {
        smartstock_sku: matData.sku,
        sap_material_id: matData.id,
        id_type: matData.sku === externalId ? 'SKU' : 'BARCODE',
      };
    }

    // 3. Fallback to raw external ID
    return {
      smartstock_sku: externalId,
      id_type: 'UNRESOLVED_DIRECT',
    };
  }

  /**
   * Resolves a vendor location/register identifier to SmartStock's store UUID.
   */
  static async resolveLocation(
    supabase: SupabaseClient,
    tenantId: string,
    sourceSystem: string,
    externalLocationId: string,
    fallbackStoreId?: string
  ): Promise<string> {
    if (!externalLocationId && fallbackStoreId) {
      return fallbackStoreId;
    }

    // 1. Check pos_location_identity_map
    const { data } = await supabase
      .from('pos_location_identity_map')
      .select('smartstock_location_id')
      .eq('tenant_id', tenantId)
      .eq('source_system', sourceSystem)
      .eq('external_location_id', externalLocationId)
      .maybeSingle();

    if (data) {
      return data.smartstock_location_id;
    }

    // 2. Fallback: check stores table store_code or id
    const { data: storeData } = await supabase
      .from('stores')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(`store_code.eq.${externalLocationId},id.eq.${externalLocationId}`)
      .maybeSingle();

    if (storeData) {
      return storeData.id;
    }

    return fallbackStoreId || externalLocationId;
  }
}
