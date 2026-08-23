-- =============================================================================
-- Migration 44: SAP Checkpoint Watermark Schema
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Adds checkpoint_watermark to inventory_position to prevent pre-checkpoint
--   events from being double-applied after a new SAP baseline is ingested.
-- =============================================================================

ALTER TABLE inventory_position
ADD COLUMN IF NOT EXISTS checkpoint_watermark TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS checkpoint_event_id UUID REFERENCES inventory_events(id);

COMMENT ON COLUMN inventory_position.checkpoint_watermark IS
  'Business timestamp of the authoritative SAP_CHECKPOINT event. Additive events '
  'with business_timestamp <= checkpoint_watermark are already absorbed in the SAP baseline '
  'and are not re-applied as deltas.';
