// /supabase/functions/_shared/event-model/validator.ts
// SmartStock LiveRetail V2 — Canonical Event Envelope Validator
//
// Validates incoming canonical event envelopes before they are persisted.
// Validation is always synchronous and deterministic — no DB calls here.
// The gateway calls this after normalization, before idempotency check.

import {
  InventoryEventEnvelope,
  InventoryEventType,
  SourceSystem,
} from './types.ts';

// ---------------------------------------------------------------------------
// VALIDATION ERROR
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ---------------------------------------------------------------------------
// VALID ENUMS (must match postgres enums in migration 32)
// ---------------------------------------------------------------------------

const VALID_EVENT_TYPES: InventoryEventType[] = [
  'SAP_CHECKPOINT',
  'SALE', 'SALE_REVERSAL', 'RETURN',
  'GOODS_RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT',
  'DAMAGE', 'EXPIRY',
  'PHYSICAL_COUNT', 'COUNT_ADJUSTMENT',
  'RESERVATION', 'RESERVATION_RELEASE',
  'MANUAL_ADJUSTMENT',
];

const VALID_SOURCE_SYSTEMS: SourceSystem[] = [
  'POS', 'SAP', 'PWA', 'WMS', 'MOCK', 'SYSTEM',
];

const VALID_SCHEMA_VERSIONS = ['1.0'];

// ---------------------------------------------------------------------------
// EVENTS THAT REQUIRE quantity_delta
// ---------------------------------------------------------------------------

const REQUIRES_QTY_DELTA: InventoryEventType[] = [
  'SALE', 'SALE_REVERSAL', 'RETURN',
  'GOODS_RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT',
  'DAMAGE', 'EXPIRY',
  'COUNT_ADJUSTMENT', 'MANUAL_ADJUSTMENT',
  'RESERVATION', 'RESERVATION_RELEASE',
];

// ---------------------------------------------------------------------------
// EVENTS WHERE quantity_delta means absolute quantity (SET semantics)
// ---------------------------------------------------------------------------

const ABSOLUTE_QTY_EVENTS: InventoryEventType[] = [
  'SAP_CHECKPOINT',
  'PHYSICAL_COUNT',
];

// ---------------------------------------------------------------------------
// MAIN VALIDATOR
// ---------------------------------------------------------------------------

export function validateCanonicalEvent(
  envelope: unknown
): ValidationResult {
  const errors: ValidationError[] = [];

  // Must be an object
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { valid: false, errors: [{ field: 'root', message: 'Event envelope must be a non-null object' }] };
  }

  const e = envelope as Record<string, unknown>;

  // ---- Required string fields ----
  const requiredStrings: Array<keyof InventoryEventEnvelope> = [
    'idempotency_key',
    'event_type',
    'tenant_id',
    'location_id',
    'source_system',
    'source_event_id',
    'business_timestamp',
    'schema_version',
  ];

  for (const field of requiredStrings) {
    if (!e[field] || typeof e[field] !== 'string' || (e[field] as string).trim() === '') {
      errors.push({
        field,
        message: `${field} is required and must be a non-empty string`,
        value: e[field],
      });
    }
  }

  // Early return if critical fields are missing — remaining checks would be noisy
  if (errors.length > 0) return { valid: false, errors };

  // ---- event_type enum check ----
  if (!VALID_EVENT_TYPES.includes(e['event_type'] as InventoryEventType)) {
    errors.push({
      field: 'event_type',
      message: `Invalid event_type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
      value: e['event_type'],
    });
  }

  // ---- source_system enum check ----
  if (!VALID_SOURCE_SYSTEMS.includes(e['source_system'] as SourceSystem)) {
    errors.push({
      field: 'source_system',
      message: `Invalid source_system. Must be one of: ${VALID_SOURCE_SYSTEMS.join(', ')}`,
      value: e['source_system'],
    });
  }

  // ---- schema_version check ----
  if (!VALID_SCHEMA_VERSIONS.includes(e['schema_version'] as string)) {
    errors.push({
      field: 'schema_version',
      message: `Unsupported schema_version '${e['schema_version']}'. Supported: ${VALID_SCHEMA_VERSIONS.join(', ')}`,
      value: e['schema_version'],
    });
  }

export type TimestampQuality =
  | 'NORMAL'
  | 'SUSPICIOUS_FUTURE'
  | 'SUSPICIOUS_PAST'
  | 'EXTREME_FUTURE'
  | 'EXTREME_PAST';

export interface TimestampClassification {
  quality: TimestampQuality;
  offsetMs: number;
  quarantine: boolean;
  reason?: string;
}

export function classifyTimestamp(
  businessTs: string,
  receivedAt: Date = new Date()
): TimestampClassification {
  const bizTime = new Date(businessTs).getTime();
  if (isNaN(bizTime)) {
    return { quality: 'NORMAL', offsetMs: 0, quarantine: false, reason: 'Invalid date' };
  }

  const recvTime = receivedAt.getTime();
  const offsetMs = bizTime - recvTime; // positive = future, negative = past
  const fiveMin = 5 * 60 * 1000;
  const sevenDays = 7 * 24 * 3600 * 1000;
  const twentyFourHours = 24 * 3600 * 1000;
  const thirtyDays = 30 * 24 * 3600 * 1000;

  if (Math.abs(offsetMs) <= fiveMin) {
    return { quality: 'NORMAL', offsetMs, quarantine: false };
  }
  if (offsetMs > twentyFourHours) {
    return {
      quality: 'EXTREME_FUTURE',
      offsetMs,
      quarantine: true,
      reason: `Business timestamp is ${Math.round(offsetMs / (3600 * 1000))} hours in future`,
    };
  }
  if (offsetMs > fiveMin) {
    return { quality: 'SUSPICIOUS_FUTURE', offsetMs, quarantine: false };
  }
  if (offsetMs < -thirtyDays) {
    return {
      quality: 'EXTREME_PAST',
      offsetMs,
      quarantine: true,
      reason: `Business timestamp is > 30 days in past (${Math.round(-offsetMs / (86400 * 1000))} days)`,
    };
  }
  return { quality: 'SUSPICIOUS_PAST', offsetMs, quarantine: false };
}

  // ---- business_timestamp must be valid ISO 8601 ----
  if (typeof e['business_timestamp'] === 'string') {
    const parsed = new Date(e['business_timestamp'] as string);
    if (isNaN(parsed.getTime())) {
      errors.push({
        field: 'business_timestamp',
        message: 'business_timestamp must be a valid ISO 8601 datetime string',
        value: e['business_timestamp'],
      });
    }
  }

  // ---- tenant_id must look like UUID ----
  if (!isValidUUIDv4(e['tenant_id'] as string)) {
    errors.push({
      field: 'tenant_id',
      message: 'tenant_id must be a valid UUID v4',
      value: e['tenant_id'],
    });
  }

  // ---- location_id must look like UUID ----
  if (!isValidUUIDv4(e['location_id'] as string)) {
    errors.push({
      field: 'location_id',
      message: 'location_id must be a valid UUID v4',
      value: e['location_id'],
    });
  }

  // ---- material_id must be UUID if provided ----
  if (e['material_id'] != null && !isValidUUIDv4(e['material_id'] as string)) {
    errors.push({
      field: 'material_id',
      message: 'material_id must be a valid UUID v4 when provided',
      value: e['material_id'],
    });
  }

  // ---- quantity_delta rules ----
  const eventType = e['event_type'] as InventoryEventType;

  if (REQUIRES_QTY_DELTA.includes(eventType)) {
    if (e['quantity_delta'] == null) {
      errors.push({
        field: 'quantity_delta',
        message: `quantity_delta is required for event_type '${eventType}'`,
      });
    } else if (typeof e['quantity_delta'] !== 'number' || isNaN(e['quantity_delta'] as number)) {
      errors.push({
        field: 'quantity_delta',
        message: 'quantity_delta must be a valid number',
        value: e['quantity_delta'],
      });
    } else if ((e['quantity_delta'] as number) === 0) {
      errors.push({
        field: 'quantity_delta',
        message: 'quantity_delta cannot be zero — zero-quantity events have no inventory effect',
        value: e['quantity_delta'],
      });
    }
  }

  if (ABSOLUTE_QTY_EVENTS.includes(eventType)) {
    if (e['quantity_delta'] == null) {
      errors.push({
        field: 'quantity_delta',
        message: `quantity_delta is required for ${eventType} (represents absolute quantity at checkpoint)`,
      });
    } else if (typeof e['quantity_delta'] !== 'number' || (e['quantity_delta'] as number) < 0) {
      errors.push({
        field: 'quantity_delta',
        message: `quantity_delta for ${eventType} must be a non-negative number (absolute quantity)`,
        value: e['quantity_delta'],
      });
    }
  }

  // ---- raw_payload must be an object ----
  if (!e['raw_payload'] || typeof e['raw_payload'] !== 'object' || Array.isArray(e['raw_payload'])) {
    errors.push({
      field: 'raw_payload',
      message: 'raw_payload must be a non-null object (use {} if no raw payload available)',
    });
  }

  // ---- metadata must be an object ----
  if (!e['metadata'] || typeof e['metadata'] !== 'object' || Array.isArray(e['metadata'])) {
    errors.push({
      field: 'metadata',
      message: 'metadata must be a non-null object (use {} if no metadata)',
    });
  }

  // ---- idempotency_key length guard ----
  if (typeof e['idempotency_key'] === 'string' && (e['idempotency_key'] as string).length > 200) {
    errors.push({
      field: 'idempotency_key',
      message: 'idempotency_key must be 200 characters or fewer',
      value: (e['idempotency_key'] as string).length,
    });
  }

  // ---- source_event_id length guard ----
  if (typeof e['source_event_id'] === 'string' && (e['source_event_id'] as string).length > 150) {
    errors.push({
      field: 'source_event_id',
      message: 'source_event_id must be 150 characters or fewer',
      value: (e['source_event_id'] as string).length,
    });
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// UUID v4 FORMAT GUARD
// ---------------------------------------------------------------------------

function isValidUUIDv4(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(value.trim());
}

// ---------------------------------------------------------------------------
// HELPER: Build idempotency key from components
// ---------------------------------------------------------------------------

export function buildIdempotencyKey(
  sourceSystem: SourceSystem,
  sourceEventId: string,
  tenantId: string
): string {
  return `${sourceSystem}__${tenantId}__${sourceEventId}`;
}

// ---------------------------------------------------------------------------
// HELPER: Normalize business timestamp to UTC ISO string
// ---------------------------------------------------------------------------

export function normalizeTimestamp(raw: string | Date): string {
  if (raw instanceof Date) {
    return raw.toISOString();
  }
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Cannot normalize timestamp: '${raw}' is not a valid date`);
  }
  return parsed.toISOString();
}
