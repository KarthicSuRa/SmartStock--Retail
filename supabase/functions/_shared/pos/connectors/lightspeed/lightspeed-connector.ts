// /supabase/functions/_shared/pos/connectors/lightspeed/lightspeed-connector.ts
// SmartStock LiveRetail V2 — Lightspeed Retail Unified Connector

import { IPOSConnector } from '../../connector-interface.ts';
import { POSCapabilities, STANDARD_POS_CAPABILITIES } from '../../capabilities.ts';
import { LightspeedWebhookTransport } from './webhook-transport.ts';
import { LightspeedPOSMapper } from './lightspeed-mapper.ts';

export class LightspeedPOSConnector implements IPOSConnector {
  getCapabilities(): POSCapabilities {
    return STANDARD_POS_CAPABILITIES.lightspeed;
  }
  getWebhookHandler() {
    return new LightspeedWebhookTransport();
  }
  getMapper() {
    return new LightspeedPOSMapper();
  }
}
