// /supabase/functions/_shared/pos/connectors/square/webhook-transport.ts
// Square webhook transport.
//
// Square signs `notificationUrl + rawBody`, so verification is impossible
// without the exact notification URL configured on the subscription. Pass it to
// the constructor; without it verification fails closed.
//
// Compatibility shim only: the live path is `_shared/pos/provider-webhooks.ts`,
// which also performs the RetrieveOrder call that Square's metadata-only
// notifications require.

import { IPOSWebhookHandler, RawPOSEnvelope } from '../../connector-interface.ts';
import { verifySquareWebhook } from '../../webhook-security.ts';

export class SquareWebhookTransport implements IPOSWebhookHandler {
  constructor(private readonly notificationUrl?: string) {}

  async verifySignature(rawBody: string, headers: Headers, secret?: string): Promise<boolean> {
    const result = await verifySquareWebhook(
      rawBody,
      headers,
      secret,
      this.notificationUrl,
    );
    return result.ok;
  }

  extractSourceId(payload: Record<string, unknown>, _headers?: Headers): string {
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const object = (data.object ?? {}) as Record<string, unknown>;
    const created = object.order_created as Record<string, unknown> | undefined;
    const updated = object.order_updated as Record<string, unknown> | undefined;
    const orderId = created?.order_id ?? updated?.order_id ?? data.id;

    if (orderId == null) {
      throw new Error('Square notification contains no order id');
    }
    return String(orderId);
  }

  async parse(rawBody: string, _headers: Headers): Promise<RawPOSEnvelope> {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    return {
      source_system: 'SQUARE',
      source_event_id: this.extractSourceId(payload),
      event_type: (payload.type as string) || 'order.updated',
      payload,
      received_at: new Date().toISOString(),
    };
  }
}
