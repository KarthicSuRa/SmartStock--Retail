// /tests/property/generators/event-sequence-generator.ts
// SmartStock LiveRetail V2 — Complex Event Sequence Generator (RC1)

import { InventoryEventType } from '../../../supabase/functions/_shared/event-model/types';
import { ProjectionEventInput } from '../../../supabase/functions/_shared/projection/rules';

export interface GeneratedSequenceOptions {
  length?: number;
  includeCheckpoints?: boolean;
  includeLateEvents?: boolean;
  includeDuplicates?: boolean;
  includeReversals?: boolean;
}

const ALL_MUTATION_TYPES: InventoryEventType[] = [
  'SALE', 'SALE_REVERSAL', 'RETURN',
  'GOODS_RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT',
  'DAMAGE', 'EXPIRY', 'PHYSICAL_COUNT', 'COUNT_ADJUSTMENT',
  'RESERVATION', 'RESERVATION_RELEASE',
];

export function generateComplexSequence(
  storeId = '1001',
  options: GeneratedSequenceOptions = {}
): ProjectionEventInput[] {
  const count = options.length ?? 50;
  const events: ProjectionEventInput[] = [];
  const baseTime = Date.now() - count * 60 * 1000;

  let seq = 1;

  // 1. Initial Checkpoint if enabled
  if (options.includeCheckpoints) {
    events.push({
      event_id: `evt-cp-0`,
      event_type: 'SAP_CHECKPOINT',
      quantity_delta: 500,
      business_timestamp: new Date(baseTime).toISOString(),
      source_system: 'SAP',
      source_sequence: 1,
      location_id: storeId,
      checkpoint_source_watermarks: {
        [`POS__${storeId}`]: 10,
        [`WMS__${storeId}`]: 5,
      },
    });
  }

  // 2. Generate interleaved events
  for (let i = 0; i < count; i++) {
    const type = ALL_MUTATION_TYPES[Math.floor(Math.random() * ALL_MUTATION_TYPES.length)];
    const delta = Math.floor(Math.random() * 5) + 1;
    const isLate = options.includeLateEvents && Math.random() < 0.15;
    const eventTime = isLate
      ? new Date(baseTime - 30 * 60 * 1000).toISOString() // 30 min before baseline
      : new Date(baseTime + i * 60 * 1000).toISOString();

    const currentSeq = seq++;
    events.push({
      event_id: `evt-${i}-${currentSeq}`,
      event_type: type,
      quantity_delta: ['SALE', 'TRANSFER_OUT', 'DAMAGE', 'EXPIRY'].includes(type) ? -delta : delta,
      business_timestamp: eventTime,
      source_system: 'POS',
      source_sequence: currentSeq,
      location_id: storeId,
    });

    // Generate matching reversal if enabled
    if (options.includeReversals && type === 'SALE' && Math.random() < 0.3) {
      events.push({
        event_id: `evt-rev-${i}`,
        event_type: 'SALE_REVERSAL',
        quantity_delta: delta,
        business_timestamp: new Date(baseTime + (i + 1) * 60 * 1000).toISOString(),
        source_system: 'POS',
        source_sequence: seq++,
        location_id: storeId,
      });
    }
  }

  // Generate duplicates if enabled
  if (options.includeDuplicates && events.length > 2) {
    const dupIndex = Math.floor(Math.random() * (events.length - 1));
    events.push({ ...events[dupIndex] });
  }

  return events;
}
