-- =============================================================================
-- Migration 62: Slowly Changing Dimensions (SCD Type 2)
-- SmartStock Intelligence RC1
--
-- PURPOSE:
--   Implements SCD Type 2 tracking for dim_product and dim_store to preserve
--   historical analytical reporting truth when categories, regions, or prices change.
-- =============================================================================

-- Add SCD Type 2 tracking columns to dim_product
ALTER TABLE analytics.dim_product
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT '1970-01-01 00:00:00+00' NOT NULL,
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ DEFAULT '9999-12-31 23:59:59+00' NOT NULL,
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT TRUE NOT NULL,
    ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dim_product_scd ON analytics.dim_product(sku, is_current);

-- Add SCD Type 2 tracking columns to dim_store
ALTER TABLE analytics.dim_store
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT '1970-01-01 00:00:00+00' NOT NULL,
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ DEFAULT '9999-12-31 23:59:59+00' NOT NULL,
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT TRUE NOT NULL,
    ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dim_store_scd ON analytics.dim_store(store_id, is_current);

-- ---------------------------------------------------------------------------
-- Function: Look up historically active product surrogate key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.get_historical_product_key(
    p_tenant_id UUID,
    p_sku VARCHAR(50),
    p_as_of TIMESTAMPTZ
)
RETURNS INTEGER AS $$
DECLARE
    v_product_key INTEGER;
BEGIN
    SELECT product_key INTO v_product_key
    FROM analytics.dim_product
    WHERE tenant_id = p_tenant_id
      AND sku = p_sku
      AND valid_from <= p_as_of
      AND valid_to > p_as_of
    LIMIT 1;

    RETURN v_product_key;
END;
$$ LANGUAGE plpgsql STABLE;
