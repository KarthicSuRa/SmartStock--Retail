-- ============================================================================
-- Migration Name: 04_purchase_order_routing
-- Description: Creates pending_replenishments table and order routing functions
--              supporting Staged and Immediate purchasing lanes.
-- ============================================================================

-- 1. CREATE CORE REPLENISHMENTS TABLE
CREATE TABLE IF NOT EXISTS public.pending_replenishments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(40) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    plant VARCHAR(4) NOT NULL,
    storage_location VARCHAR(4) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'STAGED' CHECK (status IN ('STAGED', 'PROCESSED', 'IMMEDIATE_BYPASS')),
    sap_po_reference TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.pending_replenishments IS 'Replenishment order routing queue for Staged or Immediate-bypass processing lanes.';

-- 2. CREATE UNIQUE INDEX FOR ACCUMULATING ACTIVE STAGED REPLENISHMENTS
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_replenishments_staged_unique
ON public.pending_replenishments (sku, plant, storage_location)
WHERE status = 'STAGED';

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.pending_replenishments ENABLE ROW LEVEL SECURITY;

-- 4. CREATE RLS POLICY
CREATE POLICY store_staff_replenishments_access ON public.pending_replenishments
    FOR ALL
    USING (true);

-- 5. CREATE SECURITY DEFINER ROUTING FUNCTION
CREATE OR REPLACE FUNCTION public.queue_replenishment_order(
    p_sku TEXT,
    p_qty INT,
    p_plant TEXT,
    p_bypass BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_storage_loc VARCHAR;
BEGIN
    -- Look up the storage location from the ledger if it exists
    SELECT sap_storage_loc INTO v_storage_loc
    FROM public.live_inventory_ledger
    WHERE sku = p_sku AND sap_plant_code = p_plant
    LIMIT 1;

    -- Fallback to default if not found
    IF v_storage_loc IS NULL THEN
        v_storage_loc := '0001';
    END IF;

    IF p_bypass THEN
        -- If p_bypass is true, insert the row directly as 'IMMEDIATE_BYPASS'
        INSERT INTO public.pending_replenishments (
            sku,
            quantity,
            plant,
            storage_location,
            status
        )
        VALUES (
            p_sku,
            p_qty,
            p_plant,
            v_storage_loc,
            'IMMEDIATE_BYPASS'
        );
    ELSE
        -- If p_bypass is false, insert or upsert the quantity into the active accumulated 'STAGED' row
        INSERT INTO public.pending_replenishments (
            sku,
            quantity,
            plant,
            storage_location,
            status
        )
        VALUES (
            p_sku,
            p_qty,
            p_plant,
            v_storage_loc,
            'STAGED'
        )
        ON CONFLICT (sku, plant, storage_location) WHERE status = 'STAGED'
        DO UPDATE SET
            quantity = public.pending_replenishments.quantity + EXCLUDED.quantity,
            updated_at = timezone('utc'::text, now());
    END IF;
END;
$$;
