-- ============================================================================
-- Migration Name: 13_buffered_scraps_compliance
-- Description: Adds status check and adjusted_quantity columns to buffered_scraps.
-- ============================================================================

ALTER TABLE public.buffered_scraps ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'STAGED';
ALTER TABLE public.buffered_scraps ADD COLUMN IF NOT EXISTS adjusted_quantity INTEGER;

ALTER TABLE public.buffered_scraps DROP CONSTRAINT IF EXISTS buffered_scraps_status_check;
ALTER TABLE public.buffered_scraps ADD CONSTRAINT buffered_scraps_status_check 
CHECK (status IN ('STAGED', 'MODIFIED', 'DELETED', 'TRANSMITTED'));
