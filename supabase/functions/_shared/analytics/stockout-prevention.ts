// /supabase/functions/_shared/analytics/stockout-prevention.ts

export class StockoutPreventionAnalytics {
  constructor(private supabase: any) {}

  async getStoreHealth(tenantId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('mv_store_health')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('critical_skus', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}
