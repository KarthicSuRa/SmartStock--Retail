-- =============================================================================
-- Migration 47: Business Service Level Objective (SLO) Views
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Provides continuous monitoring of retail pipeline SLOs:
--   1. POS feed health & silent store detection (> 15m without events)
--   2. Projection queue lag and backlog depth
--   3. Outbox delivery success rate and OUTCOME_UNKNOWN count
-- =============================================================================

-- 1. Silent Store Detection (No POS events in > 15m during store hours)
CREATE OR REPLACE VIEW v_silent_stores AS
SELECT
    tenant_id,
    location_id,
    MAX(received_timestamp) AS last_event_at,
    NOW() - MAX(received_timestamp) AS silence_duration
FROM inventory_events
WHERE source_system = 'POS'
GROUP BY tenant_id, location_id
HAVING MAX(received_timestamp) < (NOW() - INTERVAL '15 minutes');

-- 2. Projection Queue Latency & Backlog
CREATE OR REPLACE VIEW v_projection_queue_slo AS
SELECT
    tenant_id,
    COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_jobs,
    COUNT(*) FILTER (WHERE status = 'PROCESSING') AS active_jobs,
    COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_jobs,
    MAX(NOW() - created_at) FILTER (WHERE status = 'PENDING') AS oldest_pending_age
FROM projection_queue
GROUP BY tenant_id;

-- 3. Outbox Reliability SLO
CREATE OR REPLACE VIEW v_outbox_reliability_slo AS
SELECT
    tenant_id,
    COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_total,
    COUNT(*) FILTER (WHERE status = 'RETRYING') AS retrying_total,
    COUNT(*) FILTER (WHERE status = 'OUTCOME_UNKNOWN') AS outcome_unknown_total,
    COUNT(*) FILTER (WHERE status = 'DEAD_LETTER') AS dead_letter_total
FROM integration_outbox
GROUP BY tenant_id;

GRANT SELECT ON v_silent_stores TO authenticated, service_role;
GRANT SELECT ON v_projection_queue_slo TO authenticated, service_role;
GRANT SELECT ON v_outbox_reliability_slo TO authenticated, service_role;
