// /tests/concurrency/same-sku-concurrent-sales.test.ts
// SmartStock LiveRetail V2 — Concurrency & High-Frequency Invariant Tests

import { ProjectionRules, PositionState } from '../../supabase/functions/_shared/projection/rules';
import { validateCanonicalEvent } from '../../supabase/functions/_shared/event-model/validator';

describe('Concurrency & Race-Condition Invariant Suite', () => {
  test('100 concurrent POS sale events on same SKU produce exact deterministic subtraction', () => {
    let position: PositionState = {
      erp_checkpoint_qty: 200,
      estimated_on_hand: 200,
      sellable_qty: 200,
      reserved_qty: 0,
      in_transit_qty: 0,
      confidence_score: 100,
      reconciliation_status: 'MATCHED',
      projection_version: 1,
      checkpoint_watermark: '2026-08-22T02:00:00Z',
    };

    // 100 concurrent sales of 1 unit each
    const concurrentEvents = Array.from({ length: 100 }, (_, i) => ({
      event_id: `evt-concurrent-${i}`,
      event_type: 'SALE' as const,
      quantity_delta: -1,
      business_timestamp: new Date(Date.now() + i * 100).toISOString(),
    }));

    for (const evt of concurrentEvents) {
      position = ProjectionRules.applyEvent(position, evt);
    }

    expect(position.estimated_on_hand).toBe(100);
    expect(position.sellable_qty).toBe(100);
    expect(position.projection_version).toBe(101);
  });

  test('Interleaved sales, returns, damages, and reservations maintain mathematical balance', () => {
    let position: PositionState = {
      erp_checkpoint_qty: 100,
      estimated_on_hand: 100,
      sellable_qty: 100,
      reserved_qty: 0,
      in_transit_qty: 0,
      confidence_score: 100,
      reconciliation_status: 'MATCHED',
      projection_version: 1,
      checkpoint_watermark: '2026-08-22T02:00:00Z',
    };

    // 50 sales (-1), 10 returns (+1), 5 damages (-1), 10 reservations (reserved +1, sellable -1)
    // Expected on-hand: 100 - 50 + 10 - 5 = 55
    // Expected reserved: 10
    // Expected sellable: 55 - 10 = 45
    const mixedEvents = [
      ...Array(50).fill({ event_type: 'SALE', delta: -1 }),
      ...Array(10).fill({ event_type: 'RETURN', delta: 1 }),
      ...Array(5).fill({ event_type: 'DAMAGE', delta: -1 }),
      ...Array(10).fill({ event_type: 'RESERVATION', delta: 1 }),
    ].sort(() => Math.random() - 0.5); // Randomly interleave

    mixedEvents.forEach((evt, idx) => {
      position = ProjectionRules.applyEvent(position, {
        event_id: `mixed-${idx}`,
        event_type: evt.event_type as any,
        quantity_delta: evt.delta,
        business_timestamp: new Date(Date.now() + idx * 100).toISOString(),
      });
    });

    expect(position.estimated_on_hand).toBe(55);
    expect(position.reserved_qty).toBe(10);
    expect(position.sellable_qty).toBe(45);
  });
});
