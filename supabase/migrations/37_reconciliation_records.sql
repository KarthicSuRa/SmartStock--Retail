-- =============================================================================
-- Migration 37: Inventory Reconciliation Records
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Stores continuous reconciliation records between SmartStock's operational
--   expectation and new SAP checkpoints. Ensures no difference between SAP
--   and SmartStock silently disappears.
-- =============================================================================

CREATE TABLE IF NOT EXISTS inventory_reconciliations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    location_id             UUID NOT NULL,
    material_id             UUID NOT NULL,

    sku                     VARCHAR(50),
    expected_qty            NUMERIC(15, 4) NOT NULL,
    sap_qty                 NUMERIC(15, 4) NOT NULL,

    total_variance          NUMERIC(15, 4) NOT NULL,
    explained_variance      NUMERIC(15, 4) NOT NULL DEFAULT 0,
    unexplained_variance    NUMERIC(15, 4) NOT NULL,

    status                  VARCHAR(40) NOT NULL CHECK (
        status IN (
            'MATCHED',
            'EXPLAINED_VARIANCE',
            'UNEXPLAINED_VARIANCE',
            'MISSING_EVENT',
            'OUT_OF_ORDER_EVENT',
            'MANUAL_REVIEW'
        )
    ),

    explanation             JSONB DEFAULT '{}'::JSONB NOT NULL,
    operational_case_id     UUID,

    created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reconciliations_lookup
    ON inventory_reconciliations(tenant_id, location_id, material_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliations_unexplained
    ON inventory_reconciliations(tenant_id, status)
    WHERE status = 'UNEXPLAINED_VARIANCE';

ALTER TABLE inventory_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_reconciliations ON inventory_reconciliations
    FOR ALL
    USING (
        tenant_id::text = COALESCE(
            auth.jwt() ->> 'tenant_id',
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            auth.jwt() -> 'user_metadata' ->> 'tenant_id',
            'default-tenant'
        )
    );

CREATE POLICY service_role_reconciliations ON inventory_reconciliations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE inventory_reconciliations;
