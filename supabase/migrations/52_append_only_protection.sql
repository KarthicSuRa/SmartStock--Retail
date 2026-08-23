-- =============================================================================
-- Migration 52: Append-Only Immutability Protections
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Enforces append-only immutable semantics on inventory_events and audit logs
--   using Postgres rules that silently prevent UPDATE and DELETE operations.
-- =============================================================================

-- Protect inventory_events from UPDATE and DELETE
CREATE OR REPLACE RULE no_update_inventory_events AS
    ON UPDATE TO inventory_events DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_delete_inventory_events AS
    ON DELETE TO inventory_events DO INSTEAD NOTHING;

-- Protect replay_audit_log
CREATE OR REPLACE RULE no_update_replay_audit AS
    ON UPDATE TO replay_audit_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_delete_replay_audit AS
    ON DELETE TO replay_audit_log DO INSTEAD NOTHING;
