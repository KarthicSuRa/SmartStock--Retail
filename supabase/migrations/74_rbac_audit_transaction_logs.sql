-- /supabase/migrations/74_rbac_audit_transaction_logs.sql
-- SmartStock — Role catalog, module authorization matrix, append-only audit log and transaction success/error log.
-- UI: /admin/roles, /admin/audit, /admin/transaction-logs

-- ==================== ROLES & AUTHORIZATIONS ====================

CREATE TABLE IF NOT EXISTS app_roles (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role_key    VARCHAR(40) NOT NULL,                  -- store_manager, floor_worker, warehouse_staff, buyer, auditor, ...
    label       TEXT NOT NULL,
    description TEXT,
    scope       VARCHAR(10) NOT NULL CHECK (scope IN ('Store', 'Region', 'Network', 'Tenant')),
    is_system   BOOLEAN DEFAULT FALSE,                 -- system roles cannot be deleted
    PRIMARY KEY (tenant_id, role_key)
);

CREATE TABLE IF NOT EXISTS app_modules (
    module_key  VARCHAR(40) PRIMARY KEY,               -- inventory, backstore, counts, tasks, procurement, reports, categories, org, users, audit, translogs, integration
    label       TEXT NOT NULL,
    module_group VARCHAR(20) NOT NULL
);

INSERT INTO app_modules (module_key, label, module_group) VALUES
    ('inventory',   'Inventory & Ledger',          'Operations'),
    ('backstore',   'Back-Store Stock Mapping',    'Operations'),
    ('counts',      'Cycle Counts',                'Operations'),
    ('tasks',       'Daily Tasks & Communication', 'Operations'),
    ('procurement', 'Procurement & Replenishment', 'Operations'),
    ('reports',     'Reports & Exports',           'Operations'),
    ('categories',  'Category / MC Grouping',      'Master Data'),
    ('org',         'Org Structure',               'Master Data'),
    ('users',       'Users & Roles',               'Governance'),
    ('audit',       'Audit Logs',                  'Governance'),
    ('translogs',   'Success / Error Logs',        'Integration'),
    ('integration', 'POS / SAP Integration',       'Integration')
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS role_module_permissions (
    tenant_id    UUID NOT NULL,
    role_key     VARCHAR(40) NOT NULL,
    module_key   VARCHAR(40) NOT NULL REFERENCES app_modules(module_key),
    access_level VARCHAR(10) NOT NULL CHECK (access_level IN ('none', 'view', 'edit', 'approve')),
    updated_by   UUID REFERENCES auth.users(id),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, role_key, module_key),
    FOREIGN KEY (tenant_id, role_key) REFERENCES app_roles(tenant_id, role_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_key    VARCHAR(40) NOT NULL,
    plant_code  VARCHAR(10),                           -- NULL = all stores
    valid_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to    DATE,
    assigned_by UUID REFERENCES auth.users(id),
    PRIMARY KEY (tenant_id, user_id, role_key, valid_from),
    FOREIGN KEY (tenant_id, role_key) REFERENCES app_roles(tenant_id, role_key)
);

-- Access check usable from RLS policies and Edge Functions
CREATE OR REPLACE FUNCTION has_module_access(p_user UUID, p_module TEXT, p_required TEXT DEFAULT 'view')
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_role_assignments ura
        JOIN role_module_permissions rmp
          ON rmp.tenant_id = ura.tenant_id AND rmp.role_key = ura.role_key AND rmp.module_key = p_module
        WHERE ura.user_id = p_user
          AND ura.tenant_id = current_setting('app.current_tenant', true)::UUID
          AND CURRENT_DATE BETWEEN ura.valid_from AND COALESCE(ura.valid_to, 'infinity'::date)
          AND array_position(ARRAY['none','view','edit','approve'], rmp.access_level)
              >= array_position(ARRAY['none','view','edit','approve'], p_required)
    );
$$;

-- ==================== AUDIT LOG (who / what / when) ====================

CREATE TABLE IF NOT EXISTS audit_log (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id UUID REFERENCES auth.users(id),
    actor_name   TEXT NOT NULL,
    actor_role   VARCHAR(40),
    module_key   VARCHAR(40) NOT NULL,
    action       TEXT NOT NULL,                         -- e.g. 'Bin movement', 'Role changed', 'Export PDF'
    entity_type  VARCHAR(40),
    entity_id    TEXT,
    entity_label TEXT,
    outcome      VARCHAR(10) NOT NULL CHECK (outcome IN ('success', 'warning', 'error')),
    before_state JSONB,
    after_state  JSONB,
    message      TEXT,
    plant_code   VARCHAR(10),
    ip_address   INET,
    user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_time   ON audit_log(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor  ON audit_log(tenant_id, actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_module ON audit_log(tenant_id, module_key, occurred_at DESC);

-- ==================== TRANSACTION LOG (success / error per module) ====================

CREATE TABLE IF NOT EXISTS transaction_log (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    module_key    VARCHAR(40) NOT NULL,                 -- pos, sap, backstore, counts, tasks, procurement, ...
    transaction_type TEXT NOT NULL,                     -- e.g. 'Goods receipt post (MIGO 101)'
    reference     TEXT,                                 -- PO / GR / batch / task id
    source        VARCHAR(10) NOT NULL CHECK (source IN ('user', 'system')),
    actor_name    TEXT,
    outcome       VARCHAR(10) NOT NULL CHECK (outcome IN ('success', 'warning', 'error')),
    error_code    TEXT,
    message       TEXT,
    duration_ms   INTEGER,
    retry_count   SMALLINT DEFAULT 0,
    payload       JSONB,
    correlation_id UUID
);

CREATE INDEX IF NOT EXISTS idx_txlog_module ON transaction_log(tenant_id, module_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_txlog_errors ON transaction_log(tenant_id, occurred_at DESC) WHERE outcome = 'error';

CREATE OR REPLACE VIEW v_transaction_log_summary AS
SELECT tenant_id,
       module_key,
       date_trunc('day', occurred_at) AS day,
       COUNT(*) FILTER (WHERE outcome = 'success') AS success_count,
       COUNT(*) FILTER (WHERE outcome = 'warning') AS warning_count,
       COUNT(*) FILTER (WHERE outcome = 'error')   AS error_count,
       ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'success') / NULLIF(COUNT(*), 0), 1) AS success_rate_pct,
       ROUND(AVG(duration_ms)) AS avg_duration_ms
FROM transaction_log
GROUP BY tenant_id, module_key, date_trunc('day', occurred_at);

-- ==================== RLS & APPEND-ONLY ====================
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['app_roles','role_module_permissions','user_role_assignments','audit_log','transaction_log']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (tenant_id = current_setting(''app.current_tenant'', true)::UUID)', t || '_tenant_isolation', t);
    END LOOP;
END $$;

-- Only users with audit access may read the audit log
DROP POLICY IF EXISTS audit_log_read_restricted ON audit_log;
CREATE POLICY audit_log_read_restricted ON audit_log AS RESTRICTIVE FOR SELECT
    USING (has_module_access(auth.uid(), 'audit', 'view'));

-- Logs are immutable
REVOKE UPDATE, DELETE ON audit_log, transaction_log FROM authenticated, anon;
