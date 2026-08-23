// /tests/load/scenarios/k6-saturation-test.js
// SmartStock LiveRetail V2 — k6 Saturation & Capacity Test (Ramping from 50 to 500 events/sec)

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Normal load
    { duration: '2m', target: 200 },  // 4x load
    { duration: '1m', target: 500 },  // Saturation burst
    { duration: '2m', target: 50 },   // Recovery phase
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'], // Zero unhandled crashes
  },
};

export default function () {
  const url = `${__ENV.BASE_URL || 'http://localhost:54321'}/functions/v1/ingestion-gateway`;
  const storeId = `100${Math.floor(Math.random() * 8) + 1}`;
  const payload = JSON.stringify({
    idempotency_key: `SAT__${Date.now()}__${Math.random()}`,
    event_type: 'SALE',
    tenant_id: 'default-tenant',
    location_id: storeId,
    material_id: 'MAT-20349',
    quantity_delta: -1,
    source_system: 'POS',
    source_event_id: `TXN-SAT-${Math.floor(Math.random() * 1000000)}`,
    business_timestamp: new Date().toISOString(),
    schema_version: '1.0',
    raw_payload: { saturation_test: true },
    metadata: {},
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-source-system': 'POS',
      'x-tenant-id': 'default-tenant',
      Authorization: `Bearer ${__ENV.SUPABASE_ANON_KEY || 'service-role-mock'}`,
    },
  };

  http.post(url, payload, params);
}
