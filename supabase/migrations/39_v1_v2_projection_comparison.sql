-- =============================================================================
-- Migration 39: V1 vs V2 Projection Parity Comparator
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Supports Phase A of the dual-write elimination migration plan:
--   Monitors and records differences between the legacy V1 calculation and
--   the V2 event-sourced digital twin until 99.99% convergence is proven.
-- =============================================================================

CREATE TABLE IF NOT EXISTS projection_comparison (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    location_id         UUID NOT NULL,
    sku                 VARCHAR(50) NOT NULL,
    sampled_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- V1 calculation (from legacy live_inventory_ledger)
    v1_legacy_qty       NUMERIC(15, 4),

    -- V2 operational projection (from inventory_position)
    v2_estimated_qty    NUMERIC(15, 4),

    -- Difference
    difference          NUMERIC(15, 4) GENERATED ALWAYS AS (COALESCE(v2_estimated_qty, 0) - COALESCE(v1_legacy_qty, 0)) STORED,
    pct_difference      NUMERIC(8, 4),

    -- Classification
    agreement_status    VARCHAR(30) NOT NULL CHECK (agreement_status IN (
        'MATCHED',             -- difference = 0
        'EXPLAINED',           -- difference explained by known pending event offset
        'UNEXPLAINED',         -- divergence requiring investigation
        'V1_MISSING',          -- SKU exists in V2 but not in V1
        'V2_MISSING'           -- SKU exists in V1 but not in V2
    )),

    explanation         JSONB DEFAULT '{}'::JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projection_comparison_status
    ON projection_comparison(tenant_id, agreement_status, sampled_at DESC);

ALTER TABLE projection_comparison ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_comparison ON projection_comparison
    FOR ALL
    USING (
        tenant_id::text = COALESCE(
            auth.jwt() ->> 'tenant_id',
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            auth.jwt() -> 'user_metadata' ->> 'tenant_id',
            'default-tenant'
        )
    );

CREATE POLICY service_role_comparison ON projection_comparison
    FOR ALL TO service_role USING (true) WITH CHECK (true);
