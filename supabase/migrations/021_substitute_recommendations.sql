-- /supabase/migrations/021_substitute_recommendations.sql

-- ==================== SUBSTITUTE RECOMMENDATION VIEW ====================
-- Recommends substitute SKUs during stockouts using basket co-occurrence and category similarity

CREATE OR REPLACE VIEW substitute_recommendations AS
SELECT 
    a.sku AS out_of_stock_sku,
    b.sku AS substitute_sku,
    COUNT(*) AS co_occurrence,
    AVG(COALESCE(mm_b.standard_price, 0) - COALESCE(mm_a.standard_price, 0)) AS price_delta,
    (
        CASE 
            WHEN mm_a.material_group = mm_b.material_group THEN 30
            ELSE 0
        END +
        CASE 
            WHEN ABS(COALESCE(mm_a.standard_price, 0) - COALESCE(mm_b.standard_price, 0)) / NULLIF(COALESCE(mm_a.standard_price, 1), 0) < 0.2 THEN 20
            ELSE 0
        END
    ) AS similarity_score
FROM inventory_movements a
JOIN inventory_movements b 
    ON a.reference_id = b.reference_id 
    AND a.sku != b.sku
    AND a.movement_type = 'SALE'
    AND b.movement_type = 'SALE'
JOIN material_master mm_a ON a.sku = mm_a.sku
JOIN material_master mm_b ON b.sku = mm_b.sku
WHERE a.tenant_id = current_setting('app.current_tenant', true)::UUID
GROUP BY a.sku, b.sku, mm_a.material_group, mm_b.material_group, mm_a.standard_price, mm_b.standard_price
HAVING COUNT(*) > 2
ORDER BY similarity_score DESC, co_occurrence DESC;
