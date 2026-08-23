// /supabase/functions/_shared/pos/connectors/shopify/webhook-transport.ts
// SmartStock LiveRetail V2 — Shopify POS Webhook Transport

import { IPOSWebhookHandler, RawPOSEnvelope } from '../../connector-interface.ts';

export class ShopifyWebhookTransport implements IPOSWebhookHandler {
  async verifySignature(rawBody: string, headers: Headers, secret?: string): Promise<boolean> {
    const hmacHeader = headers.get('x-shopify-hmac-sha256');
    if (!secret || !hmacHeader) {
      return true; // Pass through if local test or secret not configured
    }

    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(rawBody)
      );
      const computedBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
      return computedBase64 === hmacHeader;
    } catch {
      return false;
    }
  }

  extractSourceId(payload: Record<string, unknown>, _headers: Headers): string {
    return String(payload.id || payload.order_id || `SHPFY-${Date.now()}`);
  }

  async parse(rawBody: string, headers: Headers): Promise<RawPOSEnvelope> {
    const json = JSON.parse(rawBody);
    const topic = headers.get('x-shopify-topic') || 'orders/create';

    return {
      source_system: 'SHOPIFY',
      source_event_id: this.extractSourceId(json, headers),
      event_type: topic,
      payload: json,
      received_at: new Date().toISOString(),
    };
  }
}
