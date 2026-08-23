// /tests/failure-injection/failure-paths.test.ts
// SmartStock LiveRetail V2 — Failure Path & Edge Case Test Suite (Stage 10)

import { validateCanonicalEvent } from '../../supabase/functions/_shared/event-model/validator';
import { evaluateConfidence } from '../../supabase/functions/confidence-engine/index';

describe('Failure Paths & Edge-Case Integrity Suite', () => {
  describe('Ingestion Validation & Clock Skew Guard', () => {
    test('Event with business_timestamp > 30 days in future is rejected', () => {
      const futureDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
      const event = {
        idempotency_key: 'POS__tenant1__future',
        event_type: 'SALE',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        location_id: '22222222-2222-4222-8222-222222222222',
        source_system: 'POS',
        source_event_id: 'future-01',
        business_timestamp: futureDate,
        quantity_delta: -1,
        schema_version: '1.0',
        raw_payload: {},
        metadata: {},
      };

      const result = validateCanonicalEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'business_timestamp')).toBe(true);
    });

    test('Zero-quantity delta event is rejected as non-mutating', () => {
      const event = {
        idempotency_key: 'POS__tenant1__zero',
        event_type: 'SALE',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        location_id: '22222222-2222-4222-8222-222222222222',
        source_system: 'POS',
        source_event_id: 'zero-01',
        business_timestamp: new Date().toISOString(),
        quantity_delta: 0,
        schema_version: '1.0',
        raw_payload: {},
        metadata: {},
      };

      const result = validateCanonicalEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'quantity_delta')).toBe(true);
    });
  });

  describe('Confidence Scoring Under Cumulative Adverse Signals', () => {
    test('Unexplained variance + sequence gap + ancient count drops confidence to LOW', () => {
      const evaluation = evaluateConfidence({
        daysSincePhysicalCount: 45, // > 30 days (-20)
        hasUnexplainedSapVariance: true, // (-25)
        hasPendingOfflineEvents: true, // (-10)
        hasSequenceGap: true, // (-10)
        hasRecentShrinkAnomaly: true, // (-15)
      });

      // 100 - 20 - 25 - 10 - 10 - 15 = 20
      expect(evaluation.score).toBe(20);
      expect(evaluation.classification).toBe('LOW');
      expect(evaluation.reasons.length).toBe(5);
    });
  });
});
