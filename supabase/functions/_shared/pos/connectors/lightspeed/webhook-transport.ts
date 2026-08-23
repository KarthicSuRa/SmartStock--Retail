// /supabase/functions/_shared/pos/connectors/lightspeed/webhook-transport.ts
// SmartStock LiveRetail V2 — Lightspeed Retail (X-Series) Webhook Transport

import { IPOSWebhookHandler, RawPOSEnvelope } from '../../connector-interface.ts';

export class LightspeedWebhookTransport implements IPOSWebhookHandler {
  async verifySignature(_rawBody: string, _headers: Headers, _secret?: string): Promise<boolean> {
    return true; // Pass through
  }

  extractSourceId(payload: Record<string, unknown>, _headers: Headers): string {
    return String(payload.id || payload.sale_id || payload.register_sale_id || `LGT-${Date.now()}`);
  }

  async parse(rawBody: string, headers: Headers): Promise<RawPOSEnvelope> {
    const json = JSON.parse(rawBody);
    const eventType = headers.get('x-event-type') || (json.type as string) || 'sale.update';

    return {
      source_system: 'LIGHTSPEED',
      source_event_id: this.extractSourceId(json, headers),
      event_type: eventType,
      payload: json,
      received_at: new Date().toISOString(),
    };
  }
}
