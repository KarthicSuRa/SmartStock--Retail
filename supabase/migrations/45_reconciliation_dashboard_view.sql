-- =============================================================================
-- Migration 45: Enterprise Reconciliation Dashboard & Network View
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Aggregates network-wide reconciliation stats across stores and materials
--   for the flagship Reconciliation Console UI.
-- =============================================================================

CREATE OR REPLACE VIEW v_reconciliation_summary AS
SELECT
    ir.tenant_id,
    ir.location_id,
    COUNT(*) AS total_reconciliations,
    COUNT(*) FILTER (WHERE ir.status = 'MATCHED') AS matched_count,
    COUNT(*) FILTER (WHERE ir.status = 'EXPLAINED_VARIANCE') AS explained_count,
    COUNT(*) FILTER (WHERE ir.status = 'UNEXPLAINED_VARIANCE') AS unexplained_count,
    ROUND(
        (COUNT(*) FILTER (WHERE ir.status IN ('MATCHED', 'EXPLAINED_VARIANCE'))::NUMERIC /
        NULLIF(COUNT(*), 0)) * 100,
        2
    ) AS reconciliation_rate_pct,
    MAX(ir.created_at) AS last_reconciled_at
FROM inventory_reconciliations ir
GROUP BY ir.tenant_id, ir.location_id;

GRANT SELECT ON v_reconciliation_summary TO authenticated, service_role;
