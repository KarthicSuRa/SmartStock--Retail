// /supabase/functions/_shared/pos/connectors/square/square-connector.ts
// SmartStock LiveRetail V2 — Square POS Unified Connector

import { IPOSConnector } from '../../connector-interface.ts';
import { POSCapabilities, STANDARD_POS_CAPABILITIES } from '../../capabilities.ts';
import { SquareWebhookTransport } from './webhook-transport.ts';
import { SquarePOSMapper } from './square-mapper.ts';

export class SquarePOSConnector implements IPOSConnector {
  getCapabilities(): POSCapabilities {
    return STANDARD_POS_CAPABILITIES.square;
  }
  getWebhookHandler() {
    return new SquareWebhookTransport();
  }
  getMapper() {
    return new SquarePOSMapper();
  }
}
