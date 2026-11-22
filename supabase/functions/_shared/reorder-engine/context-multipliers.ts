// /supabase/functions/_shared/reorder-engine/context-multipliers.ts
//
// Contextual demand factors. These are CORRECTIONS, not forecasts: a missing
// or stale signal is reported as unavailable and is NOT applied. Multipliers
// are bounded so that compounding cannot produce an impossible demand spike.

export type SignalStatus = 'APPLIED' | 'NONE' | 'UNAVAILABLE' | 'STALE' | 'DISABLED';

export interface ContextualInput {
  tenantId: string;
  storeId: string;
  materialId: string;
  forecastDate: Date;
  baseVelocity: number;
  disabledFactors?: { weather?: boolean; holiday?: boolean; promotion?: boolean };
}

export interface ContextualResult {
  weatherMultiplier: number;
  holidayMultiplier: number;
  promotionMultiplier: number;
  compositeMultiplier: number;
  reasoning: string[];
  dataQuality: {
    weather: SignalStatus;
    holiday: SignalStatus;
    promotion: SignalStatus;
  };
}

interface Factor {
  value: number;
  status: SignalStatus;
  reason: string;
}

const MAX_COMPOSITE = 3.0;
const MIN_COMPOSITE = 0.5;
const MAX_SIGNAL_AGE_DAYS = 3;
const MAX_PROMO_AGE_DAYS = 7;

export class ContextMultipliers {
  constructor(private supabase: any) {}

  async calculate(input: ContextualInput): Promise<ContextualResult> {
    const disabled = input.disabledFactors ?? {};
    const weather = disabled.weather
      ? { value: 1, status: 'DISABLED' as const, reason: 'Weather factor disabled for this store-material' }
      : await this.getWeatherMultiplier(input.tenantId, input.storeId, input.forecastDate);
    const holiday = disabled.holiday
      ? { value: 1, status: 'DISABLED' as const, reason: 'Holiday factor disabled for this store-material' }
      : await this.getHolidayMultiplier(input.tenantId, input.storeId, input.forecastDate);
    const promotion = disabled.promotion
      ? { value: 1, status: 'DISABLED' as const, reason: 'Promotion factor disabled for this store-material' }
      : await this.getPromotionMultiplier(input.tenantId, input.storeId, input.materialId, input.forecastDate);

    const applied = [weather, holiday, promotion].filter((f) => f.status === 'APPLIED');
    const raw = applied.reduce((product, f) => product * f.value, 1);
    // Only applied signals affect demand. Unavailable signals are neutral and
    // visible in dataQuality, so a missing API key cannot silently reduce or
    // inflate an order.
    const compositeMultiplier = Number(
      Math.min(MAX_COMPOSITE, Math.max(MIN_COMPOSITE, raw)).toFixed(2),
    );

    const reasoning = [weather, holiday, promotion]
      .filter((f) => f.status !== 'NONE')
      .map((f) => `${f.status}: ${f.reason}`);

    return {
      weatherMultiplier: weather.value,
      holidayMultiplier: holiday.value,
      promotionMultiplier: promotion.value,
      compositeMultiplier,
      reasoning,
      dataQuality: { weather: weather.status, holiday: holiday.status, promotion: promotion.status },
    };
  }

  private async getWeatherMultiplier(tenantId: string, storeId: string, date: Date): Promise<Factor> {
    const dateStr = date.toISOString().split('T')[0];
    const { data: weather } = await this.supabase
      .from('weather_cache')
      .select('temp_avg_c, weather_condition, retail_impact_score, fetched_at')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .eq('forecast_for_date', dateStr)
      .maybeSingle();

    if (!weather || weather.weather_condition === 'UNKNOWN') {
      return { value: 1, status: 'UNAVAILABLE', reason: 'no verified weather forecast for this store/date' };
    }
    if (weather.fetched_at && Date.now() - new Date(weather.fetched_at).getTime() > MAX_SIGNAL_AGE_DAYS * 86400000) {
      return { value: 1, status: 'STALE', reason: 'weather forecast is older than 3 days' };
    }
    if (weather.temp_avg_c === null || weather.temp_avg_c === undefined) {
      return { value: 1, status: 'UNAVAILABLE', reason: 'weather row has no temperature' };
    }

    // Uplift factors are explicit policy, not hidden magic. The cached
    // `retail_impact_score` is the customer-configured signal; temperature is
    // only a coarse proxy when no score is supplied.
    if (typeof weather.retail_impact_score === 'number' && weather.retail_impact_score !== 0) {
      const value = Math.min(MAX_COMPOSITE, Math.max(MIN_COMPOSITE, 1 + weather.retail_impact_score));
      return { value: Number(value.toFixed(2)), status: 'APPLIED', reason: `configured retail impact ${weather.retail_impact_score}` };
    }

    const temp = Number(weather.temp_avg_c);
    const condition = weather.weather_condition ?? '';
    let value = 1;
    if (temp > 24) value = 1.3;
    else if (temp > 20) value = 1.15;
    else if (temp < 5) value = 0.85;
    if (/rain/i.test(condition)) value = Math.max(MIN_COMPOSITE, value - 0.1);
    return {
      value: Number(value.toFixed(2)),
      status: value === 1 ? 'NONE' : 'APPLIED',
      reason: value === 1 ? 'weather within neutral range' : `temperature ${temp}°C, condition ${condition}`,
    };
  }

  private async getHolidayMultiplier(tenantId: string, storeId: string, date: Date): Promise<Factor> {
    const dateStr = date.toISOString().split('T')[0];
    const { data: store } = await this.supabase
      .from('stores')
      .select('country_code, region_code')
      .eq('id', storeId)
      .maybeSingle();

    const countryCode = store?.country_code;
    if (!countryCode) {
      return { value: 1, status: 'UNAVAILABLE', reason: 'store has no country_code for holiday lookup' };
    }

    const { data: holiday } = await this.supabase
      .from('holiday_calendar')
      .select('sales_uplift_factor, is_store_closed, is_retail_peak, holiday_name')
      .eq('tenant_id', tenantId)
      .eq('holiday_date', dateStr)
      .eq('country_code', countryCode)
      .maybeSingle();

    if (!holiday) {
      // No entry means "not a known holiday" only when a calendar exists for
      // this tenant/country at all.
      const { data: anyHoliday } = await this.supabase
        .from('holiday_calendar')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('country_code', countryCode)
        .limit(1)
        .maybeSingle();
      return anyHoliday
        ? { value: 1, status: 'NONE', reason: 'no holiday on this date' }
        : { value: 1, status: 'UNAVAILABLE', reason: `no holiday calendar configured for ${countryCode}` };
    }

    if (holiday.is_store_closed) {
      return { value: 0, status: 'APPLIED', reason: `${holiday.holiday_name ?? 'holiday'}: store closed` };
    }
    const uplift = Number(holiday.sales_uplift_factor ?? 1);
    // A calendar provider supplies dates, not a commercial uplift. 1.0 means
    // "no configured uplift", not a fabricated sales increase.
    return {
      value: Number(uplift.toFixed(2)),
      status: uplift === 1 ? 'NONE' : 'APPLIED',
      reason: `${holiday.holiday_name ?? 'holiday'}: configured uplift ${uplift}`,
    };
  }

  private async getPromotionMultiplier(
    tenantId: string,
    storeId: string,
    materialId: string,
    date: Date,
  ): Promise<Factor> {
    const dateStr = date.toISOString().split('T')[0];
    const { data: promos } = await this.supabase
      .from('promotional_calendar')
      .select('uplift_factor, synced_from_erp_at, promotion_name')
      .eq('tenant_id', tenantId)
      .eq('material_id', materialId)
      .eq('is_active', true)
      .lte('valid_from', dateStr)
      .gte('valid_to', dateStr);

    if (!promos || promos.length === 0) {
      return { value: 1, status: 'NONE', reason: 'no active promotion in the configured window' };
    }

    const verified = (promos as any[]).filter((p) => {
      if (!p.synced_from_erp_at) return false;
      return Date.now() - new Date(p.synced_from_erp_at).getTime() <= MAX_PROMO_AGE_DAYS * 86400000;
    });
    if (verified.length === 0) {
      return {
        value: 1,
        status: 'STALE',
        reason: 'promotion rows exist but none were synced from ERP within 7 days',
      };
    }

    const best = verified.reduce((a, b) => (Number(b.uplift_factor ?? 1) > Number(a.uplift_factor ?? 1) ? b : a));
    const uplift = Number(best.uplift_factor ?? 1);
    return {
      value: Number(uplift.toFixed(2)),
      status: uplift === 1 ? 'NONE' : 'APPLIED',
      reason: `${best.promotion_name ?? 'promotion'}: verified uplift ${uplift}`,
    };
  }
}
