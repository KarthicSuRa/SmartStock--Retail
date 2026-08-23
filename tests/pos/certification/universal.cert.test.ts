// /tests/pos/certification/universal.cert.test.ts
// SmartStock LiveRetail V2 — Universal POS Connector 25-Scenario Certification Test Suite

import { ShopifyPOSConnector } from '../../supabase/functions/_shared/pos/connectors/shopify/shopify-connector';
import { SquarePOSConnector } from '../../supabase/functions/_shared/pos/connectors/square/square-connector';
import { LightspeedPOSConnector } from '../../supabase/functions/_shared/pos/connectors/lightspeed/lightspeed-connector';
import { CloverPOSConnector } from '../../supabase/functions/_shared/pos/connectors/clover/clover-connector';
import { UniversalPOSCertificationHarness, SCENARIO_CATALOG } from './harness';

describe('Universal POS Connector 25-Scenario Enterprise Certification', () => {
  const connectors = [
    { name: 'Shopify POS Connector', instance: new ShopifyPOSConnector() },
    { name: 'Square POS Connector', instance: new SquarePOSConnector() },
    { name: 'Lightspeed Retail (X-Series)', instance: new LightspeedPOSConnector() },
    { name: 'Clover Platform Connector', instance: CloverPOSConnector },
  ];

  for (const conn of connectors) {
    test(`${conn.name} successfully achieves 100% (25/25) Enterprise Scenario Certification`, async () => {
      const results = await UniversalPOSCertificationHarness.certify(conn.instance);

      expect(results.length).toBe(SCENARIO_CATALOG.length);
      const passedCount = results.filter((r) => r.passed).length;
      expect(passedCount).toBe(25);
    });
  }
});
