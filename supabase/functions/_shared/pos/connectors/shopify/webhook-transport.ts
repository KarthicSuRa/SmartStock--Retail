// /supabase/functions/_shared/pos/connectors/shopify/webhook-transport.ts
// Shopify webhook transport.
//
// Compatibility shim only: the live path is `_shared/pos/provider-webhooks.ts`,
// which also checks the shop domain. This class exists because
// `IPOSConnector.getWebhookHandler()` is part of the SDK surface for
// third-party connectors. It fails closed.

import { IPOSWebhookHandler, RawPOSEnvelope } from '../../connector-interface.ts';
import { verifyShopifyWebhook } from '../../webhook-security.ts';

export class ShopifyWebhookTransport implements IPOSWebhookHandler {
  async verifySignature(rawBody: string, headers: Headers, secret?: string): Promise<boolean> {
    const result = await verifyShopifyWebhook(rawBody, headers, secret);
    return result.ok;
  }

  extractSourceId(payload: Record<string, unknown>, headers: Headers): string {
    const id = payload.id;
    if (id == null) {
      throw new Error('Shopify payload is missing id');
    }
    const prefix = headers.get('x-shopify-topic') === 'refunds/create' ? 'refund' : 'order';
    return `${prefix}-${id}`;
  }

  async parse(rawBody: string, headers: Headers): Promise<RawPOSEnvelope> {
    const topic = headers.get('x-shopify-topic');
    if (!topic) {
      throw new Error('Shopify delivery is missing X-Shopify-Topic');
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    return {
      source_system: 'SHOPIFY',
      source_event_id: this.extractSourceId(payload, headers),
      event_type: topic,
      payload,
      received_at: new Date().toISOString(),
    };
  }
}
