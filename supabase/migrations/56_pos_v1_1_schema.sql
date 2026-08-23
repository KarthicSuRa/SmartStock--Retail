-- =============================================================================
-- Migration 56: Universal POS Gateway V1.1 Enterprise Extensions
-- SmartStock LiveRetail V2
-- =============================================================================

-- 1. Extend pos_transactions for version monotonicity & collision detection
ALTER TABLE pos_transactions
ADD COLUMN IF NOT EXISTS latest_source_version VARCHAR(100),
ADD COLUMN IF NOT EXISTS latest_source_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS latest_payload_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS version_resolution VARCHAR(20) DEFAULT 'NEW';

-- 2. Extend pos_configurations for shadow mode and expected feed telemetry
ALTER TABLE pos_configurations
ADD COLUMN IF NOT EXISTS activation_mode VARCHAR(20) NOT NULL DEFAULT 'LIVE' CHECK (activation_mode IN ('LIVE', 'SHADOW', 'DISABLED')),
ADD COLUMN IF NOT EXISTS shadow_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS shadow_transactions_processed BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS shadow_mapping_success_rate NUMERIC(5,2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS expected_event_frequency_minutes INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS maximum_silence_minutes INTEGER DEFAULT 15;

-- 3. Bundle / Composite Product BOM
CREATE TABLE IF NOT EXISTS pos_product_bom (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bundle_sku          VARCHAR(100) NOT NULL,
    component_sku       VARCHAR(100) NOT NULL,
    component_quantity  NUMERIC(12, 6) NOT NULL DEFAULT 1.0,
    component_uom       VARCHAR(20) NOT NULL DEFAULT 'PC',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, bundle_sku, component_sku)
);

CREATE INDEX IF NOT EXISTS idx_pos_bom_lookup ON pos_product_bom(tenant_id, bundle_sku);

-- 4. Universal Non-Stock Line Behavior Config
CREATE TABLE IF NOT EXISTS pos_line_inventory_config (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_system       VARCHAR(50) NOT NULL,
    line_identifier_pattern VARCHAR(200) NOT NULL,
    match_type          VARCHAR(20) NOT NULL CHECK (match_type IN ('SKU_PREFIX', 'NAME_CONTAINS', 'LINE_TYPE', 'EXACT_SKU')),
    inventory_behavior  VARCHAR(20) NOT NULL DEFAULT 'NON_STOCK' CHECK (inventory_behavior IN ('STOCK', 'NON_STOCK', 'COMPOSITE', 'CONFIGURED')),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, source_system, line_identifier_pattern)
);

-- 5. Identity, UOM & Location Quarantine Store
CREATE TABLE IF NOT EXISTS pos_identity_quarantine (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pos_config_id       UUID NOT NULL REFERENCES pos_configurations(id) ON DELETE CASCADE,
    quarantine_type     VARCHAR(40) NOT NULL CHECK (quarantine_type IN ('PRODUCT_MAPPING_REQUIRED', 'LOCATION_MAPPING_REQUIRED', 'UOM_MAPPING_REQUIRED')),
    external_id         VARCHAR(200) NOT NULL,
    source_system       VARCHAR(50) NOT NULL,
    occurrence_count    INTEGER DEFAULT 1,
    suggested_target_id VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'IGNORED')),
    first_seen_at       TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, source_system, quarantine_type, external_id)
);

CREATE TABLE IF NOT EXISTS pos_quarantined_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pos_config_id       UUID NOT NULL REFERENCES pos_configurations(id) ON DELETE CASCADE,
    quarantine_id       UUID REFERENCES pos_identity_quarantine(id) ON DELETE SET NULL,
    source_transaction_id VARCHAR(100) NOT NULL,
    raw_transaction     JSONB NOT NULL,
    replay_status       VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (replay_status IN ('PENDING', 'REPLAYED', 'FAILED', 'DISCARDED')),
    replayed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Grocery Weighted Barcode & PLU Rules
CREATE TABLE IF NOT EXISTS pos_barcode_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    prefix              VARCHAR(10) NOT NULL,
    rule_type           VARCHAR(20) NOT NULL CHECK (rule_type IN ('WEIGHT_EMBEDDED', 'PRICE_EMBEDDED', 'PLU_DIRECT')),
    plu_start_pos       INTEGER NOT NULL DEFAULT 2,
    plu_length          INTEGER NOT NULL DEFAULT 5,
    quantity_start_pos  INTEGER NOT NULL DEFAULT 7,
    quantity_length     INTEGER NOT NULL DEFAULT 5,
    quantity_divisor    NUMERIC(10,3) NOT NULL DEFAULT 1000.0,
    quantity_uom        VARCHAR(10) NOT NULL DEFAULT 'KG',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, prefix)
);

-- 7. POS Shadow Mode Events
CREATE TABLE IF NOT EXISTS pos_shadow_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pos_config_id       UUID NOT NULL REFERENCES pos_configurations(id) ON DELETE CASCADE,
    source_transaction_id VARCHAR(100) NOT NULL,
    computed_inventory_effect JSONB NOT NULL,
    mapping_status      VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    unresolved_items    TEXT[],
    payload             JSONB NOT NULL,
    processed_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pos_product_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_line_inventory_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_identity_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_quarantined_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_barcode_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shadow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_pos_bom ON pos_product_bom FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_line_cfg ON pos_line_inventory_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_quarantine ON pos_identity_quarantine FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_quarantined_evts ON pos_quarantined_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_barcode_rules ON pos_barcode_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_shadow ON pos_shadow_events FOR ALL TO service_role USING (true) WITH CHECK (true);
