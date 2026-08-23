// /supabase/functions/_shared/pos/connectors/shopify/shopify-connector.ts
// SmartStock LiveRetail V2 — Shopify POS Unified Connector

import { IPOSConnector } from '../../connector-interface.ts';
import { POSCapabilities, STANDARD_POS_CAPABILITIES } from '../../capabilities.ts';
import { ShopifyWebhookTransport } from './webhook-transport.ts';
import { ShopifyPOSMapper } from './shopify-mapper.ts';

export class ShopifyPOSConnector implements IPOSConnector {
  getCapabilities(): POSCapabilities {
    return STANDARD_POS_CAPABILITIES.shopify;
  }
  getWebhookHandler() {
    return new ShopifyWebhookTransport();
  }
  getMapper() {
    return new ShopifyPOSMapper();
  }
}
