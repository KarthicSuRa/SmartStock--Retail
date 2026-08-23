-- =============================================================================
-- Migration 71: External Context Sources & Observability
-- SmartStock Context Intelligence V1
--
-- PURPOSE:
--   Tracks health, freshness SLAs, error rates, and store geographic coverage
--   across all external context providers to ensure zero silent data degradation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.external_context_sources (
    source_name                 VARCHAR(50) PRIMARY KEY, -- OPEN_METEO, NAGER_HOLIDAYS, TICKETMASTER_EVENTS, PROMOTION_FEED
    category                    VARCHAR(50) NOT NULL,    -- WEATHER, CALENDAR, LOCAL_EVENTS, COMMERCIAL
    status                      VARCHAR(20) DEFAULT 'HEALTHY' NOT NULL, -- HEALTHY, DEGRADED, OFFLINE
    
    last_sync_timestamp         TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL,
    sync_frequency_minutes      INTEGER DEFAULT 60 NOT NULL,
    freshness_latency_minutes   NUMERIC(6, 1) DEFAULT 12.0 NOT NULL,
    
    store_coverage_pct          NUMERIC(5, 2) DEFAULT 100.0 NOT NULL,
    error_count_24h             INTEGER DEFAULT 0 NOT NULL,
    fallback_active             BOOLEAN DEFAULT FALSE NOT NULL,
    fallback_mechanism          VARCHAR(100) DEFAULT 'CLIMATOLOGICAL_NORMALS' NOT NULL
);

-- Seed context source providers
INSERT INTO analytics.external_context_sources
    (source_name, category, status, sync_frequency_minutes, freshness_latency_minutes, store_coverage_pct, fallback_mechanism)
VALUES
    ('OPEN_METEO_WEATHER', 'WEATHER', 'HEALTHY', 60, 18.4, 100.0, 'CLIMATOLOGICAL_NORMALS'),
    ('NATIONAL_HOLIDAYS', 'CALENDAR', 'HEALTHY', 1440, 4.2, 100.0, 'ANNUAL_CACHED_SCHEDULE'),
    ('RETAIL_PROMOTIONS', 'COMMERCIAL', 'HEALTHY', 30, 2.1, 100.0, 'ACTIVE_PRICE_TABLE'),
    ('LOCAL_ARENA_EVENTS', 'LOCAL_EVENTS', 'HEALTHY', 360, 28.5, 92.4, 'ZERO_IMPACT_DEFAULT')
ON CONFLICT (source_name) DO UPDATE SET
    last_sync_timestamp = clock_timestamp(),
    status = EXCLUDED.status;
