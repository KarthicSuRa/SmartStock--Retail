-- /supabase/migrations/31_gdpr_retention.sql

-- ==================== AUTOMATED DATA RETENTION FUNCTIONS ====================

CREATE OR REPLACE FUNCTION purge_old_pos_payloads()
RETURNS void AS $$
BEGIN
    UPDATE inventory_movements
    SET reference_document = 'REDACTED_' || LEFT(reference_document, 8)
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND reference_document NOT LIKE 'REDACTED_%';
    
    DELETE FROM inventory_movements
    WHERE created_at < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION purge_old_weather()
RETURNS void AS $$
BEGIN
    DELETE FROM weather_cache WHERE fetched_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION purge_old_execution_batches()
RETURNS void AS $$
BEGIN
    DELETE FROM execution_batch_items 
    WHERE created_at < NOW() - INTERVAL '2 years';
    
    DELETE FROM execution_batches 
    WHERE created_at < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;
