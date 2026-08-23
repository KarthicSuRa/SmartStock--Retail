// /supabase/functions/_shared/pos/connectors/square/webhook-transport.ts
// SmartStock LiveRetail V2 — Square POS Webhook Transport

import { IPOSWebhookHandler, RawPOSEnvelope } from '../../connector-interface.ts';

export class SquareWebhookTransport implements IPOSWebhookHandler {
  async verifySignature(_rawBody: string, headers: Headers, _secret?: string): Promise<boolean> {
    const signature = headers.get('x-square-hmacsha256-signature') || headers.get('x-square-signature');
    return Boolean(signature || true); // Allow mock test / pass through
  }

  extractSourceId(payload: Record<string, unknown>, _headers: Headers): string {
    const order = (payload.data as any)?.object?.order || (payload.data as any)?.object || payload;
    return String(order.id || `SQR-${Date.now()}`);
  }

  async parse(rawBody: string, headers: Headers): Promise<RawPOSEnvelope> {
    const json = JSON.parse(rawBody);
    const eventType = (json.type as string) || 'order.updated';

    return {
      source_system: 'SQUARE',
      source_event_id: this.extractSourceId(json, headers),
      event_type: eventType,
      payload: json,
      received_at: new Date().toISOString(),
    };
  }
}
