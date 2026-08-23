-- =============================================================================
-- Migration 68: Decision Policies, Constraints & Kill Switches
-- SmartStock Decision Intelligence V1
--
-- PURPOSE:
--   Enforces hard retail business constraints, managerial approval limits,
--   global/store-level kill switches, and graceful deterministic fallbacks.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.decision_policies (
    policy_id               VARCHAR(50) PRIMARY KEY,
    tenant_id               UUID NOT NULL,
    policy_version          VARCHAR(20) DEFAULT 'v1.0' NOT NULL,
    
    -- Hard Business Constraints
    source_min_safety_dos   NUMERIC(5, 2) DEFAULT 5.0 NOT NULL, -- Never deplete source store below 5 days of supply
    max_transfer_distance_km NUMERIC(8, 2) DEFAULT 150.0 NOT NULL,
    enforce_supplier_moq    BOOLEAN DEFAULT TRUE NOT NULL,
    enforce_case_pack_round BOOLEAN DEFAULT TRUE NOT NULL,
    
    -- Managerial Approval Thresholds
    store_manager_max_eur   NUMERIC(12, 2) DEFAULT 5000.00 NOT NULL, -- Over €5k requires Regional Manager
    regional_manager_max_eur NUMERIC(12, 2) DEFAULT 25000.00 NOT NULL,
    
    -- Confidence Thresholds
    min_decision_confidence_recommend SMALLINT DEFAULT 65 NOT NULL, -- Below 65% triggers abstain to VERIFY_FIRST
    
    is_active               BOOLEAN DEFAULT TRUE NOT NULL,
    updated_at              TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL
);

-- Seed default policy
INSERT INTO analytics.decision_policies 
    (policy_id, tenant_id, policy_version, source_min_safety_dos, store_manager_max_eur, min_decision_confidence_recommend)
VALUES
    ('DEFAULT_RETAIL_POLICY', '00000000-0000-0000-0000-000000000000', 'v1.0', 5.0, 5000.00, 65)
ON CONFLICT (policy_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS analytics.decision_kill_switches (
    switch_id               VARCHAR(50) PRIMARY KEY, -- e.g. GLOBAL_AI_FALLBACK, STO_RECOMMENDATIONS_STORE_1001
    tenant_id               UUID NOT NULL,
    target_scope            VARCHAR(30) NOT NULL, -- GLOBAL, DECISION_TYPE, STORE, MODEL
    scope_id                VARCHAR(100) NOT NULL,
    is_enabled              BOOLEAN DEFAULT FALSE NOT NULL, -- TRUE = KILL SWITCH ACTIVE (Fallback to deterministic rules)
    fallback_procedure      VARCHAR(100) DEFAULT 'DETERMINISTIC_HEURISTIC' NOT NULL,
    reason                  TEXT,
    updated_by              VARCHAR(100),
    updated_at              TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL
);

-- Seed default kill switches (all disabled by default)
INSERT INTO analytics.decision_kill_switches
    (switch_id, tenant_id, target_scope, scope_id, is_enabled, fallback_procedure, reason)
VALUES
    ('GLOBAL_AI_FALLBACK', '00000000-0000-0000-0000-000000000000', 'GLOBAL', 'ALL', FALSE, 'DETERMINISTIC_RULES', 'Global emergency fallback toggle'),
    ('STO_OPTIMIZER_FALLBACK', '00000000-0000-0000-0000-000000000000', 'DECISION_TYPE', 'REPLENISHMENT', FALSE, 'NEAREST_STORE_HEURISTIC', 'STO solver fallback toggle')
ON CONFLICT (switch_id) DO NOTHING;
