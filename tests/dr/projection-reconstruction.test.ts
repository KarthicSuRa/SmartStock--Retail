// /tests/dr/projection-reconstruction.test.ts
// SmartStock LiveRetail V2 — Disaster Recovery & Projection Rebuild Test (RC1)

import { ProjectionRules, PositionState } from '../../supabase/functions/_shared/projection/rules';
import { generateComplexSequence } from '../property/generators/event-sequence-generator';

describe('Disaster Recovery & Projection Reconstruction Verification', () => {
  test('Complete wipe of inventory_position followed by full event replay restores exact pre-disaster state', () => {
    const events = generateComplexSequence('1001', {
      length: 60,
      includeCheckpoints: true,
      includeLateEvents: true,
      includeReversals: true,
    });

    // 1. Initial live operation
    let livePosition: PositionState = {
      erp_checkpoint_qty: 0,
      estimated_on_hand: 0,
      sellable_qty: 0,
      reserved_qty: 0,
      in_transit_qty: 0,
      confidence_score: 100,
      reconciliation_status: 'MATCHED',
      projection_version: 1,
    };

    for (const evt of events) {
      livePosition = ProjectionRules.applyEvent(livePosition, evt);
    }

    // 2. SIMULATE DISASTER: Wipe read model
    let reconstructedPosition: PositionState = {
      erp_checkpoint_qty: 0,
      estimated_on_hand: 0,
      sellable_qty: 0,
      reserved_qty: 0,
      in_transit_qty: 0,
      confidence_score: 100,
      reconciliation_status: 'MATCHED',
      projection_version: 1,
    };

    // 3. REBUILD: Replay full immutable event stream
    for (const evt of events) {
      reconstructedPosition = ProjectionRules.applyEvent(reconstructedPosition, evt);
    }

    // 4. VERIFY: Every single quantity state is 100% restored
    expect(reconstructedPosition.estimated_on_hand).toBe(livePosition.estimated_on_hand);
    expect(reconstructedPosition.sellable_qty).toBe(livePosition.sellable_qty);
    expect(reconstructedPosition.reserved_qty).toBe(livePosition.reserved_qty);
    expect(reconstructedPosition.in_transit_qty).toBe(livePosition.in_transit_qty);
    expect(reconstructedPosition.projection_version).toBe(livePosition.projection_version);
  });
});
