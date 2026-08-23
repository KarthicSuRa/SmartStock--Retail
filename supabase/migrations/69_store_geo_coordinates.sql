-- =============================================================================
-- Migration 69: Store Geographic Coordinates & Regional Scopes
-- SmartStock Context Intelligence V1
--
-- PURPOSE:
--   Enriches dim_store with precise geographical coordinates, timezones,
--   climate classifications, and regional school holiday zones to enable
--   hyper-local weather and calendar mapping.
-- =============================================================================

ALTER TABLE analytics.dim_store
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS elevation_m NUMERIC(6, 1) DEFAULT 2.0,
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Amsterdam' NOT NULL,
    ADD COLUMN IF NOT EXISTS climate_region VARCHAR(50) DEFAULT 'NORTH_SEA_MARITIME' NOT NULL,
    ADD COLUMN IF NOT EXISTS school_holiday_region VARCHAR(30) DEFAULT 'REGION_NORTH' NOT NULL;

-- Seed precise retail store coordinates
UPDATE analytics.dim_store
SET 
    latitude = 52.379189,
    longitude = 4.900331,
    elevation_m = 1.0,
    school_holiday_region = 'REGION_NORTH'
WHERE store_id = '1001'; -- Amsterdam Central Flagship

UPDATE analytics.dim_store
SET 
    latitude = 52.338942,
    longitude = 4.873211,
    elevation_m = 0.5,
    school_holiday_region = 'REGION_NORTH'
WHERE store_id = '1002'; -- Amsterdam Zuid

UPDATE analytics.dim_store
SET 
    latitude = 51.924420,
    longitude = 4.477733,
    elevation_m = -1.0,
    school_holiday_region = 'REGION_CENTRAL'
WHERE store_id = '1003'; -- Rotterdam Centraal

UPDATE analytics.dim_store
SET 
    latitude = 52.090737,
    longitude = 5.121420,
    elevation_m = 4.0,
    school_holiday_region = 'REGION_CENTRAL'
WHERE store_id = '1004'; -- Utrecht Station
