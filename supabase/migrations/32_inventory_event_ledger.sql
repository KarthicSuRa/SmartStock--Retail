-- =============================================================================
-- Migration 32: Canonical Inventory Event Ledger
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Replaces the mutable sap_baseline_qty - pos_live_deductions formula with
--   an append-only event sourcing model. Every inventory-changing observation
--   is recorded as an immutable canonical event. Derived state (inventory_position)
--   is computed from this ledger and can always be rebuilt by replaying events.
--
-- DESIGN PRINCIPLES:
--   1. Events are never deleted or overwritten.
--   2. Incorrect events are corrected via reversal/correction events.
--   3. Idempotency is enforced via (tenant_id, source_system, source_event_id) UNIQUE.
--   4. Out-of-order and late events are detected (not rejected) via source_sequence.
--   5. Every event carries enough context to understand why it happened.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. EVENT TYPE ENUM
-- ---------------------------------------------------------------------------
-- Represents every business reason inventory quantity can change.
-- Start lean — add new types via future migrations, not free-text strings.

CREATE TYPE inventory_event_type AS ENUM (
    -- SAP synchronization anchor
    'SAP_CHECKPOINT',           -- Authoritative stock quantity from overnight SAP pull

    -- Point-of-sale events
    'SALE',                     -- Units sold at a POS register
    'SALE_REVERSAL',            -- Full or partial reversal of a prior sale
    'RETURN',                   -- Customer return accepted at store

    -- Supply chain movements
    'GOODS_RECEIPT',            -- Inbound delivery received (PO fulfilled)
    'TRANSFER_IN',              -- Stock received from another plant/store (STO)
    'TRANSFER_OUT',             -- Stock dispatched to another plant/store (STO)

    -- Damage and waste
    'DAMAGE',                   -- Physical damage logged by floor staff
    'EXPIRY',                   -- Goods expired; removed from sellable stock

    -- Physical counting
    'PHYSICAL_COUNT',           -- Actual count recorded during cycle count
    'COUNT_ADJUSTMENT',         -- Manager-approved adjustment after count discrepancy

    -- Reservation management
    'RESERVATION',              -- Quantity set aside for an order/pick
    'RESERVATION_RELEASE',      -- Reservation cancelled/fulfilled; quantity freed

    -- Override / correction
    'MANUAL_ADJUSTMENT'         -- Authorised manual correction with manager approval
);

-- ---------------------------------------------------------------------------
-- 2. SEQUENCE STATUS ENUM
-- ---------------------------------------------------------------------------
-- Classifies an event's temporal relationship to the expected event stream.
-- A gap is a warning, not a rejection — business must not lose data.

CREATE TYPE event_sequence_status AS ENUM (
    'IN_ORDER',         -- Arrived in expected sequence
    'LATE',             -- Arrived out-of-order but within acceptable window
    'GAP_DETECTED',     -- Gap in sequence numbers detected before this event
    'DUPLICATE',        -- Exact duplicate of a previously received event
    'INVALID'           -- Failed validation; stored for audit but not applied
);

-- ---------------------------------------------------------------------------
-- 3. INVENTORY EVENTS TABLE (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_events (
    -- Primary identity
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant + location + material scoping
    tenant_id           UUID NOT NULL,
    location_id         UUID NOT NULL,           -- Maps to erp_plants.id (store / DC / hub)
    material_id         UUID,                    -- NULL allowed for non-material events (e.g. feed health)

    -- Canonical event classification
    event_type          inventory_event_type NOT NULL,

    -- Quantity change this event represents.
    -- Positive = increase, Negative = decrease.
    -- NULL for non-quantity events (e.g. RESERVATION affecting sellable only).
    quantity_delta      NUMERIC(15, 4),
    unit_of_measure     VARCHAR(20),

    -- Source traceability
    source_system       VARCHAR(50) NOT NULL,    -- 'POS', 'SAP', 'PWA', 'WMS', 'MOCK'
    source_event_id     VARCHAR(150) NOT NULL,   -- Original ID in the source system
    source_sequence     BIGINT,                  -- Source system's sequence number (if available)

    -- Timestamps
    business_timestamp  TIMESTAMPTZ NOT NULL,    -- When the event occurred in the real world
    received_timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- When SmartStock received it

    -- Causation tracing (for event chains)
    correlation_id      UUID,   -- Groups related events in one business flow
    causation_id        UUID,   -- The event that caused this event (e.g. SAP_CHECKPOINT causes SALE_REVERSAL review)

    -- Optional reference to external business documents
    reference_type      VARCHAR(50),             -- 'PURCHASE_ORDER', 'MATERIAL_DOCUMENT', 'STO', 'CYCLE_COUNT'
    reference_id        VARCHAR(150),            -- Document number in source system

    -- Sequence evaluation result (assigned by ingestion gateway)
    sequence_status     event_sequence_status NOT NULL DEFAULT 'IN_ORDER',

    -- Schema versioning for forward compatibility
    schema_version      VARCHAR(20) NOT NULL DEFAULT '1.0',

    -- Raw payload from source for debugging and replay
    raw_payload         JSONB NOT NULL DEFAULT '{}',

    -- Flexible metadata (weather context, promotion id, staff id, etc.)
    metadata            JSONB NOT NULL DEFAULT '{}',

    -- Audit timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ---------------------------------------------------------------------------
    -- IDEMPOTENCY CONSTRAINT
    -- The combination of tenant + source system + source event ID must be unique.
    -- This prevents the same POS transaction from deducting inventory twice,
    -- even if the webhook fires multiple times or is replayed from a queue.
    -- ---------------------------------------------------------------------------
    CONSTRAINT uq_event_idempotency UNIQUE (tenant_id, source_system, source_event_id)
);

COMMENT ON TABLE inventory_events IS
    'Append-only canonical inventory event ledger. Every inventory-changing observation is '
    'recorded here as an immutable event. Derived state (inventory_position) is computed from '
    'this table and can be fully rebuilt by replaying events. Never delete or update rows; '
    'use reversal/correction event types instead.';

COMMENT ON COLUMN inventory_events.quantity_delta IS
    'Signed quantity change: positive = stock increase, negative = stock decrease. '
    'NULL for events that only affect sellable/reserved split (e.g. RESERVATION).';

COMMENT ON COLUMN inventory_events.source_event_id IS
    'Original ID from the source system. Together with tenant_id and source_system this '
    'enforces idempotency across the entire event pipeline.';

COMMENT ON COLUMN inventory_events.sequence_status IS
    'Assigned by the ingestion gateway. GAP_DETECTED creates an integration warning case '
    'but does NOT reject the event — losing data is worse than processing out-of-order data.';

-- ---------------------------------------------------------------------------
-- 4. INDEXES
-- ---------------------------------------------------------------------------

-- Primary query pattern: "what events exist for this material at this location?"
CREATE INDEX IF NOT EXISTS idx_events_location_material
    ON inventory_events (tenant_id, location_id, material_id, business_timestamp DESC);

-- Source system ingestion deduplication lookup
CREATE INDEX IF NOT EXISTS idx_events_source
    ON inventory_events (tenant_id, source_system, source_event_id);

-- Event type filtering (e.g. "show me all SAP_CHECKPOINTs")
CREATE INDEX IF NOT EXISTS idx_events_type
    ON inventory_events (tenant_id, event_type, business_timestamp DESC);

-- Sequence gap detection queries
CREATE INDEX IF NOT EXISTS idx_events_sequence
    ON inventory_events (tenant_id, location_id, source_system, source_sequence)
    WHERE source_sequence IS NOT NULL;

-- Correlation tracing
CREATE INDEX IF NOT EXISTS idx_events_correlation
    ON inventory_events (correlation_id)
    WHERE correlation_id IS NOT NULL;

-- Late / invalid events monitoring
CREATE INDEX IF NOT EXISTS idx_events_sequence_status
    ON inventory_events (tenant_id, sequence_status, received_timestamp DESC)
    WHERE sequence_status != 'IN_ORDER';

-- ---------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------------

ALTER TABLE inventory_events ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: users can only see events belonging to their tenant.
-- The JWT claim 'tenant_id' must be set by the auth-store-claims Edge Function.
CREATE POLICY tenant_isolation ON inventory_events
    FOR ALL
    USING (
        tenant_id::text = COALESCE(
            auth.jwt() ->> 'tenant_id',
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            auth.jwt() -> 'user_metadata' ->> 'tenant_id',
            'default-tenant'
        )
    );

-- Service role bypass for Edge Functions (projection workers, etc.)
CREATE POLICY service_role_bypass ON inventory_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. REALTIME PUBLICATION
-- ---------------------------------------------------------------------------
-- Allow Supabase Realtime to push new events to subscribed clients.
-- UI components can subscribe to inventory changes without polling.

ALTER PUBLICATION supabase_realtime ADD TABLE inventory_events;

-- ---------------------------------------------------------------------------
-- 7. SOURCE SEQUENCE GAP DETECTION FUNCTION
-- ---------------------------------------------------------------------------
-- Called by ingestion gateway to classify event sequence status.
-- Returns the appropriate event_sequence_status for a new incoming event.

CREATE OR REPLACE FUNCTION evaluate_event_sequence(
    p_tenant_id     UUID,
    p_location_id   UUID,
    p_source_system VARCHAR,
    p_sequence      BIGINT
)
RETURNS event_sequence_status
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_max_seq   BIGINT;
    v_has_gap   BOOLEAN;
BEGIN
    -- If no sequence number provided, we can't evaluate order
    IF p_sequence IS NULL THEN
        RETURN 'IN_ORDER'::event_sequence_status;
    END IF;

    -- Find the highest sequence number previously seen for this source/location
    SELECT MAX(source_sequence)
    INTO v_max_seq
    FROM inventory_events
    WHERE tenant_id   = p_tenant_id
      AND location_id = p_location_id
      AND source_system = p_source_system
      AND source_sequence IS NOT NULL;

    -- No prior events — this is the first one
    IF v_max_seq IS NULL THEN
        RETURN 'IN_ORDER'::event_sequence_status;
    END IF;

    -- Sequence is behind what we've already seen — this is a late event
    IF p_sequence <= v_max_seq THEN
        RETURN 'LATE'::event_sequence_status;
    END IF;

    -- Sequence jumped by more than 1 — gap detected
    IF p_sequence > v_max_seq + 1 THEN
        RETURN 'GAP_DETECTED'::event_sequence_status;
    END IF;

    -- Perfectly sequential
    RETURN 'IN_ORDER'::event_sequence_status;
END;
$$;

COMMENT ON FUNCTION evaluate_event_sequence IS
    'Evaluates whether an incoming event arrives in order relative to previously seen '
    'events from the same source system. Called synchronously by the ingestion gateway. '
    'Returns GAP_DETECTED when sequence numbers skip — this triggers an integration '
    'warning case without rejecting the event.';

-- ---------------------------------------------------------------------------
-- 8. HELPER VIEW: LATEST EVENT PER MATERIAL
-- ---------------------------------------------------------------------------
-- Used by projection worker to find the most recent event for a given position.

CREATE OR REPLACE VIEW v_latest_events_per_material AS
SELECT DISTINCT ON (tenant_id, location_id, material_id)
    tenant_id,
    location_id,
    material_id,
    id          AS latest_event_id,
    event_type  AS latest_event_type,
    business_timestamp AS latest_event_at,
    quantity_delta,
    source_system
FROM inventory_events
WHERE sequence_status != 'INVALID'
ORDER BY tenant_id, location_id, material_id, business_timestamp DESC;

GRANT SELECT ON v_latest_events_per_material TO authenticated;
GRANT SELECT ON v_latest_events_per_material TO service_role;
