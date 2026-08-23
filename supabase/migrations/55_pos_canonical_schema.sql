-- =============================================================================
-- Migration 55: Universal POS Gateway Canonical Schema & Foundations
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Extends pos_transactions with lifecycle versioning and inventory effect tracking.
--   Adds tables for polling cursors, connection health, reconciliation runs,
--   cross-system identity mapping (products & locations), and UOM conversions.
-- =============================================================================

-- 1. Extend pos_transactions for lifecycle state reduction
ALTER TABLE pos_transactions
ADD COLUMN IF NOT EXISTS source_version VARCHAR(100),
ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) DEFAULT 'SALE',
ADD COLUMN IF NOT EXISTS current_inventory_effect JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS previous_inventory_effect JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS source_sequence BIGINT,
ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT NOW();

-- 2. POS Connector Polling Cursors
CREATE TABLE IF NOT EXISTS pos_connector_cursors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pos_config_id       UUID NOT NULL REFERENCES pos_configurations(id) ON DELETE CASCADE,
    last_fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_page_token     TEXT,
    last_sequence       BIGINT,
    metadata            JSONB DEFAULT '{}',
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, pos_config_id)
);

-- 3. POS Feed Health & Telemetry
CREATE TABLE IF NOT EXISTS pos_feed_health (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pos_config_id       UUID NOT NULL REFERENCES pos_configurations(id) ON DELETE CASCADE,
    health_status       VARCHAR(20) NOT NULL DEFAULT 'HEALTHY' CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'STALE', 'FAILED')),
    last_event_at       TIMESTAMPTZ,
    last_reconciled_at  TIMESTAMPTZ,
    lag_seconds         NUMERIC(10,2) DEFAULT 0,
    sequence_gap_count  INTEGER DEFAULT 0,
    feed_confidence     INTEGER DEFAULT 100,
    events_today        BIGINT DEFAULT 0,
    duplicates_today    BIGINT DEFAULT 0,
    gaps_repaired_today INTEGER DEFAULT 0,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, pos_config_id)
);

-- 4. POS Reconciliation Audit Runs
CREATE TABLE IF NOT EXISTS pos_reconciliation_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pos_config_id       UUID NOT NULL REFERENCES pos_configurations(id) ON DELETE CASCADE,
    run_started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_completed_at    TIMESTAMPTZ,
    transactions_scanned INTEGER DEFAULT 0,
    missing_transactions_found INTEGER DEFAULT 0,
    corrections_emitted INTEGER DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL')),
    error_message       TEXT
);

-- 5. Product Identity Mapping (POS External IDs -> SmartStock SKU / Material)
CREATE TABLE IF NOT EXISTS pos_product_identity_map (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    smartstock_sku      VARCHAR(100) NOT NULL,
    sap_material_id     UUID,
    source_system       VARCHAR(50) NOT NULL,
    external_id         VARCHAR(200) NOT NULL,
    id_type             VARCHAR(20) NOT NULL CHECK (id_type IN ('SKU', 'BARCODE', 'VARIANT_ID', 'PLU', 'CATALOG_ID')),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, source_system, external_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_product_lookup
    ON pos_product_identity_map(tenant_id, source_system, external_id);

-- 6. Location Identity Mapping (POS External Store/Terminal -> SmartStock Store ID)
CREATE TABLE IF NOT EXISTS pos_location_identity_map (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    smartstock_location_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    source_system       VARCHAR(50) NOT NULL,
    external_location_id VARCHAR(200) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, source_system, external_location_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_location_lookup
    ON pos_location_identity_map(tenant_id, source_system, external_location_id);

-- 7. UOM Conversion Rules
CREATE TABLE IF NOT EXISTS pos_uom_conversions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sku                 VARCHAR(100) NOT NULL,
    source_uom          VARCHAR(20) NOT NULL,
    base_uom            VARCHAR(20) NOT NULL,
    factor              NUMERIC(12, 6) NOT NULL, -- e.g. 1 CASE = 12 EA -> factor = 12.0
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, sku, source_uom)
);

-- RLS Enablement
ALTER TABLE pos_connector_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_feed_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_product_identity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_location_identity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_uom_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_pos_cursors ON pos_connector_cursors FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_health ON pos_feed_health FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_runs ON pos_reconciliation_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_product_map ON pos_product_identity_map FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_location_map ON pos_location_identity_map FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pos_uom ON pos_uom_conversions FOR ALL TO service_role USING (true) WITH CHECK (true);
