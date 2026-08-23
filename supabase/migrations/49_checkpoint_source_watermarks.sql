-- =============================================================================
-- Migration 49: SAP Checkpoint Per-Source Sequence Watermarks
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Extends SAP_CHECKPOINT events and inventory_position with per-source
--   sequence watermarks (e.g. POS store sequences, WMS batches) that SAP has
--   actually incorporated into its snapshot, replacing naive timestamp comparison.
-- =============================================================================

ALTER TABLE inventory_events
ADD COLUMN IF NOT EXISTS checkpoint_source_watermarks JSONB DEFAULT NULL;

COMMENT ON COLUMN inventory_events.checkpoint_source_watermarks IS
  'For SAP_CHECKPOINT events: maps source key (e.g. POS__storeId) to the highest '
  'sequence number SAP has incorporated into this baseline snapshot.';

ALTER TABLE inventory_position
ADD COLUMN IF NOT EXISTS checkpoint_source_watermarks JSONB DEFAULT NULL;

COMMENT ON COLUMN inventory_position.checkpoint_source_watermarks IS
  'Active sequence watermarks from the latest SAP_CHECKPOINT event.';
