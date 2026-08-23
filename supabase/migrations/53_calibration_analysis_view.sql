-- =============================================================================
-- Migration 53: Confidence Calibration Monotonicity Analysis View
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Aggregates empirical count variances grouped by confidence score deciles
--   to prove that higher confidence scores correlate with lower inventory error.
-- =============================================================================

CREATE OR REPLACE VIEW v_confidence_calibration_analysis AS
SELECT
    CASE
        WHEN confidence_score >= 90 THEN '90-100'
        WHEN confidence_score >= 80 THEN '80-89'
        WHEN confidence_score >= 70 THEN '70-79'
        ELSE '<70'
    END AS confidence_band,
    COUNT(*) AS observations,
    ROUND(AVG(ABS(count_variance_units)), 2) AS mean_abs_variance_units,
    ROUND(AVG(ABS(COALESCE(count_variance_pct, 0))), 2) AS mean_abs_error_pct
FROM confidence_calibration_log
WHERE count_performed_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

GRANT SELECT ON v_confidence_calibration_analysis TO authenticated, service_role;
