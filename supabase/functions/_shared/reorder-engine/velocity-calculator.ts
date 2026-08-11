// /supabase/functions/_shared/reorder-engine/velocity-calculator.ts

export interface VelocityInput {
  tenantId: string;
  storeId: string;
  materialId: string;
  lookbackDays: number;
  smoothingFactor: number; // α for exponential smoothing
}

export interface VelocityResult {
  baseVelocityDaily: number;
  adjustedVelocityDaily: number;
  dataPoints: number;
  stockoutDays: number;
  coefficientOfVariation: number;
  trendPct: number | null;
}

export class VelocityCalculator {
  constructor(private supabase: any) {}

  async calculate(input: VelocityInput): Promise<VelocityResult> {
    const { tenantId, storeId, materialId, lookbackDays } = input;
    
    const periodStart = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    
    // 1. Fetch material SKU for inventory_movements lookup
    const { data: mat } = await this.supabase
      .from('material_master')
      .select('sku')
      .eq('id', materialId)
      .single();

    const sku = mat?.sku;
    if (!sku) {
      return {
        baseVelocityDaily: 0,
        adjustedVelocityDaily: 0,
        dataPoints: 0,
        stockoutDays: 0,
        coefficientOfVariation: 0,
        trendPct: null
      };
    }

    // 2. Fetch daily sales aggregates from inventory_movements
    const { data: dailySales, error } = await this.supabase
      .from('inventory_movements')
      .select('created_at, quantity')
      .eq('sku', sku)
      .eq('movement_type', 'SALE')
      .gte('created_at', periodStart)
      .order('created_at', { ascending: true });

    if (error) console.warn('[VelocityCalculator] Daily sales query warning:', error.message);

    // 3. Fetch stock baselines for the same period to detect stockouts
    const { data: baselineHistory } = await this.supabase
      .from('stock_baselines')
      .select('last_synced_at, qty_unrestricted')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .eq('material_id', materialId)
      .gte('last_synced_at', periodStart);

    // 4. Aggregate by day
    const salesByDay = this.aggregateByDay(dailySales || []);
    const baselineByDay = this.aggregateBaselineByDay(baselineHistory || []);

    const days = lookbackDays;
    let totalUnits = 0;
    let activeDays = 0;
    let stockoutDays = 0;
    const dailyRates: number[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const daySales = salesByDay[date] || 0;
      const dayBaseline = baselineByDay[date];

      // Stockout detection: if baseline was 0 or very low, don't count as zero demand
      const wasStockout = dayBaseline !== undefined && dayBaseline <= 1;
      
      if (wasStockout) {
        stockoutDays++;
        continue;
      }

      if (daySales > 0) {
        totalUnits += Math.abs(daySales);
        activeDays++;
      }
      
      dailyRates.push(Math.abs(daySales));
    }

    // 5. Calculate base velocity
    const effectiveDays = activeDays;
    const baseVelocity = effectiveDays > 0 ? totalUnits / effectiveDays : (totalUnits / (days || 1));

    // 6. Adjust for stockout bias
    const stockoutCorrectionFactor = (effectiveDays > 0 && days > 0) ? (days / Math.max(1, effectiveDays)) : 1;
    const adjustedVelocity = baseVelocity * Math.min(stockoutCorrectionFactor, 2.0); // Cap at 2x

    // 7. Statistical measures
    const mean = dailyRates.length > 0 ? dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length : 0;
    const variance = dailyRates.length > 0 ? dailyRates.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / dailyRates.length : 0;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;

    // 8. Trend vs previous period
    const prevPeriodVelocity = await this.getPreviousPeriodVelocity(tenantId, storeId, materialId, lookbackDays);
    const trendPct = prevPeriodVelocity ? ((adjustedVelocity - prevPeriodVelocity) / prevPeriodVelocity) * 100 : null;

    return {
      baseVelocityDaily: parseFloat(baseVelocity.toFixed(4)),
      adjustedVelocityDaily: parseFloat(adjustedVelocity.toFixed(4)),
      dataPoints: activeDays,
      stockoutDays,
      coefficientOfVariation: parseFloat(cv.toFixed(4)),
      trendPct: trendPct ? parseFloat(trendPct.toFixed(2)) : null
    };
  }

  private aggregateByDay(records: any[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const r of records) {
      const date = r.created_at.split('T')[0];
      map[date] = (map[date] || 0) + Math.abs(r.quantity);
    }
    return map;
  }

  private aggregateBaselineByDay(records: any[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const r of records) {
      const date = r.last_synced_at.split('T')[0];
      map[date] = r.qty_unrestricted;
    }
    return map;
  }

  private async getPreviousPeriodVelocity(
    tenantId: string, 
    storeId: string, 
    materialId: string,
    lookbackDays: number
  ): Promise<number | null> {
    const prevPeriodEnd = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const prevPeriodStart = new Date(Date.now() - 2 * lookbackDays * 86400000).toISOString();

    const { data } = await this.supabase
      .from('sales_velocity')
      .select('adjusted_velocity_daily')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .eq('material_id', materialId)
      .gte('calculated_at', prevPeriodStart)
      .lte('calculated_at', prevPeriodEnd)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.adjusted_velocity_daily || null;
  }
}
