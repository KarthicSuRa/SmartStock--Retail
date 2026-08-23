// /src/lib/context/types.ts
// SmartStock Context Intelligence V1 — Domain Contracts

export interface GeoPoint {
  latitude: number;
  longitude: number;
  elevationM?: number;
  storeId: string;
  storeName: string;
}

export interface WeatherForecastVintage {
  storeId: string;
  forecastVintageAt: string;
  targetTime: string;
  horizonHours: number;
  temperatureC: number;
  apparentTemperatureC: number;
  precipitationProbabilityPct: number;
  precipitationMm: number;
  snowfallCm: number;
  weatherCode: number;
  provider: string;
}

export interface CalendarEvent {
  eventId: string;
  eventType: 'PUBLIC_HOLIDAY' | 'SCHOOL_HOLIDAY' | 'PAYDAY' | 'RETAIL_SEASON';
  scopeType: 'NATIONAL' | 'REGION' | 'STORE';
  scopeId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  importanceWeight: number;
}

export interface LocalEvent {
  eventId: string;
  storeId: string;
  eventName: string;
  venueName: string;
  distanceKm: number;
  expectedAttendance: number;
  category: 'SPORTS' | 'CONCERT' | 'FESTIVAL' | 'CONVENTION';
  impactScore: number; // 0.0 - 1.0
  startTime: string;
  endTime: string;
}

export interface PromotionEvent {
  promotionId: string;
  sku: string;
  storeId: string;
  promotionName: string;
  promotionType: string;
  regularPriceEur: number;
  promotionalPriceEur: number;
  discountPercentage: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface ContextFeatureSnapshot {
  storeId: string;
  sku: string;
  category: string;
  
  // Weather Context
  temperatureForecastC: number;
  temperatureDeltaFromNormC: number;
  precipitationProbabilityPct: number;
  isHotWeatherAnomaly: boolean;
  isRainExpected: boolean;
  
  // Calendar Context
  isPublicHoliday: boolean;
  isHolidayEve: boolean;
  daysUntilHoliday: number;
  holidayName?: string;
  isSchoolHoliday: boolean;
  
  // Commercial Context
  isOnPromotion: boolean;
  discountPercentage: number;
  promotionName?: string;
  
  // Local Event Context
  hasMajorEventNearby: boolean;
  nearbyEventName?: string;
  eventDistanceKm?: number;
  eventImpactScore: number;
  
  // Category-Specific Demand Lift Multiplier
  categoryContextDemandMultiplier: number; // e.g. 1.35x for cold drinks during heatwave
  
  extractedAt: string;
}
