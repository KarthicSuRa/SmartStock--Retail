-- ============================================================================
-- Migration Name: 12_staged_procurement_compliance
-- Description: Adds adjusted_quantity and soft-deletion/quantity-modification
--              stored procedures for staged replenishment procurement.
-- ============================================================================

-- 1. ADD COLUMNS AND CONSTRAINTS TO pending_replenishments
ALTER TABLE public.pending_replenishments ADD COLUMN IF NOT EXISTS adjusted_quantity INTEGER;

-- Drop standard generated or existing constraints if any
ALTER TABLE public.pending_replenishments DROP CONSTRAINT IF EXISTS pending_replenishments_status_check;
ALTER TABLE public.pending_replenishments DROP CONSTRAINT IF EXISTS status_check;

-- Add updated check constraint to allow STAGED, MODIFIED, DELETED, TRANSMITTED, PROCESSED, IMMEDIATE_BYPASS
ALTER TABLE public.pending_replenishments ADD CONSTRAINT pending_replenishments_status_check 
CHECK (status IN ('STAGED', 'MODIFIED', 'DELETED', 'TRANSMITTED', 'PROCESSED', 'IMMEDIATE_BYPASS'));

-- 2. CREATE SOFT-DELETION STORED PROCEDURE
CREATE OR REPLACE FUNCTION public.fn_delete_staged_item(row_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.pending_replenishments
    SET status = 'DELETED',
        updated_at = timezone('utc'::text, now())
    WHERE id = row_id;
END;
$$;

-- 3. CREATE QUANTITY MODIFICATION STORED PROCEDURE
CREATE OR REPLACE FUNCTION public.fn_modify_staged_quantity(row_id UUID, new_qty INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.pending_replenishments
    SET quantity = new_qty,
        adjusted_quantity = new_qty,
        status = 'MODIFIED',
        updated_at = timezone('utc'::text, now())
    WHERE id = row_id;
END;
$$;
