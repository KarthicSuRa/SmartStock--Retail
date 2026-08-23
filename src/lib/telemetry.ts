// /src/lib/telemetry.ts
// SmartStock Experience RC1 — Privacy-Preserving Frontend UX Telemetry Emitter

export type UXEventType =
  | 'action_opened'
  | 'action_approved'
  | 'action_rejected'
  | 'stale_action_blocked'
  | 'count_assigned'
  | 'count_completed'
  | 'search_used'
  | 'search_no_result'
  | 'recommendation_opened'
  | 'recommendation_approved'
  | 'scan_mismatch_detected'
  | 'impact_modal_opened'
  | 'impact_modal_confirmed';

export interface UXTelemetryEvent {
  eventType: UXEventType;
  tenantId?: string;
  storeId?: string;
  sku?: string;
  caseId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export class UXTelemetry {
  private static buffer: UXTelemetryEvent[] = [];

  static track(eventType: UXEventType, payload?: {
    tenantId?: string;
    storeId?: string;
    sku?: string;
    caseId?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }) {
    const evt: UXTelemetryEvent = {
      eventType,
      tenantId: payload?.tenantId || 'default-tenant',
      storeId: payload?.storeId || '1001',
      sku: payload?.sku,
      caseId: payload?.caseId,
      durationMs: payload?.durationMs,
      metadata: payload?.metadata,
      timestamp: new Date().toISOString(),
    };

    this.buffer.push(evt);
    if (typeof window !== 'undefined' && (window as any).__SMARTSTOCK_DEBUG__) {
      console.log(`[UXTelemetry] ${eventType}`, evt);
    }
  }

  static getRecentEvents(): UXTelemetryEvent[] {
    return [...this.buffer];
  }
}
