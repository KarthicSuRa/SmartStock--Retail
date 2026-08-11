// /supabase/functions/_shared/reorder-engine/context-multipliers.ts

export interface ContextualInput {
  tenantId: string;
  storeId: string;
  materialId: string;
  forecastDate: Date;
  baseVelocity: number;
}

export interface ContextualResult {
  weatherMultiplier: number;
  holidayMultiplier: number;
  promotionMultiplier: number;
  compositeMultiplier: number;
  reasoning: string[];
}

export class ContextMultipliers {
  constructor(private supabase: any) {}

  async calculate(input: ContextualInput): Promise<ContextualResult> {
    const { tenantId, storeId, materialId, forecastDate } = input;
    const reasoning: string[] = [];
    
    // 1. Weather Multiplier
    const weatherMult = await this.getWeatherMultiplier(tenantId, storeId, forecastDate);
    if (weatherMult !== 1.0) {
      reasoning.push(`Weather: ${weatherMult}x (${weatherMult > 1 ? 'favorable' : 'unfavorable'} conditions)`);
    }

    // 2. Holiday Multiplier
    const holidayMult = await this.getHolidayMultiplier(tenantId, storeId, forecastDate);
    if (holidayMult !== 1.0) {
      reasoning.push(`Holiday: ${holidayMult}x (${holidayMult > 1 ? 'peak' : 'closed/low-traffic'} day)`);
    }

    // 3. Promotion Multiplier
    const promoMult = await this.getPromotionMultiplier(tenantId, storeId, materialId, forecastDate);
    if (promoMult !== 1.0) {
      reasoning.push(`Promotion: ${promoMult}x (active SAP campaign)`);
    }

    return {
      weatherMultiplier: weatherMult,
      holidayMultiplier: holidayMult,
      promotionMultiplier: promoMult,
      compositeMultiplier: parseFloat((weatherMult * holidayMult * promoMult).toFixed(2)),
      reasoning
    };
  }

  private async getWeatherMultiplier(tenantId: string, storeId: string, date: Date): Promise<number> {
    const dateStr = date.toISOString().split('T')[0];
    
    const { data: weather } = await this.supabase
      .from('weather_cache')
      .select('temp_avg_c, weather_condition, retail_impact_score')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .eq('forecast_for_date', dateStr)
      .maybeSingle();

    if (!weather) return 1.0;

    const temp = weather.temp_avg_c;
    const condition = weather.weather_condition;

    if (temp > 24) return 1.3;
    if (temp > 20) return 1.15;
    if (temp < 5) return 0.85;
    
    if (condition?.includes('Rain')) return 0.9;
    
    return 1.0;
  }

  private async getHolidayMultiplier(tenantId: string, storeId: string, date: Date): Promise<number> {
    const dateStr = date.toISOString().split('T')[0];
    
    const { data: store } = await this.supabase
      .from('stores')
      .select('country_code, region_code')
      .eq('id', storeId)
      .maybeSingle();

    const { data: holiday } = await this.supabase
      .from('holiday_calendar')
      .select('sales_uplift_factor, is_store_closed')
      .eq('tenant_id', tenantId)
      .eq('holiday_date', dateStr)
      .eq('country_code', store?.country_code || 'NL')
      .maybeSingle();

    if (!holiday) return 1.0;
    if (holiday.is_store_closed) return 0.0;
    
    return holiday.sales_uplift_factor || 1.0;
  }

  private async getPromotionMultiplier(
    tenantId: string, 
    storeId: string, 
    materialId: string, 
    date: Date
  ): Promise<number> {
    const dateStr = date.toISOString().split('T')[0];
    
    const { data: promos } = await this.supabase
      .from('promotional_calendar')
      .select('uplift_factor')
      .eq('tenant_id', tenantId)
      .eq('material_id', materialId)
      .eq('is_active', true)
      .lte('valid_from', dateStr)
      .gte('valid_to', dateStr);

    if (!promos || promos.length === 0) return 1.0;

    return Math.max(...promos.map((p: any) => p.uplift_factor || 1.0));
  }
}
