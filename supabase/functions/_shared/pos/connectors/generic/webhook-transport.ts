// /supabase/functions/_shared/pos/connectors/generic/webhook-transport.ts
// Generic cloud webhook transport.
//
// The shared secret is mandatory: an unsigned generic webhook is
// indistinguishable from an anonymous inventory write.
//
// Compatibility shim only; the live path is `_shared/pos/provider-webhooks.ts`.

import { IPOSWebhookHandler, RawPOSEnvelope } from '../../connector-interface.ts';
import { verifyGenericWebhook } from '../../webhook-security.ts';

export class GenericWebhookTransport implements IPOSWebhookHandler {
  async verifySignature(rawBody: string, headers: Headers, secret?: string): Promise<boolean> {
    const result = await verifyGenericWebhook(rawBody, headers, secret);
    return result.ok;
  }

  extractSourceId(payload: Record<string, unknown>, _headers?: Headers): string {
    const id =
      payload.event_id ??
      payload.transaction_id ??
      payload.id ??
      payload.receipt_number ??
      payload.order_id;

    if (id == null) {
      throw new Error('Generic webhook payload has no event_id, transaction_id or id');
    }
    return String(id);
  }

  async parse(rawBody: string, _headers: Headers): Promise<RawPOSEnvelope> {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    return {
      source_system: 'POS',
      source_event_id: this.extractSourceId(payload),
      event_type: (payload.event_type as string) || (payload.type as string) || 'SALE',
      payload,
      received_at: new Date().toISOString(),
    };
  }
}
