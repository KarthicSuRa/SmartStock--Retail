-- ============================================================================
-- Migration Name: 05_corporate_retail_sourcing
-- Description: Adds material categories, sourcing staging master,
--              open inbound orders staging, and get_validated_recommendations function.
--              Includes strict SAP data dictionary reference column names.
-- ============================================================================

-- 0. CLEANUP PREVIOUS STRUCTURES TO PREVENT COMPILATION & RETURN TYPE MISMATCHES
DROP FUNCTION IF EXISTS public.get_validated_recommendations();
DROP TABLE IF EXISTS public.erp_purchase_info_records CASCADE;
DROP TABLE IF EXISTS public.erp_open_inbound_orders CASCADE;

-- 1. ALTER LIVE INVENTORY LEDGER TABLE (IF NOT EXISTS)
ALTER TABLE public.live_inventory_ledger 
ADD COLUMN IF NOT EXISTS merchandise_category VARCHAR(20) CHECK (merchandise_category IN ('FMCG', 'HIGH_VALUE', 'SEASONAL', 'HARDLINES')),
ADD COLUMN IF NOT EXISTS target_stock INTEGER DEFAULT 100 NOT NULL,
ADD COLUMN IF NOT EXISTS sales_margin NUMERIC(10, 2) DEFAULT 5.00 NOT NULL;

-- 2. CREATE SOURCING MASTER STAGING TABLE (erp_purchase_info_records)
-- Mapped using exact SAP S/4HANA OData Dictionary structures.
CREATE TABLE public.erp_purchase_info_records (
    -- SAP Material Number (MATNR). Mapped to product unique SKU.
    sku VARCHAR(40) PRIMARY KEY,
    
    -- SAP Material Group (MATKL). Tracks corporate retail groupings (e.g., 'FMCG', 'HARDLINES').
    matkl_group VARCHAR(20) NOT NULL,
    
    -- SAP Vendor/Creditor Account Number (LIFNR). Reference to procurement source.
    vendor_id VARCHAR(50) NOT NULL,
    
    -- SAP Vendor Name (NAME1). Friendly name of the supplying vendor.
    vendor_name VARCHAR(255) NOT NULL,
    
    -- SAP Net Price in Purchasing Info Record (NETPR). Represented in store regional currency.
    netpr_price NUMERIC(11, 2) NOT NULL CHECK (netpr_price >= 0),
    
    -- SAP Minimum Order Quantity in Purchase Info Record (MINBM). Triggers MOQ scaling.
    minbm_moq INTEGER NOT NULL CHECK (minbm_moq >= 0),
    
    -- SAP Planned Delivery Time in Days (PLIFZ). Vendor turnaround timeline for risk projections.
    vendor_lead_days INTEGER NOT NULL CHECK (vendor_lead_days >= 0),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. CREATE OPEN INBOUND ORDERS STAGING TABLE
-- Tracks items in transit to avoid duplicate ordering.
CREATE TABLE public.erp_open_inbound_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(40) NOT NULL,
    open_inbound_qty INTEGER NOT NULL CHECK (open_inbound_qty >= 0),
    estimated_delivery_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. ENABLE ROW LEVEL SECURITY & POLICIES
ALTER TABLE public.erp_purchase_info_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_open_inbound_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_staff_info_records_access ON public.erp_purchase_info_records
    FOR ALL USING (true);

CREATE POLICY store_staff_open_inbound_access ON public.erp_open_inbound_orders
    FOR ALL USING (true);

-- 5. CREATE RECOMMENDATION ROUTINE (Layer 3 Financial Yield Optimization Engine)
-- Evaluates live inventory position, factors in open inbound orders, scales to minimum order quantity,
-- and calculates the projected financial yield of immediate/staged replenishment.
CREATE OR REPLACE FUNCTION public.get_validated_recommendations()
RETURNS TABLE (
    sap_plant_code VARCHAR(4),
    sap_storage_loc VARCHAR(4),
    sku VARCHAR(40),
    product_name VARCHAR(255),
    current_stock INTEGER,
    target_stock INTEGER,
    raw_deficit INTEGER,
    open_inbound_qty INTEGER,
    net_deficit INTEGER,
    minimum_order_qty INTEGER,
    recommended_qty INTEGER,
    unit_price NUMERIC(11, 2),
    sales_margin NUMERIC(10, 2),
    financial_yield NUMERIC(10, 2),
    vendor_id VARCHAR(50),
    vendor_name VARCHAR(255),
    vendor_lead_days INTEGER,
    merchandise_category VARCHAR(20),
    matkl_group VARCHAR(20)
)
LANGUAGE sql
SECURITY DEFINER
AS $$
SELECT 
    l.sap_plant_code,
    l.sap_storage_loc,
    l.sku,
    l.product_name,
    l.current_calculated_stock AS current_stock,
    l.target_stock,
    (l.target_stock - l.current_calculated_stock) AS raw_deficit,
    COALESCE(inbound.total_inbound, 0)::INTEGER AS open_inbound_qty,
    (l.target_stock - l.current_calculated_stock - COALESCE(inbound.total_inbound, 0))::INTEGER AS net_deficit,
    COALESCE(pir.minbm_moq, 0) AS minimum_order_qty,
    CASE 
        WHEN (l.target_stock - l.current_calculated_stock - COALESCE(inbound.total_inbound, 0)) <= 0 THEN 0
        ELSE GREATEST((l.target_stock - l.current_calculated_stock - COALESCE(inbound.total_inbound, 0)), COALESCE(pir.minbm_moq, 0))
    END::INTEGER AS recommended_qty,
    pir.netpr_price AS unit_price,
    l.sales_margin,
    -- Financial Yield is computed as: recommended quantity * sales margin per unit
    (CASE 
        WHEN (l.target_stock - l.current_calculated_stock - COALESCE(inbound.total_inbound, 0)) <= 0 THEN 0
        ELSE GREATEST((l.target_stock - l.current_calculated_stock - COALESCE(inbound.total_inbound, 0)), COALESCE(pir.minbm_moq, 0))
     END * COALESCE(l.sales_margin, 0.00))::NUMERIC(10, 2) AS financial_yield,
    pir.vendor_id,
    pir.vendor_name,
    pir.vendor_lead_days,
    l.merchandise_category,
    pir.matkl_group
FROM public.live_inventory_ledger l
LEFT JOIN public.erp_purchase_info_records pir ON l.sku = pir.sku
LEFT JOIN (
    SELECT sku, SUM(open_inbound_qty) AS total_inbound
    FROM public.erp_open_inbound_orders
    GROUP BY sku
) inbound ON l.sku = inbound.sku;
$$;
