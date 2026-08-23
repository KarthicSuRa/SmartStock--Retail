// /tests/property/replay-fingerprint.test.ts
// SmartStock LiveRetail V2 — Deterministic Replay Fingerprint Verification (RC1)

import { ProjectionRules, PositionState } from '../../supabase/functions/_shared/projection/rules';
import { generateComplexSequence } from './generators/event-sequence-generator';

function computeProjectionFingerprint(position: PositionState, appliedEventIds: string[]): string {
  const canonicalState = {
    on_hand: position.estimated_on_hand,
    reserved: position.reserved_qty,
    in_transit: position.in_transit_qty,
    sellable: position.sellable_qty,
    version: position.projection_version,
    events: [...appliedEventIds].sort(),
  };

  // Deterministic JSON representation string
  return JSON.stringify(canonicalState);
}

describe('Deterministic Projection Replay Fingerprint Tests', () => {
  test('1,000 replays of identical event history produce 100% identical state fingerprints', () => {
    const events = generateComplexSequence('1001', {
      length: 80,
      includeCheckpoints: true,
      includeLateEvents: true,
      includeReversals: true,
    });

    let baselineFingerprint = '';

    for (let run = 0; run < 1000; run++) {
      let pos: PositionState = {
        erp_checkpoint_qty: 0,
        estimated_on_hand: 0,
        sellable_qty: 0,
        reserved_qty: 0,
        in_transit_qty: 0,
        confidence_score: 100,
        reconciliation_status: 'MATCHED',
        projection_version: 1,
      };

      const appliedIds: string[] = [];

      for (const evt of events) {
        pos = ProjectionRules.applyEvent(pos, evt);
        appliedIds.push(evt.event_id);
      }

      const currentFingerprint = computeProjectionFingerprint(pos, appliedIds);

      if (run === 0) {
        baselineFingerprint = currentFingerprint;
      } else {
        expect(currentFingerprint).toBe(baselineFingerprint);
      }
    }
  });
});
