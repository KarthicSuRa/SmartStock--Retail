-- =============================================================================
-- Migration 70: Canonical External Context Datastore
-- SmartStock Context Intelligence V1
--
-- PURPOSE:
--   Stores vendor-agnostic external context data (Weather forecasts & observations,
--   public/school holidays, local events, and promotion calendars) decoupled from
--   live operational transaction paths.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. WEATHER FORECAST VINTAGES (Avoids training-serving leakage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.external_weather_forecasts (
    forecast_id                 BIGSERIAL PRIMARY KEY,
    store_id                    VARCHAR(50) NOT NULL,
    forecast_vintage_at         TIMESTAMPTZ NOT NULL, -- When the forecast was generated
    target_time                 TIMESTAMPTZ NOT NULL, -- The time being predicted
    horizon_hours               INTEGER NOT NULL,     -- Lead time (e.g. 24h, 48h, 72h)
    
    temperature_c               NUMERIC(4, 1) NOT NULL,
    apparent_temperature_c      NUMERIC(4, 1) NOT NULL,
    precipitation_probability_pct SMALLINT NOT NULL,
    precipitation_mm            NUMERIC(5, 2) NOT NULL,
    snowfall_cm                 NUMERIC(5, 2) DEFAULT 0 NOT NULL,
    weather_code                INTEGER NOT NULL,     -- WMO weather interpretation code
    provider                    VARCHAR(50) DEFAULT 'OPEN_METEO' NOT NULL,
    model_run_id                VARCHAR(100),
    created_at                  TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL,

    UNIQUE(store_id, forecast_vintage_at, target_time)
);

CREATE INDEX IF NOT EXISTS idx_weather_forecast_target ON analytics.external_weather_forecasts(store_id, target_time);

-- ---------------------------------------------------------------------------
-- 2. WEATHER HISTORICAL OBSERVATIONS (Ground truth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.external_weather_observations (
    observation_id              BIGSERIAL PRIMARY KEY,
    store_id                    VARCHAR(50) NOT NULL,
    observed_at                 TIMESTAMPTZ NOT NULL,
    
    temperature_c               NUMERIC(4, 1) NOT NULL,
    precipitation_mm            NUMERIC(5, 2) NOT NULL,
    wind_speed_kmh              NUMERIC(5, 1),
    provider                    VARCHAR(50) DEFAULT 'OPEN_METEO' NOT NULL,
    created_at                  TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL,

    UNIQUE(store_id, observed_at)
);

-- ---------------------------------------------------------------------------
-- 3. CALENDAR & HOLIDAY EVENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.external_calendar_events (
    event_id                    VARCHAR(100) PRIMARY KEY,
    event_type                  VARCHAR(50) NOT NULL, -- PUBLIC_HOLIDAY, SCHOOL_HOLIDAY, PAYDAY, RETAIL_SEASON
    scope_type                  VARCHAR(30) NOT NULL, -- NATIONAL, REGION, STORE
    scope_id                    VARCHAR(50) NOT NULL, -- e.g. 'NL', 'REGION_NORTH', '1001'
    
    event_name                  VARCHAR(150) NOT NULL,
    start_date                  DATE NOT NULL,
    end_date                    DATE NOT NULL,
    importance_weight           SMALLINT DEFAULT 1 NOT NULL, -- 1-3
    source                      VARCHAR(50) DEFAULT 'GOV_NL' NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_dates ON analytics.external_calendar_events(start_date, end_date);

-- ---------------------------------------------------------------------------
-- 4. LOCAL HIGH-IMPACT EVENTS (Stadiums, Arenas, City Festivals)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.external_local_events (
    event_id                    VARCHAR(100) PRIMARY KEY,
    store_id                    VARCHAR(50) NOT NULL,
    event_name                  VARCHAR(200) NOT NULL,
    venue_name                  VARCHAR(150) NOT NULL,
    distance_km                 NUMERIC(4, 2) NOT NULL,
    expected_attendance         INTEGER NOT NULL,
    category                    VARCHAR(50) NOT NULL, -- SPORTS, CONCERT, FESTIVAL, CONVENTION
    impact_score                NUMERIC(4, 2) NOT NULL, -- Normalized 0.0 - 1.0 (Capacity / Dist^2)
    start_time                  TIMESTAMPTZ NOT NULL,
    end_time                    TIMESTAMPTZ NOT NULL,
    source                      VARCHAR(50) DEFAULT 'TICKETMASTER' NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_events_store_time ON analytics.external_local_events(store_id, start_time);

-- ---------------------------------------------------------------------------
-- 5. RETAIL PROMOTION & PRICING CALENDAR (First-party P0)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.external_promotion_calendar (
    promotion_id                VARCHAR(100) PRIMARY KEY,
    tenant_id                   UUID NOT NULL,
    sku                         VARCHAR(50) NOT NULL,
    store_id                    VARCHAR(50) NOT NULL, -- 'ALL' or specific store ID
    
    promotion_name              VARCHAR(150) NOT NULL,
    promotion_type              VARCHAR(50) NOT NULL, -- PERCENT_DISCOUNT, BOGO, BUNDLE_SPECIAL, FEATURED_PLACEMENT
    regular_price_eur           NUMERIC(10, 2) NOT NULL,
    promotional_price_eur       NUMERIC(10, 2) NOT NULL,
    discount_percentage         NUMERIC(5, 2) NOT NULL,
    
    start_date                  TIMESTAMPTZ NOT NULL,
    end_date                    TIMESTAMPTZ NOT NULL,
    is_active                   BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promo_sku_store_time ON analytics.external_promotion_calendar(sku, store_id, start_date, end_date);
