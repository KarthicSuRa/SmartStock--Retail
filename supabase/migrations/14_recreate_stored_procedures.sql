-- ============================================================================
-- Migration Name: 14_recreate_stored_procedures
-- Description: Adds updated_at to buffered_scraps and updates fn_delete_staged_item
--              and fn_modify_staged_quantity to handle both tables.
-- ============================================================================

-- Add updated_at column to buffered_scraps
ALTER TABLE public.buffered_scraps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Recreate fn_delete_staged_item to handle both pending_replenishments and buffered_scraps
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

    UPDATE public.buffered_scraps
    SET status = 'DELETED',
        updated_at = timezone('utc'::text, now())
    WHERE id = row_id;
END;
$$;

-- Recreate fn_modify_staged_quantity to handle both pending_replenishments and buffered_scraps
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

    UPDATE public.buffered_scraps
    SET quantity = new_qty,
        adjusted_quantity = new_qty,
        status = 'MODIFIED',
        updated_at = timezone('utc'::text, now())
    WHERE id = row_id;
END;
$$;
