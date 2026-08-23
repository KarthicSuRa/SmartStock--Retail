// /src/lib/context/context-feature-builder.ts
// SmartStock Context Intelligence V1 — Unified Context Feature Builder & Sensitivity Multiplier

import { WeatherAdapter } from './weather-adapter';
import { CalendarAdapter } from './calendar-adapter';
import { LocalEventAdapter } from './event-adapter';
import { ContextFeatureSnapshot, GeoPoint } from './types';

export class ContextFeatureBuilder {
  static buildContextSnapshot(storeId: string, sku: string, category = 'BEVERAGES'): ContextFeatureSnapshot {
    const geo: GeoPoint = {
      storeId,
      storeName: storeId === '1001' ? 'Amsterdam Central' : 'Store ' + storeId,
      latitude: 52.379189,
      longitude: 4.900331,
    };

    const weather = WeatherAdapter.getForecastVintage(geo);
    const normalTemp = WeatherAdapter.getSeasonalNormalTemperature();
    const tempDelta = Number((weather.temperatureC - normalTemp).toFixed(1));
    const isHotAnomaly = tempDelta >= 5.0; // >= +5C above seasonal norm
    const isRain = weather.precipitationProbabilityPct >= 50;

    const holidayInfo = CalendarAdapter.getDaysUntilNextHoliday();
    const nearbyEvents = LocalEventAdapter.getNearbyEvents(storeId);
    const primaryEvent = nearbyEvents[0];

    // First-party promotion lookup
    const isAirPods = sku.includes('AP-PRO');
    const isBeverage = category.toUpperCase().includes('BEVERAGE') || sku.includes('WATER') || sku.includes('DRINK');

    const isOnPromo = isAirPods || isBeverage;
    const discountPct = isAirPods ? 20.0 : isBeverage ? 15.0 : 0.0;
    const promoName = isAirPods ? 'Summer Electronics Wave' : isBeverage ? 'Hot Weather Refresh Promo' : undefined;

    // Category sensitivity multiplier calculation:
    // Base = 1.0
    // + Hot weather effect on beverages/ice cream (+25%)
    // + Promotion lift (+20% discount gives +30% lift)
    // + Event proximity (+15%)
    let multiplier = 1.0;

    if (isBeverage && isHotAnomaly) {
      multiplier += 0.25;
    }
    if (isOnPromo) {
      multiplier += (discountPct / 100.0) * 1.5;
    }
    if (primaryEvent && primaryEvent.impactScore > 0.5) {
      multiplier += 0.15;
    }

    return {
      storeId,
      sku,
      category,
      temperatureForecastC: weather.temperatureC,
      temperatureDeltaFromNormC: tempDelta,
      precipitationProbabilityPct: weather.precipitationProbabilityPct,
      isHotWeatherAnomaly: isHotAnomaly,
      isRainExpected: isRain,
      isPublicHoliday: holidayInfo.days === 0,
      isHolidayEve: holidayInfo.days === 1,
      daysUntilHoliday: holidayInfo.days,
      holidayName: holidayInfo.holidayName,
      isSchoolHoliday: true, // August summer school holidays
      isOnPromotion: isOnPromo,
      discountPercentage: discountPct,
      promotionName: promoName,
      hasMajorEventNearby: Boolean(primaryEvent),
      nearbyEventName: primaryEvent?.eventName,
      eventDistanceKm: primaryEvent?.distanceKm,
      eventImpactScore: primaryEvent?.impactScore || 0,
      categoryContextDemandMultiplier: Number(multiplier.toFixed(2)),
      extractedAt: new Date().toISOString(),
    };
  }
}
