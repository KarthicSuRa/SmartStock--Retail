-- =============================================================================
-- Migration 33: Operational Inventory Position (Derived Digital Twin)
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Maintains the real-time derived operational state (Digital Twin) computed
--   from canonical inventory_events. Distinguishes estimated on-hand, sellable,
--   reserved, and in-transit quantities, along with explicit confidence scores
--   and reconciliation outcomes.
--
-- PRINCIPLES:
--   1. Derived state can always be rebuilt by replaying inventory_events.
--   2. Discrepancies between SAP checkpoint and operational estimate are tracked
--      without silently overwriting variances.
--   3. Confidence is explicitly scored (0-100) and accompanied by human-readable
--      explanations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. INVENTORY POSITION READ-MODEL TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_position (
    tenant_id               UUID NOT NULL,
    location_id             UUID NOT NULL,           -- Corresponds to erp_plants.id or plant code
    material_id             UUID NOT NULL,           -- Corresponds to material_master.id

    sku                     VARCHAR(50) NOT NULL,
    product_name            VARCHAR(255),
    uom                     VARCHAR(10) DEFAULT 'PC' NOT NULL,

    -- Quantities
    erp_checkpoint_qty      NUMERIC(15, 4) DEFAULT 0 NOT NULL, -- Most recent SAP checkpoint baseline
    estimated_on_hand       NUMERIC(15, 4) DEFAULT 0 NOT NULL, -- Real-time operational stock
    sellable_qty            NUMERIC(15, 4) DEFAULT 0 NOT NULL, -- On-hand minus active reservations/holds
    reserved_qty            NUMERIC(15, 4) DEFAULT 0 NOT NULL, -- Allocated for pick/staging/promotions
    in_transit_qty          NUMERIC(15, 4) DEFAULT 0 NOT NULL, -- Open Purchase Orders / STOs in transit

    -- Physical Auditing State
    last_physical_count_qty NUMERIC(15, 4),
    last_physical_count_at  TIMESTAMPTZ,

    -- Uncertainty & Confidence
    confidence_score        NUMERIC(5, 2) DEFAULT 100.00 NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    confidence_classification VARCHAR(20) DEFAULT 'HIGH' NOT NULL CHECK (confidence_classification IN ('HIGH', 'MEDIUM', 'LOW')),
    confidence_explanation  JSONB DEFAULT '{"score": 100, "reasons": ["Initial baseline synchronized"]}'::JSONB NOT NULL,

    -- Reconciliation State with SAP
    reconciliation_status   VARCHAR(40) DEFAULT 'MATCHED' NOT NULL CHECK (
        reconciliation_status IN (
            'MATCHED',
            'EXPLAINED_VARIANCE',
            'UNEXPLAINED_VARIANCE',
            'MISSING_EVENT',
            'OUT_OF_ORDER_EVENT',
            'PENDING_RECONCILIATION',
            'MANUAL_REVIEW'
        )
    ),
    last_reconciliation_at  TIMESTAMPTZ,

    -- Projection tracking & Optimistic concurrency
    last_event_id           UUID REFERENCES inventory_events(id) ON DELETE SET NULL,
    last_event_at           TIMESTAMPTZ,
    projection_version      BIGINT DEFAULT 1 NOT NULL,

    created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    PRIMARY KEY (tenant_id, location_id, material_id)
);

COMMENT ON TABLE inventory_position IS
    'Operational inventory digital twin. A derived read model calculated by projecting '
    'canonical inventory_events. If projection rules evolve, this table can be rebuilt '
    'at any time by replaying event history.';

-- ---------------------------------------------------------------------------
-- 2. PROJECTION & RECONCILIATION QUEUES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projection_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID NOT NULL REFERENCES inventory_events(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL,
    location_id         UUID NOT NULL,
    material_id         UUID,
    event_type          inventory_event_type NOT NULL,
    quantity_delta      NUMERIC(15, 4),
    business_timestamp  TIMESTAMPTZ NOT NULL,
    status              VARCHAR(20) DEFAULT 'PENDING' NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    attempts            INTEGER DEFAULT 0 NOT NULL,
    last_error          TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    processed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_projection_queue_pending
    ON projection_queue(status, created_at ASC)
    WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS reconciliation_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    location_id         UUID NOT NULL,
    material_id         UUID,
    sap_qty             NUMERIC(15, 4),
    status              VARCHAR(20) DEFAULT 'PENDING' NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    processed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_queue_pending
    ON reconciliation_queue(status, created_at ASC)
    WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- 3. INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_inventory_position_lookup
    ON inventory_position(tenant_id, location_id, sku);

CREATE INDEX IF NOT EXISTS idx_inventory_position_confidence
    ON inventory_position(tenant_id, location_id, confidence_classification);

CREATE INDEX IF NOT EXISTS idx_inventory_position_reconciliation
    ON inventory_position(tenant_id, location_id, reconciliation_status)
    WHERE reconciliation_status != 'MATCHED';

-- ---------------------------------------------------------------------------
-- 4. ROW-LEVEL SECURITY & REALTIME
-- ---------------------------------------------------------------------------

ALTER TABLE inventory_position ENABLE ROW LEVEL SECURITY;
ALTER TABLE projection_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_position ON inventory_position
    FOR ALL
    USING (
        tenant_id::text = COALESCE(
            auth.jwt() ->> 'tenant_id',
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            auth.jwt() -> 'user_metadata' ->> 'tenant_id',
            'default-tenant'
        )
    );

CREATE POLICY service_role_position ON inventory_position
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_proj_queue ON projection_queue
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_rec_queue ON reconciliation_queue
    FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE inventory_position;
