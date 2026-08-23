-- =============================================================================
-- Migration 72: Context Feature Definitions & Sensitivity Registry
-- SmartStock Context Intelligence V1
--
-- PURPOSE:
--   Registers external context features in the central feature registry and
--   defines category-level sensitivity coefficients for demand modeling.
-- =============================================================================

INSERT INTO analytics.feature_registry 
    (feature_name, version, category, data_type, freshness_sla_seconds, sql_definition, plain_english_def)
VALUES
    ('weather_temperature_24h', 1, 'EXTERNAL_WEATHER', 'NUMERIC', 3600, 'external_weather_forecasts.temperature_c WHERE horizon_hours = 24', 'Projected temperature in Celsius 24h ahead'),
    ('weather_temp_delta_norm', 1, 'EXTERNAL_WEATHER', 'NUMERIC', 3600, 'temperature_c - historical_monthly_mean_temp', 'Temperature anomaly vs seasonal climatological normal'),
    ('weather_precip_prob_24h', 1, 'EXTERNAL_WEATHER', 'NUMERIC', 3600, 'external_weather_forecasts.precipitation_probability_pct', 'Probability of rain/precipitation 24h ahead'),
    ('holiday_days_until', 1, 'EXTERNAL_CALENDAR', 'NUMERIC', 86400, 'MIN(start_date - CURRENT_DATE) WHERE is_public_holiday', 'Days remaining until next major public holiday'),
    ('is_holiday_eve', 1, 'EXTERNAL_CALENDAR', 'BOOLEAN', 86400, 'EXISTS(event WHERE start_date = CURRENT_DATE + 1)', 'Indicates day immediately preceding a public holiday'),
    ('promo_discount_pct', 1, 'COMMERCIAL', 'NUMERIC', 1800, 'external_promotion_calendar.discount_percentage', 'Active promotional price discount depth'),
    ('local_event_impact_score', 1, 'EXTERNAL_EVENTS', 'NUMERIC', 3600, 'MAX(impact_score) WHERE distance_km < 3.0', 'Composite local event traffic impact score')
ON CONFLICT (feature_name) DO UPDATE SET
    version = EXCLUDED.version,
    plain_english_def = EXCLUDED.plain_english_def;
