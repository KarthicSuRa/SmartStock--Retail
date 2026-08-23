// /supabase/functions/_shared/pos/connectors/generic/webhook-transport.ts
// SmartStock LiveRetail V2 — Generic Webhook Transport Handler

import { IPOSWebhookHandler, RawPOSEnvelope } from '../../connector-interface.ts';

export class GenericWebhookTransport implements IPOSWebhookHandler {
  async verifySignature(_rawBody: string, _headers: Headers, _secret?: string): Promise<boolean> {
    // Generic webhooks accept payload if authenticated via standard API token / secret header
    return true;
  }

  extractSourceId(payload: Record<string, unknown>, _headers: Headers): string {
    return (
      (payload.transaction_id as string) ||
      (payload.id as string) ||
      (payload.receipt_number as string) ||
      (payload.order_id as string) ||
      `GEN-${Date.now()}`
    );
  }

  async parse(rawBody: string, _headers: Headers): Promise<RawPOSEnvelope> {
    const json = JSON.parse(rawBody);
    return {
      source_system: 'GENERIC',
      source_event_id: this.extractSourceId(json, _headers),
      event_type: (json.event_type as string) || (json.type as string) || 'SALE',
      payload: json,
      received_at: new Date().toISOString(),
    };
  }
}
