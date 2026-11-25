-- App performance telemetry: web-vitals-style RUM metrics per route.
-- This table powers the admin performance panel and is the baseline for the
-- hillclimb: latency, bytes transferred and perceived lag are all tracked.

CREATE TABLE IF NOT EXISTS app_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    route TEXT NOT NULL,
    method TEXT DEFAULT 'GET',
    user_agent TEXT,
    browser BOOLEAN NOT NULL DEFAULT TRUE,
    is_first_view BOOLEAN NOT NULL DEFAULT FALSE,

    -- Core Web Vitals (ms; null when not measurable in this client).
    ttfb_ms NUMERIC(8,2),
    fcp_ms NUMERIC(8,2),
    lcp_ms NUMERIC(8,2),
    cls NUMERIC(8,4),
    inp_ms NUMERIC(8,2),

    -- Overall lag proxy.
    duration_ms NUMERIC(10,2) NOT NULL,
    bytes_in NUMERIC(10),
    bytes_out NUMERIC(10),

    status INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_perf_route_time ON app_performance_metrics(route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_perf_tenant_time ON app_performance_metrics(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_perf_created_at ON app_performance_metrics(created_at DESC);

ALTER TABLE app_performance_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'app_perf_metrics_read') THEN
        CREATE POLICY app_perf_metrics_read ON app_performance_metrics
            FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'app_perf_metrics_insert') THEN
        CREATE POLICY app_perf_metrics_insert ON app_performance_metrics
            FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'app_perf_metrics_service') THEN
        CREATE POLICY app_perf_metrics_service ON app_performance_metrics
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

COMMENT ON TABLE app_performance_metrics IS
    'Client performance telemetry for latency / bytes / lag hillclimbing.';
