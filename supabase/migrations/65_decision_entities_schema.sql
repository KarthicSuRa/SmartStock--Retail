-- =============================================================================
-- Migration 65: Decision Intelligence Entities Schema
-- SmartStock Decision Intelligence V1
--
-- PURPOSE:
--   Formalizes the central Decision entity lifecycle: Requests, Candidates,
--   Recommendations, and Closed-Loop Outcomes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.decision_requests (
    decision_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    decision_type           VARCHAR(50) NOT NULL, -- STOCKOUT_PREVENTION, COUNT_ASSIGNMENT, REPLENISHMENT, EXCEPTION_PRIORITY, SHRINK_INVESTIGATION
    location_id             VARCHAR(50) NOT NULL,
    product_id              VARCHAR(50) NOT NULL,
    sku                     VARCHAR(50) NOT NULL,
    
    inventory_position_version BIGINT NOT NULL,
    policy_version          VARCHAR(20) DEFAULT 'v1.0' NOT NULL,
    feature_snapshot_id     UUID,
    correlation_id          VARCHAR(100),
    requested_at            TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_requests_lookup ON analytics.decision_requests(tenant_id, location_id, sku);

CREATE TABLE IF NOT EXISTS analytics.decision_candidates (
    candidate_id            BIGSERIAL PRIMARY KEY,
    decision_id             UUID NOT NULL REFERENCES analytics.decision_requests(decision_id) ON DELETE CASCADE,
    candidate_type          VARCHAR(50) NOT NULL, -- DO_NOTHING, BACKROOM_PULL, STORE_TRANSFER_STO, DC_REPLENISHMENT, VENDOR_PO
    source_location_id      VARCHAR(50),
    quantity                NUMERIC(15, 4) NOT NULL,
    
    estimated_cost_eur      NUMERIC(12, 2) NOT NULL,
    estimated_lead_hours    NUMERIC(8, 2) NOT NULL,
    availability_risk_score SMALLINT NOT NULL, -- 0 - 100 (100 is highest risk)
    source_risk_score       SMALLINT NOT NULL,
    composite_rank_score    NUMERIC(6, 2) NOT NULL, -- Higher is better
    is_selected             BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_candidates_decision ON analytics.decision_candidates(decision_id);

CREATE TABLE IF NOT EXISTS analytics.decision_recommendations (
    recommendation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id             UUID NOT NULL REFERENCES analytics.decision_requests(decision_id) ON DELETE CASCADE,
    decision_state          VARCHAR(30) NOT NULL, -- RECOMMEND, VERIFY_FIRST, HUMAN_REVIEW, NO_ACTION
    decision_confidence     SMALLINT NOT NULL, -- 0 - 100
    
    selected_candidate_id   BIGINT REFERENCES analytics.decision_candidates(candidate_id),
    recommended_action      VARCHAR(50) NOT NULL,
    recommended_source      VARCHAR(50),
    recommended_qty         NUMERIC(15, 4) NOT NULL,
    
    structured_reason_codes JSONB NOT NULL, -- e.g. ["STOCKOUT_HORIZON_SHORT", "SOURCE_SURPLUS_HIGH"]
    model_versions          JSONB NOT NULL, -- {"forecast": "prophet_v2", "risk": "logistic_v1", "optimizer": "or_solver_v1"}
    policy_version          VARCHAR(20) NOT NULL,
    is_approval_required    BOOLEAN DEFAULT TRUE NOT NULL,
    generated_at            TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics.decision_outcomes (
    outcome_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id             UUID NOT NULL REFERENCES analytics.decision_requests(decision_id) ON DELETE CASCADE,
    recommendation_id       UUID NOT NULL REFERENCES analytics.decision_recommendations(recommendation_id) ON DELETE CASCADE,
    
    human_decision          VARCHAR(30) NOT NULL, -- ACCEPTED_UNMODIFIED, ACCEPTED_MODIFIED, REJECTED, ABSTAINED
    modified_quantity       NUMERIC(15, 4),
    rejection_reason_code   VARCHAR(50), -- SOURCE_STORE_NEEDS_STOCK, QUANTITY_TOO_HIGH, TRANSPORT_UNAVAILABLE, VENDOR_PREFERRED, INFORMATION_INACCURATE
    rejection_notes         TEXT,
    
    decided_by_user_id      VARCHAR(100),
    decided_at              TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL,
    
    -- Observed Post-Intervention Outcomes
    observed_demand_qty     NUMERIC(15, 4),
    observed_lead_hours     NUMERIC(8, 2),
    stockout_observed_post_action BOOLEAN,
    outcome_evaluated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_decision_outcomes_decision ON analytics.decision_outcomes(decision_id);
