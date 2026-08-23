-- =============================================================================
-- Migration 35: Generic Enterprise Integration Outbox
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Guarantees reliable, durable, and idempotent outbound communication to
--   SAP S/4HANA and external enterprise systems.
--
-- DESIGN:
--   1. Outbox pattern ensures transactions are never lost if SAP is down.
--   2. Atomic worker claiming via SELECT ... FOR UPDATE SKIP LOCKED prevents
--      concurrent workers from double-processing the same document.
--   3. Explicit OUTCOME_UNKNOWN state prevents accidental duplicate document
--      creation when a network timeout occurs after SAP commit.
-- =============================================================================

CREATE TABLE IF NOT EXISTS integration_outbox (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,

    destination             VARCHAR(50) NOT NULL,    -- 'SAP_S4HANA', 'WMS', 'MOCK_SAP'
    operation_type          VARCHAR(100) NOT NULL,   -- 'POST_GOODS_ISSUE_551', 'CREATE_PURCHASE_ORDER_NB', 'CREATE_STO_UB'

    aggregate_type          VARCHAR(50),             -- 'BUFFERED_SCRAP', 'STAGED_PR', 'OPERATIONAL_CASE'
    aggregate_id            UUID,
    correlation_id          UUID,

    payload                 JSONB NOT NULL,

    status                  VARCHAR(30) DEFAULT 'PENDING' NOT NULL CHECK (
        status IN (
            'PENDING',
            'PROCESSING',
            'RETRYING',
            'COMPLETED',
            'OUTCOME_UNKNOWN',
            'DEAD_LETTER',
            'MANUAL_REVIEW',
            'CANCELLED'
        )
    ),

    attempts                INTEGER DEFAULT 0 NOT NULL,
    max_attempts            INTEGER DEFAULT 8 NOT NULL,
    next_attempt_at         TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    locked_at               TIMESTAMPTZ,
    locked_by               VARCHAR(100),

    external_document_id    VARCHAR(150),
    idempotency_key         VARCHAR(200) NOT NULL UNIQUE,

    last_error_code         VARCHAR(100),
    last_error_details      JSONB,

    created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending_claim
    ON integration_outbox(status, next_attempt_at ASC)
    WHERE status IN ('PENDING', 'RETRYING');

CREATE INDEX IF NOT EXISTS idx_outbox_outcome_unknown
    ON integration_outbox(status)
    WHERE status = 'OUTCOME_UNKNOWN';

ALTER TABLE integration_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_outbox ON integration_outbox
    FOR ALL
    USING (
        tenant_id::text = COALESCE(
            auth.jwt() ->> 'tenant_id',
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            auth.jwt() -> 'user_metadata' ->> 'tenant_id',
            'default-tenant'
        )
    );

CREATE POLICY service_role_outbox ON integration_outbox
    FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE integration_outbox;
