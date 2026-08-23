-- =============================================================================
-- Migration 34: Operational Cases & Exceptions Engine
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Converts inventory intelligence into actionable work items. Replaces
--   passive monitoring dashboards with an Exception Inbox driving daily
--   store and management actions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS operational_cases (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,

    case_type               VARCHAR(50) NOT NULL CHECK (
        case_type IN (
            'STOCKOUT_RISK',
            'INVENTORY_UNCERTAINTY',
            'SAP_VARIANCE',
            'EXPIRY_RISK',
            'REPLENISHMENT_REQUIRED',
            'SHRINK_SUSPECTED',
            'SAP_POST_FAILURE',
            'POS_FEED_FAILURE'
        )
    ),
    severity                VARCHAR(20) NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    status                  VARCHAR(30) DEFAULT 'OPEN' NOT NULL CHECK (
        status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'RESOLVED', 'CANCELLED')
    ),

    location_id             UUID,
    material_id             UUID,
    sku                     VARCHAR(50),

    confidence              NUMERIC(5, 2),
    financial_exposure      NUMERIC(14, 2) DEFAULT 0.00,

    detected_at             TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    due_at                  TIMESTAMPTZ,

    assigned_role           VARCHAR(50) DEFAULT 'floor_staff',
    assigned_user           UUID,

    recommended_action      JSONB DEFAULT '{}'::JSONB NOT NULL,
    resolution              JSONB,

    correlation_id          UUID,
    resolved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_status
    ON operational_cases(tenant_id, status, severity, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_location
    ON operational_cases(tenant_id, location_id, status);

CREATE INDEX IF NOT EXISTS idx_cases_due
    ON operational_cases(due_at ASC)
    WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS');

ALTER TABLE operational_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_cases ON operational_cases
    FOR ALL
    USING (
        tenant_id::text = COALESCE(
            auth.jwt() ->> 'tenant_id',
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            auth.jwt() -> 'user_metadata' ->> 'tenant_id',
            'default-tenant'
        )
    );

CREATE POLICY service_role_cases ON operational_cases
    FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE operational_cases;
