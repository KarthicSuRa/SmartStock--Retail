// /supabase/functions/_shared/analytics/vendor-scorecard.ts

export class VendorScorecardEngine {
  constructor(private supabase: any) {}

  async getTopVendors(tenantId: string, limit: number = 10): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('mv_vendor_scorecards')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('reliability_score', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }
}
