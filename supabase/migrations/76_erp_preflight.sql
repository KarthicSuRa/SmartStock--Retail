-- Preflight discovery: append-only discovery runs and versioned configuration
-- profiles. Discovery itself never changes the active ERP configuration; only
-- the reviewed apply/rollback RPC below does, and it enforces tenant scope in
-- function because erp_configurations RLS is intentionally permissive.

ALTER TABLE erp_configurations
    ADD COLUMN IF NOT EXISTS config_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS erp_discovery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_config_id UUID REFERENCES erp_configurations(id) ON DELETE SET NULL,
    mode TEXT NOT NULL CHECK (mode IN ('discover', 'verify')),
    verdict TEXT NOT NULL CHECK (verdict IN ('READY', 'CONDITIONAL', 'BLOCKED')),
    readiness_score INTEGER NOT NULL DEFAULT 0,
    actor_id UUID,
    request_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_discovery_runs_tenant
    ON erp_discovery_runs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_discovery_runs_config
    ON erp_discovery_runs(erp_config_id, created_at DESC);

CREATE TABLE IF NOT EXISTS erp_config_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_config_id UUID REFERENCES erp_configurations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'reviewed', 'active', 'rolled_back')),
    snapshot JSONB NOT NULL,
    source_run_id UUID REFERENCES erp_discovery_runs(run_id) ON DELETE SET NULL,
    created_by UUID,
    confirmed_by UUID,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (erp_config_id, version)
);

CREATE INDEX IF NOT EXISTS idx_erp_config_profiles_lookup
    ON erp_config_profiles(tenant_id, erp_config_id, version DESC);

ALTER TABLE erp_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_config_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'erp_discovery_runs_tenant') THEN
        CREATE POLICY erp_discovery_runs_tenant ON erp_discovery_runs FOR ALL
        USING (
            tenant_id::text = COALESCE(
                (select auth.jwt() ->> 'tenant_id'),
                (select auth.jwt() -> 'app_metadata' ->> 'tenant_id'),
                (select auth.jwt() -> 'app_metadata' -> 'live_retail_claims' ->> 'tenant_id'),
                (select auth.jwt() -> 'user_metadata' ->> 'tenant_id'),
                'default-tenant'
            )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'erp_discovery_runs_service') THEN
        CREATE POLICY erp_discovery_runs_service ON erp_discovery_runs
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'erp_config_profiles_tenant') THEN
        CREATE POLICY erp_config_profiles_tenant ON erp_config_profiles FOR ALL
        USING (
            tenant_id::text = COALESCE(
                (select auth.jwt() ->> 'tenant_id'),
                (select auth.jwt() -> 'app_metadata' ->> 'tenant_id'),
                (select auth.jwt() -> 'app_metadata' -> 'live_retail_claims' ->> 'tenant_id'),
                (select auth.jwt() -> 'user_metadata' ->> 'tenant_id'),
                'default-tenant'
            )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'erp_config_profiles_service') THEN
        CREATE POLICY erp_config_profiles_service ON erp_config_profiles
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Reviewed apply / rollback. Never activates a profile with an open blocker or
-- an unchecked human confirmation; discovery results are advisory only.
CREATE OR REPLACE FUNCTION public.apply_erp_config_profile(
    p_profile_id UUID,
    p_activate BOOLEAN DEFAULT FALSE,
    p_confirmation TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant TEXT;
    v_profile erp_config_profiles%ROWTYPE;
    v_run erp_discovery_runs%ROWTYPE;
BEGIN
    v_tenant := COALESCE(
        (select auth.jwt() ->> 'tenant_id'),
        (select auth.jwt() -> 'app_metadata' ->> 'tenant_id'),
        (select auth.jwt() -> 'app_metadata' -> 'live_retail_claims' ->> 'tenant_id'),
        (select auth.jwt() -> 'user_metadata' ->> 'tenant_id'),
        ''
    );

    SELECT * INTO v_profile FROM erp_config_profiles
        WHERE id = p_profile_id AND tenant_id::text = v_tenant;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Configuration profile not found for this tenant';
    END IF;

    IF v_profile.status = 'active' AND NOT p_activate THEN
        RETURN jsonb_build_object('status', 'noop', 'reason', 'profile already active');
    END IF;

    IF p_activate THEN
        IF p_confirmation IS NULL OR length(trim(p_confirmation)) < 10 THEN
            RAISE EXCEPTION 'Activation requires an explicit written confirmation (at least 10 characters)';
        END IF;

        SELECT * INTO v_run FROM erp_discovery_runs
            WHERE run_id = v_profile.source_run_id AND tenant_id::text = v_tenant;
        IF FOUND AND v_run.verdict = 'BLOCKED' THEN
            RAISE EXCEPTION 'Cannot activate a profile whose discovery verdict is BLOCKED';
        END IF;

        IF v_profile.erp_config_id IS NOT NULL THEN
            UPDATE erp_configurations c SET
                base_url = COALESCE(v_profile.snapshot ->> 'base_url', c.base_url),
                auth_config = COALESCE(v_profile.snapshot -> 'auth_config', c.auth_config),
                company_code = COALESCE(v_profile.snapshot ->> 'company_code', c.company_code),
                purchasing_org = COALESCE(v_profile.snapshot ->> 'purchasing_org', c.purchasing_org),
                purchasing_group = COALESCE(v_profile.snapshot ->> 'purchasing_group', c.purchasing_group),
                metadata = COALESCE(v_profile.snapshot -> 'metadata', c.metadata),
                config_version = v_profile.version,
                updated_at = NOW()
            WHERE c.id = v_profile.erp_config_id AND c.tenant_id::text = v_tenant;

            UPDATE erp_config_profiles
                SET status = 'rolled_back', confirmed_at = NOW()
                WHERE erp_config_id = v_profile.erp_config_id
                  AND status = 'active' AND id <> v_profile.id;
        END IF;

        UPDATE erp_config_profiles
            SET status = 'active',
                confirmed_by = auth.uid(),
                confirmed_at = NOW()
            WHERE id = v_profile.id;

        INSERT INTO sync_audit_log (
            tenant_id, erp_config_id, entity_type, erp_key, action, new_values, processed_by
        ) VALUES (
            v_profile.tenant_id,
            v_profile.erp_config_id,
            'erp_config_profile',
            v_profile.id::text,
            CASE WHEN COALESCE(p_reason, '') ILIKE '%rollback%' THEN 'CONFIG_ROLLBACK' ELSE 'CONFIG_APPLIED' END,
            jsonb_build_object(
                'profile_id', v_profile.id,
                'version', v_profile.version,
                'confirmation', left(p_confirmation, 120),
                'reason', p_reason
            ),
            auth.uid()
        );

        RETURN jsonb_build_object(
            'status', 'activated',
            'profile_id', v_profile.id,
            'version', v_profile.version,
            'config_version', v_profile.version
        );
    END IF;

    UPDATE erp_config_profiles
        SET status = 'reviewed', confirmed_by = auth.uid(), confirmed_at = NOW()
        WHERE id = v_profile.id AND status = 'draft';

    INSERT INTO sync_audit_log (
        tenant_id, erp_config_id, entity_type, erp_key, action, new_values, processed_by
    ) VALUES (
        v_profile.tenant_id,
        v_profile.erp_config_id,
        'erp_config_profile',
        v_profile.id::text,
        'CONFIG_PROFILE_REVIEWED',
        jsonb_build_object('profile_id', v_profile.id, 'version', v_profile.version),
        auth.uid()
    );

    RETURN jsonb_build_object('status', 'reviewed', 'profile_id', v_profile.id);
END $$;

REVOKE ALL ON FUNCTION public.apply_erp_config_profile(UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_erp_config_profile(UUID, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;
