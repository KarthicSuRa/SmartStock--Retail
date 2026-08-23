-- =============================================================================
-- Migration 58: Analytics Star Schema Facts
-- SmartStock Intelligence & Analytics V1
--
-- PURPOSE:
--   Defines the 7 core analytical fact tables powering store analytics,
--   regional benchmarks, network supply chain intelligence, and pilot scorecards.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FACT: INVENTORY SNAPSHOT
-- Grain: 1 SKU x Location x Snapshot Interval (Hourly / Daily)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.fact_inventory_snapshot (
    snapshot_id             BIGSERIAL PRIMARY KEY,
    time_key                INTEGER NOT NULL REFERENCES analytics.dim_time(time_key),
    tenant_id               UUID NOT NULL,
    store_key               INTEGER NOT NULL REFERENCES analytics.dim_store(store_key),
    product_key             INTEGER NOT NULL REFERENCES analytics.dim_product(product_key),

    -- Derived Quantities
    estimated_on_hand       NUMERIC(15, 4) NOT NULL,
    sellable_qty            NUMERIC(15, 4) NOT NULL,
    reserved_qty            NUMERIC(15, 4) DEFAULT 0 NOT NULL,
    in_transit_qty          NUMERIC(15, 4) DEFAULT 0 NOT NULL,
    sap_recorded_qty        NUMERIC(15, 4) NOT NULL,

    -- Financial & Operational Metrics
    unit_cost               NUMERIC(12, 4) NOT NULL,
    inventory_value_eur     NUMERIC(15, 2) NOT NULL,
    truth_gap_value_eur     NUMERIC(15, 2) NOT NULL, -- (SAP - Sellable) * Unit Cost
    days_of_supply          NUMERIC(8, 2) NOT NULL,
    confidence_score        SMALLINT NOT NULL,      -- 0 - 100
    is_stockout             BOOLEAN NOT NULL,
    is_reconciled           BOOLEAN NOT NULL,
    snapshot_timestamp      TIMESTAMPTZ NOT NULL,

    UNIQUE(time_key, store_key, product_key)
);

CREATE INDEX IF NOT EXISTS idx_fact_snapshot_time_store ON analytics.fact_inventory_snapshot(time_key, store_key);
CREATE INDEX IF NOT EXISTS idx_fact_snapshot_confidence ON analytics.fact_inventory_snapshot(confidence_score);

-- ---------------------------------------------------------------------------
-- 2. FACT: INVENTORY MOVEMENT
-- Grain: 1 Canonical Inventory Event
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.fact_inventory_movement (
    movement_id             BIGSERIAL PRIMARY KEY,
    time_key                INTEGER NOT NULL REFERENCES analytics.dim_time(time_key),
    tenant_id               UUID NOT NULL,
    store_key               INTEGER NOT NULL REFERENCES analytics.dim_store(store_key),
    product_key             INTEGER NOT NULL REFERENCES analytics.dim_product(product_key),
    reason_key              INTEGER NOT NULL REFERENCES analytics.dim_reason(reason_key),

    event_id                UUID NOT NULL,
    event_type              VARCHAR(50) NOT NULL,
    quantity_delta          NUMERIC(15, 4) NOT NULL,
    financial_delta_eur     NUMERIC(15, 2) NOT NULL,
    source_system           VARCHAR(50) NOT NULL,
    business_timestamp      TIMESTAMPTZ NOT NULL,
    ingested_at             TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fact_movement_store_time ON analytics.fact_inventory_movement(store_key, time_key);

-- ---------------------------------------------------------------------------
-- 3. FACT: OPERATIONAL CASES & EXCEPTIONS
-- Grain: 1 Operational Exception Lifecycle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.fact_operational_case (
    case_fact_id            BIGSERIAL PRIMARY KEY,
    time_key                INTEGER NOT NULL REFERENCES analytics.dim_time(time_key),
    tenant_id               UUID NOT NULL,
    store_key               INTEGER NOT NULL REFERENCES analytics.dim_store(store_key),
    product_key             INTEGER REFERENCES analytics.dim_product(product_key),
    case_type_key           INTEGER NOT NULL REFERENCES analytics.dim_case_type(case_type_key),

    case_id                 VARCHAR(50) NOT NULL,
    severity                VARCHAR(20) NOT NULL,
    detected_at             TIMESTAMPTZ NOT NULL,
    assigned_at             TIMESTAMPTZ,
    resolved_at             TIMESTAMPTZ,
    resolution_minutes      INTEGER,
    is_sla_met              BOOLEAN,

    financial_exposure_eur  NUMERIC(15, 2) NOT NULL,
    initial_confidence      SMALLINT NOT NULL,
    final_confidence        SMALLINT,

    recommended_action_type VARCHAR(50) NOT NULL,
    accepted_action_type    VARCHAR(50),
    is_recommendation_accepted BOOLEAN DEFAULT TRUE,
    resolution_outcome      VARCHAR(50) -- RESOLVED_STO, RESOLVED_COUNT, RESOLVED_MARKDOWN, DISMISSED
);

CREATE INDEX IF NOT EXISTS idx_fact_cases_time ON analytics.fact_operational_case(time_key);
CREATE INDEX IF NOT EXISTS idx_fact_cases_store ON analytics.fact_operational_case(store_key);

-- ---------------------------------------------------------------------------
-- 4. FACT: REPLENISHMENT DECISIONS
-- Grain: 1 Replenishment Recommendation & Observed Delivery Outcome
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.fact_replenishment_decision (
    decision_id             BIGSERIAL PRIMARY KEY,
    time_key                INTEGER NOT NULL REFERENCES analytics.dim_time(time_key),
    tenant_id               UUID NOT NULL,
    destination_store_key   INTEGER NOT NULL REFERENCES analytics.dim_store(store_key),
    source_store_key        INTEGER REFERENCES analytics.dim_store(store_key),
    supplier_key            INTEGER REFERENCES analytics.dim_supplier(supplier_key),
    product_key             INTEGER NOT NULL REFERENCES analytics.dim_product(product_key),

    recommendation_id       VARCHAR(50) NOT NULL,
    recommended_type        VARCHAR(30) NOT NULL, -- INTERNAL_TRANSFER, DC_REPLENISHMENT, VENDOR_PO
    recommended_qty         NUMERIC(15, 4) NOT NULL,
    estimated_cost_eur      NUMERIC(12, 2) NOT NULL,
    estimated_lead_hours    NUMERIC(8, 2) NOT NULL,
    sales_exposure_eur      NUMERIC(15, 2) NOT NULL,

    is_approved             BOOLEAN NOT NULL,
    actual_selected_type    VARCHAR(30) NOT NULL,
    actual_approved_qty     NUMERIC(15, 4) NOT NULL,
    actual_cost_eur         NUMERIC(12, 2),
    actual_lead_hours       NUMERIC(8, 2),
    stockout_avoided        BOOLEAN NOT NULL
);

-- ---------------------------------------------------------------------------
-- 5. FACT: RECONCILIATION
-- Grain: 1 Checkpoint Sync Cycle x Store x Product
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.fact_reconciliation (
    recon_fact_id           BIGSERIAL PRIMARY KEY,
    time_key                INTEGER NOT NULL REFERENCES analytics.dim_time(time_key),
    tenant_id               UUID NOT NULL,
    store_key               INTEGER NOT NULL REFERENCES analytics.dim_store(store_key),
    product_key             INTEGER NOT NULL REFERENCES analytics.dim_product(product_key),

    smartstock_expected_qty NUMERIC(15, 4) NOT NULL,
    sap_baseline_qty        NUMERIC(15, 4) NOT NULL,
    total_variance_qty      NUMERIC(15, 4) NOT NULL,
    explained_variance_qty  NUMERIC(15, 4) NOT NULL,
    unexplained_variance_qty NUMERIC(15, 4) NOT NULL,
    unexplained_variance_eur NUMERIC(15, 2) NOT NULL,

    confidence_at_sync      SMALLINT NOT NULL,
    resolution_time_minutes INTEGER,
    sync_timestamp          TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- 6. FACT: POS FEED QUALITY & INGESTION HEALTH
-- Grain: 1 POS Connector x Store x Day
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.fact_pos_feed_health (
    feed_health_id          BIGSERIAL PRIMARY KEY,
    time_key                INTEGER NOT NULL REFERENCES analytics.dim_time(time_key),
    tenant_id               UUID NOT NULL,
    store_key               INTEGER NOT NULL REFERENCES analytics.dim_store(store_key),
    connector_key           INTEGER NOT NULL REFERENCES analytics.dim_pos_connector(connector_key),

    events_received_count   INTEGER NOT NULL,
    duplicates_filtered_count INTEGER NOT NULL,
    sequence_gaps_detected  INTEGER NOT NULL,
    sequence_gaps_repaired  INTEGER NOT NULL,
    unresolved_mappings_count INTEGER NOT NULL,

    feed_confidence_score   SMALLINT NOT NULL, -- 0 - 100
    average_latency_ms      INTEGER NOT NULL,
    is_shadow_mode          BOOLEAN NOT NULL
);

-- ---------------------------------------------------------------------------
-- 7. FACT: PHYSICAL COUNT OUTCOMES
-- Grain: 1 Physical Count Task
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.fact_physical_count (
    count_fact_id           BIGSERIAL PRIMARY KEY,
    time_key                INTEGER NOT NULL REFERENCES analytics.dim_time(time_key),
    tenant_id               UUID NOT NULL,
    store_key               INTEGER NOT NULL REFERENCES analytics.dim_store(store_key),
    product_key             INTEGER NOT NULL REFERENCES analytics.dim_product(product_key),

    system_expected_qty     NUMERIC(15, 4) NOT NULL,
    physical_counted_qty    NUMERIC(15, 4) NOT NULL,
    absolute_variance_qty   NUMERIC(15, 4) NOT NULL,
    variance_value_eur      NUMERIC(15, 2) NOT NULL,
    confidence_before_count SMALLINT NOT NULL,

    count_duration_seconds  INTEGER,
    employee_role           VARCHAR(50) NOT NULL,
    count_outcome_reason    VARCHAR(50) NOT NULL, -- VERIFIED, MISSING, DAMAGED
    adjustment_required     BOOLEAN NOT NULL
);
