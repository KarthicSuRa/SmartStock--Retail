-- =============================================================================
-- Migration 38: Write Path Architectural Constraints & Deprecation Notices
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Explicitly marks legacy V1 tables as deprecated and documents authoritative
--   write paths directly in the database catalog.
-- =============================================================================

COMMENT ON TABLE live_inventory_ledger IS
  '@deprecated(V1): DO NOT WRITE DIRECTLY. Authoritative operational state is inventory_position, '
  'derived exclusively by projecting append-only events in inventory_events.';

COMMENT ON TABLE inventory_movements IS
  '@deprecated(V1): DO NOT WRITE DIRECTLY. Canonical movements must be ingested as '
  'inventory_events via the ingestion-gateway.';

COMMENT ON TABLE inventory_events IS
  '@authoritative(V2): Append-only canonical event ledger. Written exclusively through '
  'the ingestion-gateway. Never update or delete rows directly.';

COMMENT ON TABLE inventory_position IS
  '@authoritative(V2): Derived operational digital twin. Mutated exclusively by the '
  'projection-worker. Can be fully reconstructed by replaying inventory_events.';
