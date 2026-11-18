-- ============================================================
-- Migration 73: Honest SAP batch reconciliation
--
-- Replaces reconcile_sap_batch_sync() from migration 03, which:
--   * invented a SAP material document number with random()
--   * deleted every PENDING scrap row whether or not SAP accepted it
--   * decremented the SAP baseline before SAP had confirmed anything
--
-- The replacement only reconciles rows that the caller explicitly reports as
-- confirmed by SAP, together with the real material document number SAP
-- returned. Rows the caller does not list are left untouched.
--
-- Callers MUST supply SAP's own document number. There is no fallback.
-- ============================================================

DROP FUNCTION IF EXISTS public.reconcile_sap_batch_sync();

CREATE OR REPLACE FUNCTION public.reconcile_sap_batch_sync(p_synced jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_entry      jsonb;
    v_scrap_id   uuid;
    r            RECORD;
    v_synced     integer := 0;
    v_skipped    integer := 0;
BEGIN
    IF p_synced IS NULL
       OR jsonb_typeof(p_synced) <> 'array'
       OR jsonb_array_length(p_synced) = 0 THEN
        RETURN json_build_object(
            'success', true,
            'synced', 0,
            'skipped', 0,
            'message', 'No SAP-confirmed postings were supplied; nothing was reconciled.'
        );
    END IF;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_synced)
    LOOP
        -- A reconciliation entry without a row id or without SAP's document
        -- number is unusable. Skip it rather than inventing either value.
        IF v_entry->>'id' IS NULL
           OR v_entry->>'material_document' IS NULL THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        BEGIN
            v_scrap_id := (v_entry->>'id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END;

        SELECT * INTO r
        FROM public.buffered_scraps
        WHERE id = v_scrap_id
          AND sync_status = 'PENDING';

        IF NOT FOUND THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        UPDATE public.buffered_scraps
        SET sync_status       = 'SYNCED',
            sap_document_id   = v_entry->>'material_document',
            sap_document_year = v_entry->>'material_document_year',
            error_log         = NULL,
            synced_at         = TIMEZONE('utc', NOW())
        WHERE id = r.id;

        -- Only now, with SAP's confirmation in hand, does the local projection
        -- of SAP stock move.
        UPDATE public.live_inventory_ledger
        SET sap_baseline_qty = sap_baseline_qty - r.quantity,
            updated_at       = TIMEZONE('utc', NOW())
        WHERE sap_plant_code = r.sap_plant_code
          AND sap_storage_loc = r.sap_storage_loc
          AND sku = r.sku;

        v_synced := v_synced + 1;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'synced', v_synced,
        'skipped', v_skipped,
        'message', format(
            '%s scrap posting(s) reconciled against SAP-confirmed material documents.',
            v_synced
        )
    );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SAP batch reconciliation failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.reconcile_sap_batch_sync(jsonb) IS
    'Marks buffered_scraps as SYNCED using only SAP-confirmed material document numbers supplied by the caller. Never fabricates identifiers and never deletes unposted rows.';
