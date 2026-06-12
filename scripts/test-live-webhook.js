#!/usr/bin/env node
// =============================================================================
// SAP LiveRetail — POS Webhook Integration Test Script
// Usage:
//   node scripts/test-live-webhook.js
//   node scripts/test-live-webhook.js --sku MAT-20349 --qty 5
//   node scripts/test-live-webhook.js --store 2001 --loc 0002 --sku MAT-40912 --qty 2
// =============================================================================

import { createHmac } from 'node:crypto';
import { parseArgs } from 'node:util';

// -----------------------------------------------------------------------------
// 1. CONFIGURATION
// -----------------------------------------------------------------------------
const ENDPOINT = 'https://fqnrixjostcsosolsxhe.supabase.co/functions/v1/pos-webhook';

// In production this should be sourced from an environment variable.
// For integration testing we use a known mock key agreed with the Edge Function.
const POS_WEBHOOK_SECRET = process.env.POS_WEBHOOK_SECRET ?? 'retail_secret_2026';

// -----------------------------------------------------------------------------
// 2. CLI ARGUMENT PARSING
// -----------------------------------------------------------------------------
const { values: args } = parseArgs({
  options: {
    sku:   { type: 'string',  default: 'MAT-00918' },
    qty:   { type: 'string',  default: '3'         },
    store: { type: 'string',  default: '1001'       },
    loc:   { type: 'string',  default: '0001'       },
  },
  strict: false,
});

const sku      = args.sku;
const quantity = parseInt(args.qty, 10);
const store    = args.store;
const loc      = args.loc;

if (isNaN(quantity) || quantity < 1) {
  console.error('❌  --qty must be a positive integer.');
  process.exit(1);
}

// -----------------------------------------------------------------------------
// 3. BUILD PAYLOAD
// -----------------------------------------------------------------------------
const payload = {
  store_code:       store,
  storage_location: loc,
  items: [
    { sku, quantity },
  ],
  timestamp: new Date().toISOString(),
};

const payloadBody = JSON.stringify(payload);

// -----------------------------------------------------------------------------
// 4. GENERATE HMAC-SHA256 SIGNATURE
// -----------------------------------------------------------------------------
const signature = createHmac('sha256', POS_WEBHOOK_SECRET)
  .update(payloadBody)
  .digest('hex');

// -----------------------------------------------------------------------------
// 5. DISPATCH REQUEST
// -----------------------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  SAP LiveRetail — POS Webhook Integration Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`\n🎯  Endpoint  :  ${ENDPOINT}`);
console.log(`🏪  Store     :  ${store}  (Storage Loc: ${loc})`);
console.log(`📦  SKU       :  ${sku}  ×  ${quantity} units`);
console.log(`\n📤  Outbound Payload Body:\n`);
console.log(JSON.stringify(payload, null, 2));
console.log(`\n🔐  X-POS-Signature (SHA-256 HMAC):\n    ${signature}\n`);

let response;
try {
  response = await fetch(ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-POS-Signature':  signature,
    },
    body: payloadBody,
  });
} catch (networkErr) {
  console.error(`\n❌  Network error — could not reach endpoint:\n    ${networkErr.message}`);
  process.exit(1);
}

// -----------------------------------------------------------------------------
// 6. PARSE AND DISPLAY RESPONSE
// -----------------------------------------------------------------------------
const responseBody = await response.text();
let parsedJson;
try {
  parsedJson = JSON.parse(responseBody);
} catch {
  parsedJson = responseBody;
}

const statusIcon = response.ok ? '✅' : '❌';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  ${statusIcon}  HTTP Response`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`\n   Status Code  :  ${response.status} ${response.statusText}`);
console.log(`   Content-Type :  ${response.headers.get('content-type') ?? 'N/A'}`);
console.log(`\n   Response Body:\n`);
console.log(typeof parsedJson === 'object'
  ? JSON.stringify(parsedJson, null, 2)
  : parsedJson
);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (!response.ok) {
  process.exit(1);
}
