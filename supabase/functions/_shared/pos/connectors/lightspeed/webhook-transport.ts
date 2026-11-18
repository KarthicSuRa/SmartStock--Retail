// /supabase/functions/_shared/pos/connectors/lightspeed/webhook-transport.ts
// Lightspeed Retail (X-Series) webhook transport.
//
// Lightspeed posts `application/x-www-form-urlencoded` with a `payload` field
// that contains the JSON document. Parsing the raw body as JSON (the previous
// behaviour) threw on every real delivery.
//
// Compatibility shim only; the live path is `_shared/pos/provider-webhooks.ts`.

import { IPOSWebhookHandler, RawPOSEnvelope } from '../../connector-interface.ts';
import { verifyLightspeedWebhook } from '../../webhook-security.ts';

export class LightspeedWebhookTransport implements IPOSWebhookHandler {
  async verifySignature(rawBody: string, headers: Headers, secret?: string): Promise<boolean> {
    const result = await verifyLightspeedWebhook(rawBody, headers, secret);
    return result.ok;
  }

  extractSourceId(payload: Record<string, unknown>, _headers?: Headers): string {
    const id = payload.id ?? payload.sale_id;
    if (id == null) {
      throw new Error('Lightspeed sale payload is missing id');
    }
    return String(id);
  }

  async parse(rawBody: string, headers: Headers): Promise<RawPOSEnvelope> {
    const form = new URLSearchParams(rawBody);
    const encoded = form.get('payload');

    const payload = encoded
      ? JSON.parse(encoded) as Record<string, unknown>
      : JSON.parse(rawBody) as Record<string, unknown>;

    return {
      source_system: 'LIGHTSPEED',
      source_event_id: this.extractSourceId(payload),
      event_type: headers.get('x-event-type') || 'sale.update',
      payload,
      received_at: new Date().toISOString(),
    };
  }
}
