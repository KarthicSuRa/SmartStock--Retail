// /tests/load/scenarios/k6-pilot-profile-a.js
// SmartStock LiveRetail V2 — k6 Load Benchmark: Pilot Profile A (10 Stores, 50 events/sec)

export const options = {
  scenarios: {
    pilot_traffic: {
      executor: 'constant-arrival-rate',
      rate: 50, // 50 events per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<250'], // Ingestion ACK P95 < 250ms
    http_req_failed: ['rate<0.001'],  // < 0.1% failure rate
  },
};

export default function () {
  const url = `${__ENV.BASE_URL || 'http://localhost:54321'}/functions/v1/ingestion-gateway`;
  const storeId = `100${Math.floor(Math.random() * 8) + 1}`;
  const payload = JSON.stringify({
    idempotency_key: `LOAD__${Date.now()}__${Math.random()}`,
    event_type: 'SALE',
    tenant_id: 'default-tenant',
    location_id: storeId,
    material_id: 'MAT-00918',
    quantity_delta: -1,
    source_system: 'POS',
    source_event_id: `TXN-${Math.floor(Math.random() * 1000000)}`,
    business_timestamp: new Date().toISOString(),
    schema_version: '1.0',
    raw_payload: { load_test: true },
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

  const res = http.post(url, payload, params);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'acknowledged': (r) => JSON.parse(r.body).status === 'ACCEPTED',
  });
}
