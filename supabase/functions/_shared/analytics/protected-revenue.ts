// /supabase/functions/_shared/analytics/protected-revenue.ts

export class ProtectedRevenueCalculator {
  constructor(private supabase: any) {}

  async getSummary(tenantId: string, storeId?: string): Promise<any[]> {
    let query = this.supabase
      .from('mv_protected_revenue')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('month', { ascending: false });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
}
