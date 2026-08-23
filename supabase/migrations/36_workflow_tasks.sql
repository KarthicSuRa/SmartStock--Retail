-- =============================================================================
-- Migration 36: Workflow Tasks & Approval Governance
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Transforms operational cases into employee tasks with auditable approval
--   chains and configurable financial approval policies.
-- =============================================================================

CREATE TABLE IF NOT EXISTS approval_policies (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,

    action_type             VARCHAR(50) NOT NULL CHECK (action_type IN ('INVENTORY_ADJUSTMENT', 'PURCHASE_REQUISITION', 'STOCK_TRANSFER', 'DAMAGE_WRITE_OFF')),
    min_amount              NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    max_amount              NUMERIC(14, 2), -- NULL = unbounded upper limit

    required_role           VARCHAR(50) NOT NULL CHECK (required_role IN ('auto_approved', 'store_manager', 'district_manager', 'regional_controller')),
    is_active               BOOLEAN DEFAULT TRUE NOT NULL,

    created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_tasks (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    operational_case_id     UUID REFERENCES operational_cases(id) ON DELETE CASCADE,

    task_type               VARCHAR(50) NOT NULL,
    status                  VARCHAR(30) DEFAULT 'OPEN' NOT NULL CHECK (
        status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'RESOLVED', 'CANCELLED')
    ),

    location_id             UUID NOT NULL,
    assigned_role           VARCHAR(50) DEFAULT 'floor_staff' NOT NULL,
    assigned_user           UUID,

    task_data               JSONB DEFAULT '{}'::JSONB NOT NULL,
    worker_result           JSONB,

    requires_approval       BOOLEAN DEFAULT FALSE NOT NULL,
    approval_role           VARCHAR(50),
    approved_by             UUID,
    approved_at             TIMESTAMPTZ,
    rejection_reason        TEXT,

    due_at                  TIMESTAMPTZ,
    resolved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status
    ON workflow_tasks(tenant_id, location_id, status);

ALTER TABLE approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policies ON approval_policies
    FOR ALL
    USING (
        tenant_id::text = COALESCE(
            auth.jwt() ->> 'tenant_id',
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            auth.jwt() -> 'user_metadata' ->> 'tenant_id',
            'default-tenant'
        )
    );

CREATE POLICY tenant_isolation_tasks ON workflow_tasks
    FOR ALL
    USING (
        tenant_id::text = COALESCE(
            auth.jwt() ->> 'tenant_id',
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            auth.jwt() -> 'user_metadata' ->> 'tenant_id',
            'default-tenant'
        )
    );

CREATE POLICY service_role_policies ON approval_policies FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_tasks ON workflow_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE workflow_tasks;
