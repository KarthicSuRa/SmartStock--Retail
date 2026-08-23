-- =============================================================================
-- Migration 57: Analytics Star Schema Dimensions
-- SmartStock Intelligence & Analytics V1
--
-- PURPOSE:
--   Defines the dimensional model for the analytical plane. Decoupled from the
--   operational normalized tables to optimize cross-store aggregations, historical
--   trends, and multi-dimensional analysis without operational table locks.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS analytics;

-- ---------------------------------------------------------------------------
-- 1. DIMENSION: TIME / DATE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_time (
    time_key            INTEGER PRIMARY KEY,         -- Format: YYYYMMDD (e.g. 20260822)
    full_date           DATE NOT NULL,
    day_of_week         SMALLINT NOT NULL,          -- 1 (Mon) - 7 (Sun)
    day_name            VARCHAR(10) NOT NULL,
    week_number         SMALLINT NOT NULL,
    month_number        SMALLINT NOT NULL,
    month_name          VARCHAR(15) NOT NULL,
    quarter             SMALLINT NOT NULL,
    year                INTEGER NOT NULL,
    is_weekend          BOOLEAN NOT NULL,
    is_promo_period     BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dim_time_date ON analytics.dim_time(full_date);

-- ---------------------------------------------------------------------------
-- 2. DIMENSION: REGION & GEOGRAPHY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_region (
    region_key          SERIAL PRIMARY KEY,
    region_code         VARCHAR(30) NOT NULL UNIQUE,
    region_name         VARCHAR(100) NOT NULL,
    country_code        VARCHAR(10) DEFAULT 'NL' NOT NULL,
    director_name       VARCHAR(100),
    currency            VARCHAR(3) DEFAULT 'EUR' NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3. DIMENSION: STORE / LOCATION
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_store (
    store_key           SERIAL PRIMARY KEY,
    tenant_id           UUID NOT NULL,
    store_id            VARCHAR(50) NOT NULL,
    store_name          VARCHAR(150) NOT NULL,
    region_code         VARCHAR(30) NOT NULL,
    format_type         VARCHAR(50) DEFAULT 'FLAGSHIP', -- FLAGSHIP, URBAN, OUTLET, EXPRESS
    floor_area_sqm      NUMERIC(10, 2),
    assigned_dc_code    VARCHAR(50),
    is_active           BOOLEAN DEFAULT TRUE NOT NULL,
    UNIQUE(tenant_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_dim_store_lookup ON analytics.dim_store(tenant_id, store_id);

-- ---------------------------------------------------------------------------
-- 4. DIMENSION: PRODUCT & MERCHANDISE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_product (
    product_key         SERIAL PRIMARY KEY,
    tenant_id           UUID NOT NULL,
    sku                 VARCHAR(50) NOT NULL,
    sap_matnr           VARCHAR(50),
    product_name        VARCHAR(255) NOT NULL,
    category_name       VARCHAR(100) NOT NULL,
    subcategory_name    VARCHAR(100),
    brand_name          VARCHAR(100),
    unit_cost           NUMERIC(12, 4) DEFAULT 0 NOT NULL,
    selling_price       NUMERIC(12, 4) DEFAULT 0 NOT NULL,
    margin_pct          NUMERIC(5, 2),
    velocity_class      VARCHAR(5) DEFAULT 'B' NOT NULL, -- A, B, C
    is_perishable       BOOLEAN DEFAULT FALSE NOT NULL,
    is_high_value       BOOLEAN DEFAULT FALSE NOT NULL,
    UNIQUE(tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_dim_product_lookup ON analytics.dim_product(tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_dim_product_category ON analytics.dim_product(category_name);

-- ---------------------------------------------------------------------------
-- 5. DIMENSION: SUPPLIER / VENDOR
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_supplier (
    supplier_key        SERIAL PRIMARY KEY,
    tenant_id           UUID NOT NULL,
    supplier_code       VARCHAR(50) NOT NULL,
    supplier_name       VARCHAR(150) NOT NULL,
    standard_lead_days  NUMERIC(5, 1) DEFAULT 3.0 NOT NULL,
    historical_on_time_pct NUMERIC(5, 2) DEFAULT 95.0 NOT NULL,
    order_protocol      VARCHAR(20) DEFAULT 'EDI_850' NOT NULL, -- EDI_850, ODUTY_API, PORTAL
    UNIQUE(tenant_id, supplier_code)
);

-- ---------------------------------------------------------------------------
-- 6. DIMENSION: POS CONNECTOR
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_pos_connector (
    connector_key       SERIAL PRIMARY KEY,
    connector_id        VARCHAR(50) NOT NULL UNIQUE,
    vendor_type         VARCHAR(50) NOT NULL, -- SHOPIFY, SQUARE, CLOVER, LIGHTSPEED, SQL_EDGE, SFTP_CSV
    transport_protocol  VARCHAR(50) NOT NULL, -- WEBHOOK, REST_POLL, SQL_STREAM, BATCH_FILE
    version             VARCHAR(20) DEFAULT 'v1.1' NOT NULL
);

-- ---------------------------------------------------------------------------
-- 7. DIMENSION: CASE TYPE & SEVERITY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_case_type (
    case_type_key       SERIAL PRIMARY KEY,
    case_type_code      VARCHAR(50) NOT NULL UNIQUE,
    display_name        VARCHAR(100) NOT NULL,
    target_sla_minutes  INTEGER DEFAULT 120 NOT NULL,
    default_severity    VARCHAR(20) DEFAULT 'MEDIUM' NOT NULL
);

-- ---------------------------------------------------------------------------
-- 8. DIMENSION: INVENTORY MOVEMENT REASON
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_reason (
    reason_key          SERIAL PRIMARY KEY,
    reason_code         VARCHAR(50) NOT NULL UNIQUE,
    reason_category     VARCHAR(50) NOT NULL, -- COMMERCIAL, SHRINK, CORRECTION, REPLENISHMENT
    is_waste_eligible   BOOLEAN DEFAULT FALSE NOT NULL
);
