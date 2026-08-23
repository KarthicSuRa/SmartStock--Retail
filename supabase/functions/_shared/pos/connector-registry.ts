// /supabase/functions/_shared/pos/connector-registry.ts
// SmartStock LiveRetail V2 — Universal POS Connector Registry & Factory

import { IPOSConnector } from './connector-interface.ts';
import { POSCapabilities, STANDARD_POS_CAPABILITIES } from './capabilities.ts';
import { GenericWebhookTransport } from './connectors/generic/webhook-transport.ts';
import { GenericPOSMapper } from './connectors/generic/generic-mapper.ts';

import { ShopifyPOSConnector } from './connectors/shopify/shopify-connector.ts';
import { SquarePOSConnector } from './connectors/square/square-connector.ts';
import { LightspeedPOSConnector } from './connectors/lightspeed/lightspeed-connector.ts';

export class GenericPOSConnector implements IPOSConnector {
  getCapabilities(): POSCapabilities {
    return STANDARD_POS_CAPABILITIES.generic_webhook;
  }
  getWebhookHandler() {
    return new GenericWebhookTransport();
  }
  getMapper() {
    return new GenericPOSMapper();
  }
}

export class POSConnectorRegistry {
  private static registry = new Map<string, IPOSConnector>();

  static initialize() {
    if (this.registry.size === 0) {
      this.registry.set('generic_webhook', new GenericPOSConnector());
      this.registry.set('webhook_cloud', new GenericPOSConnector());
      this.registry.set('manual_entry', new GenericPOSConnector());
      this.registry.set('shopify', new ShopifyPOSConnector());
      this.registry.set('square', new SquarePOSConnector());
      this.registry.set('lightspeed', new LightspeedPOSConnector());
    }
  }

  static register(connectorId: string, connector: IPOSConnector) {
    this.registry.set(connectorId, connector);
  }

  static getConnector(posType: string): IPOSConnector {
    this.initialize();
    return this.registry.get(posType) || this.registry.get('generic_webhook')!;
  }
}
