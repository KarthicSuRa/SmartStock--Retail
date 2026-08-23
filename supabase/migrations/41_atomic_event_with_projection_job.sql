-- =============================================================================
-- Migration 41: Transactional Event-With-Projection Scheduling
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Guarantees atomic co-insertion of canonical inventory_events and their
--   corresponding projection_queue jobs inside a single database transaction.
--   Eliminates orphaned events where an event is inserted but worker job fails.
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_inventory_event_with_projection(
    p_event JSONB
)
RETURNS TABLE(event_id UUID, queue_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
    v_event_id   UUID;
    v_queue_id   UUID;
    v_status     event_sequence_status;
BEGIN
    v_status := COALESCE((p_event->>'sequence_status')::event_sequence_status, 'IN_ORDER'::event_sequence_status);

    -- 1. Insert into append-only inventory_events ledger
    INSERT INTO inventory_events (
        tenant_id,
        location_id,
        material_id,
        event_type,
        quantity_delta,
        unit_of_measure,
        source_system,
        source_event_id,
        source_sequence,
        business_timestamp,
        received_timestamp,
        correlation_id,
        causation_id,
        reference_type,
        reference_id,
        sequence_status,
        schema_version,
        raw_payload,
        metadata
    )
    VALUES (
        (p_event->>'tenant_id')::UUID,
        (p_event->>'location_id')::UUID,
        (p_event->>'material_id')::UUID,
        (p_event->>'event_type')::inventory_event_type,
        (p_event->>'quantity_delta')::NUMERIC,
        p_event->>'unit_of_measure',
        p_event->>'source_system',
        p_event->>'source_event_id',
        (p_event->>'source_sequence')::BIGINT,
        (p_event->>'business_timestamp')::TIMESTAMPTZ,
        NOW(),
        (p_event->>'correlation_id')::UUID,
        (p_event->>'causation_id')::UUID,
        p_event->>'reference_type',
        p_event->>'reference_id',
        v_status,
        COALESCE(p_event->>'schema_version', '1.0'),
        COALESCE((p_event->>'raw_payload')::JSONB, '{}'::JSONB),
        COALESCE((p_event->>'metadata')::JSONB, '{}'::JSONB)
    )
    RETURNING id INTO v_event_id;

    -- 2. Insert into projection_queue atomically inside the exact same transaction
    INSERT INTO projection_queue (
        event_id,
        tenant_id,
        location_id,
        material_id,
        event_type,
        quantity_delta,
        business_timestamp,
        status,
        created_at
    )
    VALUES (
        v_event_id,
        (p_event->>'tenant_id')::UUID,
        (p_event->>'location_id')::UUID,
        (p_event->>'material_id')::UUID,
        (p_event->>'event_type')::inventory_event_type,
        (p_event->>'quantity_delta')::NUMERIC,
        (p_event->>'business_timestamp')::TIMESTAMPTZ,
        'PENDING',
        NOW()
    )
    RETURNING id INTO v_queue_id;

    RETURN QUERY SELECT v_event_id, v_queue_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- WATCHDOG VIEW: Detect any event missing a projection task for > 30s
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_orphaned_events AS
SELECT
    e.id,
    e.tenant_id,
    e.location_id,
    e.material_id,
    e.event_type,
    e.business_timestamp,
    e.received_timestamp,
    NOW() - e.received_timestamp AS age
FROM inventory_events e
WHERE NOT EXISTS (
    SELECT 1 FROM projection_queue q WHERE q.event_id = e.id
)
AND e.received_timestamp < NOW() - INTERVAL '30 seconds'
AND e.sequence_status != 'INVALID'
AND e.sequence_status != 'DUPLICATE';

GRANT SELECT ON v_orphaned_events TO authenticated, service_role;
