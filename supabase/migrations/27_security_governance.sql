-- /supabase/migrations/27_security_governance.sql

-- ==================== USER-STORE ASSIGNMENTS ====================
CREATE TABLE IF NOT EXISTS user_store_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    
    access_level VARCHAR(20) NOT NULL DEFAULT 'read' 
        CHECK (access_level IN ('read', 'write', 'manager', 'admin')),
    
    can_approve_pr BOOLEAN DEFAULT FALSE,
    can_execute_emergency_po BOOLEAN DEFAULT FALSE,
    can_adjust_safety_stock BOOLEAN DEFAULT FALSE,
    can_perform_physical_count BOOLEAN DEFAULT TRUE,
    
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(tenant_id, user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stores ON user_store_assignments(user_id, tenant_id, access_level);
CREATE INDEX IF NOT EXISTS idx_store_users ON user_store_assignments(store_id, tenant_id);

-- ==================== ROLE HIERARCHY ====================
CREATE TABLE IF NOT EXISTS tenant_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role_name VARCHAR(50) NOT NULL,
    
    can_view_all_stores BOOLEAN DEFAULT FALSE,
    can_manage_users BOOLEAN DEFAULT FALSE,
    can_view_financial_yield BOOLEAN DEFAULT FALSE,
    can_access_audit_log BOOLEAN DEFAULT FALSE,
    can_configure_reorder BOOLEAN DEFAULT FALSE,
    can_override_sto_decision BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, role_name)
);

-- ==================== USER TENANT MEMBERSHIP ====================
CREATE TABLE IF NOT EXISTS user_tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    primary_role_id UUID REFERENCES tenant_roles(id),
    
    is_active BOOLEAN DEFAULT TRUE,
    invited_by UUID REFERENCES auth.users(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    
    UNIQUE(user_id, tenant_id)
);

-- ==================== AUDIT SESSION LOG ====================
CREATE TABLE IF NOT EXISTS audit_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    session_type VARCHAR(30) NOT NULL CHECK (session_type IN ('login', 'logout', 'password_change', 'mfa_verify', 'role_escalation')),
    ip_address INET,
    user_agent TEXT,
    geo_country VARCHAR(10),
    
    escalated_from_role VARCHAR(50),
    escalated_to_role VARCHAR(50),
    escalation_reason TEXT,
    escalation_approved_by UUID,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_sessions_user ON audit_sessions(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_sessions_type ON audit_sessions(tenant_id, session_type, created_at DESC);

-- RLS
ALTER TABLE user_store_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_sessions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'usa_isolation') THEN
        CREATE POLICY usa_isolation ON user_store_assignments FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'roles_isolation') THEN
        CREATE POLICY roles_isolation ON tenant_roles FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'utm_isolation') THEN
        CREATE POLICY utm_isolation ON user_tenant_memberships FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'session_isolation') THEN
        CREATE POLICY session_isolation ON audit_sessions FOR ALL USING (true);
    END IF;
END $$;
