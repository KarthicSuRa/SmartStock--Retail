-- /supabase/migrations/73_org_structure_categories_backstore.sql
-- SmartStock — Org structure (SAP Retail aligned), Merchandise Category hierarchy and Back-store stock mapping.
-- UI: /admin/org-structure, /admin/categories, /backstore

-- ==================== ORG STRUCTURE ====================

CREATE TABLE IF NOT EXISTS company_codes (
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(4)  NOT NULL,              -- SAP BUKRS
    name            TEXT        NOT NULL,
    country         CHAR(2)     NOT NULL,
    currency        CHAR(3)     NOT NULL,
    fiscal_variant  VARCHAR(10),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS distribution_channels (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code        VARCHAR(2) NOT NULL,                   -- SAP VTWEG (10 store, 20 e-com, 30 B2B, 40 C&C)
    name        TEXT NOT NULL,
    description TEXT,
    PRIMARY KEY (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS sales_organizations (
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code         VARCHAR(4) NOT NULL,                  -- SAP VKORG
    name         TEXT NOT NULL,
    company_code VARCHAR(4) NOT NULL,
    PRIMARY KEY (tenant_id, code),
    FOREIGN KEY (tenant_id, company_code) REFERENCES company_codes(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS sales_org_channels (
    tenant_id     UUID NOT NULL,
    sales_org     VARCHAR(4) NOT NULL,
    channel       VARCHAR(2) NOT NULL,
    PRIMARY KEY (tenant_id, sales_org, channel),
    FOREIGN KEY (tenant_id, sales_org) REFERENCES sales_organizations(tenant_id, code) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, channel)   REFERENCES distribution_channels(tenant_id, code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_organizations (
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code         VARCHAR(4) NOT NULL,                  -- SAP EKORG
    name         TEXT NOT NULL,
    company_code VARCHAR(4),                           -- NULL = cross-company
    scope        VARCHAR(20) NOT NULL CHECK (scope IN ('Central', 'Local', 'Cross-company')),
    PRIMARY KEY (tenant_id, code),
    FOREIGN KEY (tenant_id, company_code) REFERENCES company_codes(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS buyers (
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code           VARCHAR(3) NOT NULL,                -- SAP EKGRP (purchasing group)
    name           TEXT NOT NULL,
    email          TEXT,
    user_id        UUID REFERENCES auth.users(id),
    purchase_org   VARCHAR(4) NOT NULL,
    po_limit       NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency       CHAR(3) NOT NULL,
    is_active      BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (tenant_id, code),
    FOREIGN KEY (tenant_id, purchase_org) REFERENCES purchase_organizations(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS warehouses (
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code           VARCHAR(10) NOT NULL,               -- SAP LGNUM or store back-store id
    name           TEXT NOT NULL,
    warehouse_type VARCHAR(30) NOT NULL CHECK (warehouse_type IN ('Distribution Centre', 'Store Back-Store', 'Dark Store', 'Returns Centre')),
    differentiator VARCHAR(30) NOT NULL CHECK (differentiator IN ('EWM (bin-managed)', 'Lean WM', 'IM (location only)')),
    plant_code     VARCHAR(10) NOT NULL,
    PRIMARY KEY (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS storage_locations (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plant_code  VARCHAR(10) NOT NULL,
    code        VARCHAR(4) NOT NULL,                   -- SAP LGORT (0001 floor, 0002 back-store, 0003 quarantine)
    name        TEXT NOT NULL,
    warehouse   VARCHAR(10),
    PRIMARY KEY (tenant_id, plant_code, code)
);

-- Store / plant → org assignments
CREATE TABLE IF NOT EXISTS store_org_assignments (
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plant_code      VARCHAR(10) NOT NULL,              -- matches stores.sap_plant_code
    store_format    VARCHAR(20),
    company_code    VARCHAR(4) NOT NULL,
    sales_org       VARCHAR(4) NOT NULL,
    purchase_org    VARCHAR(4) NOT NULL,
    channels        VARCHAR(2)[] NOT NULL DEFAULT '{}',
    supplying_site  VARCHAR(10),
    manager_user_id UUID REFERENCES auth.users(id),
    valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (tenant_id, plant_code),
    FOREIGN KEY (tenant_id, company_code) REFERENCES company_codes(tenant_id, code),
    FOREIGN KEY (tenant_id, sales_org)    REFERENCES sales_organizations(tenant_id, code),
    FOREIGN KEY (tenant_id, purchase_org) REFERENCES purchase_organizations(tenant_id, code)
);

-- ==================== MERCHANDISE CATEGORY HIERARCHY ====================

CREATE TABLE IF NOT EXISTS merchandise_categories (
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code         VARCHAR(18) NOT NULL,                 -- SAP MATKL (MC) / WWGHA node
    name         TEXT NOT NULL,
    name_local   JSONB DEFAULT '{}'::jsonb,            -- {"hi": "...", "ta": "...", "nl": "..."}
    level        VARCHAR(25) NOT NULL CHECK (level IN ('Department', 'Category', 'Merchandise Category')),
    parent_code  VARCHAR(18),
    buyer_code   VARCHAR(3),
    temp_zone    VARCHAR(10) CHECK (temp_zone IN ('Ambient', 'Chilled', 'Frozen', 'Secure')),
    is_perishable BOOLEAN DEFAULT FALSE,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, code),
    FOREIGN KEY (tenant_id, parent_code) REFERENCES merchandise_categories(tenant_id, code),
    FOREIGN KEY (tenant_id, buyer_code)  REFERENCES buyers(tenant_id, code),
    CHECK (parent_code IS NULL OR code LIKE parent_code || '%')
);

CREATE INDEX IF NOT EXISTS idx_mc_parent ON merchandise_categories(tenant_id, parent_code);

-- Full path for every node (Department › Category › MC)
CREATE OR REPLACE VIEW v_mc_hierarchy AS
WITH RECURSIVE tree AS (
    SELECT tenant_id, code, name, level, parent_code, buyer_code, name::TEXT AS path, 1 AS depth
    FROM merchandise_categories WHERE parent_code IS NULL
    UNION ALL
    SELECT c.tenant_id, c.code, c.name, c.level, c.parent_code, c.buyer_code, t.path || ' › ' || c.name, t.depth + 1
    FROM merchandise_categories c
    JOIN tree t ON t.tenant_id = c.tenant_id AND t.code = c.parent_code
)
SELECT * FROM tree;

-- ==================== BACK-STORE BINS & STOCK MAPPING ====================

CREATE TABLE IF NOT EXISTS storage_bins (
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plant_code   VARCHAR(10) NOT NULL,
    bin_code     VARCHAR(20) NOT NULL,                 -- BS-A-01-02 = back-store · zone · rack · level
    zone         VARCHAR(30) NOT NULL CHECK (zone IN ('Ambient Racking', 'Chiller', 'Freezer', 'Secure Cage', 'Receiving Dock', 'Returns / Damaged')),
    storage_location VARCHAR(4) NOT NULL DEFAULT '0002',
    capacity_units INTEGER NOT NULL CHECK (capacity_units > 0),
    is_blocked   BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (tenant_id, plant_code, bin_code)
);

CREATE TABLE IF NOT EXISTS sku_location_map (
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plant_code     VARCHAR(10) NOT NULL,
    sku            VARCHAR(50) NOT NULL,
    shelf_location VARCHAR(40) NOT NULL,               -- planogram position on the sales floor
    shelf_capacity INTEGER NOT NULL CHECK (shelf_capacity >= 0),
    min_shelf_qty  INTEGER NOT NULL DEFAULT 0 CHECK (min_shelf_qty >= 0),
    bin_code       VARCHAR(20) NOT NULL,
    shelf_qty      NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (shelf_qty >= 0),
    backstore_qty  NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (backstore_qty >= 0),
    uom            VARCHAR(10) NOT NULL DEFAULT 'EA',
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, plant_code, sku),
    FOREIGN KEY (tenant_id, plant_code, bin_code) REFERENCES storage_bins(tenant_id, plant_code, bin_code)
);

CREATE INDEX IF NOT EXISTS idx_sku_map_bin ON sku_location_map(tenant_id, plant_code, bin_code);

-- Shelf replenishment worklist: shelf below minimum and stock available in back-store
CREATE OR REPLACE VIEW v_shelf_replenishment_due AS
SELECT tenant_id, plant_code, sku, shelf_location, bin_code, shelf_qty, min_shelf_qty, shelf_capacity, backstore_qty,
       LEAST(shelf_capacity - shelf_qty, backstore_qty) AS suggested_move_qty
FROM sku_location_map
WHERE shelf_qty < min_shelf_qty AND backstore_qty > 0;

-- Bin movements (append-only)
CREATE TABLE IF NOT EXISTS bin_movements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plant_code     VARCHAR(10) NOT NULL,
    sku            VARCHAR(50) NOT NULL,
    movement_type  VARCHAR(20) NOT NULL CHECK (movement_type IN ('to_shelf', 'to_backstore', 'bin_to_bin', 'putaway', 'to_quarantine')),
    from_location  VARCHAR(40) NOT NULL,
    to_location    VARCHAR(40) NOT NULL,
    quantity       NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    uom            VARCHAR(10) NOT NULL,
    task_id        UUID,                               -- optional link to store_tasks (migration 75)
    performed_by   UUID REFERENCES auth.users(id),
    performed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id      TEXT
);

CREATE INDEX IF NOT EXISTS idx_bin_mov_sku ON bin_movements(tenant_id, plant_code, sku, performed_at DESC);

-- ==================== RLS ====================
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['company_codes','distribution_channels','sales_organizations','sales_org_channels','purchase_organizations',
                             'buyers','warehouses','storage_locations','store_org_assignments','merchandise_categories',
                             'storage_bins','sku_location_map','bin_movements']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (tenant_id = current_setting(''app.current_tenant'', true)::UUID)', t || '_tenant_isolation', t);
    END LOOP;
END $$;

-- Bin movements are append-only
REVOKE UPDATE, DELETE ON bin_movements FROM authenticated, anon;
