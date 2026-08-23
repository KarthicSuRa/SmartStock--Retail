-- =============================================================================
-- Migration 40: Formal Deprecation of Legacy V1 Calculation Tables
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Marks live_inventory_ledger and inventory_movements as deprecated read-only
--   archives. All operational projections are now driven by inventory_position.
-- =============================================================================

COMMENT ON TABLE live_inventory_ledger IS
  '@deprecated: Read-only legacy archive. Scheduled for removal. '
  'Use inventory_position for operational stock and inventory_events for historical audits.';

COMMENT ON TABLE inventory_movements IS
  '@deprecated: Read-only legacy archive. Scheduled for removal. '
  'Use inventory_events for canonical event auditing.';
