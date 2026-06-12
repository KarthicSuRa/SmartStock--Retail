-- ============================================================================
-- Migration Name: 01_initial_ledger
-- Description: Sets up the real-time stock replenishment database schema,
--              integrates SAP S/4HANA OData compatible schemas,
--              establishes the intraday Movement 551 scrap buffer,
--              and sets up the POS sales event ingestion triggers.
-- ============================================================================

-- Enable UUID extension for auto-generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. LIVE INVENTORY LEDGER TABLE
-- ----------------------------------------------------------------------------
-- Maps directly to SAP Material Master and Inventory Management structures:
-- MATNR (Material/SKU), WERKS (Plant), LGORT (Storage Location), MEINS (UOM).
CREATE TABLE live_inventory_ledger (
    sap_plant_code VARCHAR(4) NOT NULL,            -- SAP Plant/Werks (e.g., '1001')
    sap_storage_loc VARCHAR(4) NOT NULL,          -- SAP Storage Location/Lgort (e.g., '0001')
    sku VARCHAR(40) NOT NULL,                     -- SAP Material/MATNR (e.g., 'MAT-00918')
    product_name VARCHAR(255) NOT NULL,           -- Material description (MAKTX)
    uom VARCHAR(3) DEFAULT 'PC' NOT NULL,          -- Base Unit of Measure (MEINS)
    
    sap_baseline_qty INTEGER DEFAULT 0 NOT NULL,   -- Inventory quantity from overnight SAP sync
    pos_live_deductions INTEGER DEFAULT 0 NOT NULL CHECK (pos_live_deductions >= 0), -- Aggregated sales deductions since last sync
    
    -- Generated column: Dynamically computes current stock based on baseline and POS sales
    current_calculated_stock INTEGER GENERATED ALWAYS AS (sap_baseline_qty - pos_live_deductions) STORED,
    
    last_sap_sync_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    
    PRIMARY KEY (sap_plant_code, sap_storage_loc, sku)
);

-- Comments for documentation and maintenance
COMMENT ON TABLE live_inventory_ledger IS 'Real-time dual-ledger mapping overnight SAP baselines against intraday POS sales.';
COMMENT ON COLUMN live_inventory_ledger.sap_plant_code IS 'Refers to SAP Plant/Werks code (4 characters).';
COMMENT ON COLUMN live_inventory_ledger.sap_storage_loc IS 'Refers to SAP Storage Location/Lgort (4 characters).';
COMMENT ON COLUMN live_inventory_ledger.sku IS 'Refers to SAP Material/MATNR code (up to 40 characters).';
COMMENT ON COLUMN live_inventory_ledger.current_calculated_stock IS 'Autocomputed current stock = sap_baseline_qty - pos_live_deductions.';

-- ----------------------------------------------------------------------------
-- 2. BUFFERED SCRAPS TABLE (Movement Type 551 Logs)
-- ----------------------------------------------------------------------------
-- Buffers floor scrap markings (spoiled, broken, expired products) locally.
-- Aligns with SAP S/4HANA OData service API_MATERIAL_DOCUMENT_SRV.
CREATE TABLE buffered_scraps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sap_plant_code VARCHAR(4) NOT NULL,
    sap_storage_loc VARCHAR(4) NOT NULL,
    sku VARCHAR(40) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    uom VARCHAR(3) DEFAULT 'PC' NOT NULL,
    scrap_reason_code VARCHAR(4) NOT NULL,       -- SAP Reason for Movement (GRUND)
    reported_by UUID,                            -- Reference to auth.users
    
    -- Integration Lifecycle Fields
    sync_status VARCHAR(20) DEFAULT 'PENDING' NOT NULL CHECK (sync_status IN ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED')),
    sap_document_id VARCHAR(10),                 -- SAP Material Document Number (MBLNR)
    sap_document_year VARCHAR(4),                -- SAP Material Document Year (MJAHR)
    error_log TEXT,                              -- Error detail from OData write-back
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE buffered_scraps IS 'Buffered floor scrap events (SAP Movement 551) to be posted as daily aggregated batches.';

-- ----------------------------------------------------------------------------
-- 3. RAW POS SALES EVENTS TABLE
-- ----------------------------------------------------------------------------
-- Logs incoming payloads from registers via Webhooks.
-- The payload is parsed asynchronously/via trigger to update the live ledger.
CREATE TABLE pos_sales_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_payload JSONB NOT NULL,                  -- Contains transaction metadata and line items
    processed BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

COMMENT ON TABLE pos_sales_events IS 'Raw register checkout events received from POS webhooks.';

-- ----------------------------------------------------------------------------
-- 4. AUTOMATED POS INGESTION FUNCTION & TRIGGER
-- ----------------------------------------------------------------------------
-- Parses incoming POS payloads and updates live_inventory_ledger.pos_live_deductions.
-- Assumed Payload Schema:
-- {
--   "store_code": "1001",
--   "storage_location": "0001",
--   "items": [
--     { "sku": "MAT-00918", "quantity": 3 },
--     { "sku": "MAT-20349", "quantity": 1 }
--   ]
-- }
CREATE OR REPLACE FUNCTION process_pos_sales_event_trigger()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    v_store_code VARCHAR;
    v_storage_loc VARCHAR;
BEGIN
    -- Extract store metadata from raw JSON payload
    v_store_code := NEW.raw_payload->>'store_code';
    v_storage_loc := COALESCE(NEW.raw_payload->>'storage_location', '0001');

    IF v_store_code IS NULL THEN
        RAISE EXCEPTION 'Invalid POS payload: store_code is missing.';
    END IF;

    -- Iterate over line items inside the JSON array
    FOR item IN 
        SELECT 
            (x->>'sku')::VARCHAR AS sku, 
            (x->>'quantity')::INTEGER AS quantity
        FROM jsonb_array_elements(NEW.raw_payload->'items') AS x
    LOOP
        -- Perform atomical upsert on live_inventory_ledger
        -- If no baseline exists for this SKU/Plant, it inserts a skeleton record with 0 baseline
        INSERT INTO live_inventory_ledger (
            sap_plant_code, 
            sap_storage_loc, 
            sku, 
            product_name, 
            sap_baseline_qty, 
            pos_live_deductions,
            updated_at
        )
        VALUES (
            v_store_code, 
            v_storage_loc, 
            item.sku, 
            'Unknown SAP Product (Awaiting Baseline Sync)', 
            0, 
            item.quantity,
            TIMEZONE('utc', NOW())
        )
        ON CONFLICT (sap_plant_code, sap_storage_loc, sku)
        DO UPDATE SET 
            pos_live_deductions = live_inventory_ledger.pos_live_deductions + item.quantity,
            updated_at = TIMEZONE('utc', NOW());
    END LOOP;

    -- Mark event as successfully processed
    NEW.processed := TRUE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind trigger to POS sales events table
CREATE TRIGGER trg_process_pos_sales_event
BEFORE INSERT ON pos_sales_events
FOR EACH ROW
EXECUTE FUNCTION process_pos_sales_event_trigger();

-- ----------------------------------------------------------------------------
-- 5. INDEXING FOR HIGH-FREQUENCY SKU & INTEGRATION LOOKUPS
-- ----------------------------------------------------------------------------
-- Indexes on main lookup vectors to ensure sub-millisecond query performance
CREATE INDEX idx_ledger_sku ON live_inventory_ledger(sku);
CREATE INDEX idx_ledger_calculated_stock ON live_inventory_ledger(current_calculated_stock);
CREATE INDEX idx_scraps_sync_status ON buffered_scraps(sync_status) WHERE sync_status = 'PENDING';
CREATE INDEX idx_pos_events_unprocessed ON pos_sales_events(processed) WHERE processed = FALSE;

-- ----------------------------------------------------------------------------
-- 6. SECURITY CONVENTIONS (ROW-LEVEL SECURITY)
-- ----------------------------------------------------------------------------
-- Enable RLS to protect tenant boundary between different stores
ALTER TABLE live_inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffered_scraps ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales_events ENABLE ROW LEVEL SECURITY;

-- Note: Policies should restrict access based on staff jwt metadata mapping.
-- Example placeholder policies:
CREATE POLICY store_staff_ledger_access ON live_inventory_ledger
    FOR ALL
    USING (true); -- Customized in deployment based on role definitions

CREATE POLICY store_staff_scrap_access ON buffered_scraps
    FOR ALL
    USING (true);

-- ----------------------------------------------------------------------------
-- 7. REALTIME REPLICATION
-- ----------------------------------------------------------------------------
-- Enable Supabase Realtime replication for immediate inventory and sales logs updates
ALTER PUBLICATION supabase_realtime ADD TABLE live_inventory_ledger, pos_sales_events;

