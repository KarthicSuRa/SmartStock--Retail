// /supabase/functions/_shared/pos-adapter/factory.ts

import { IPOSAdapter, POSConfig } from "./types.ts";
import { WebhookPOSAdapter } from "./webhook-adapter.ts";

export class POSAdapterFactory {
  static createAdapter(config: POSConfig): IPOSAdapter {
    switch (config.pos_type) {
      case 'webhook_cloud':
      case 'shopify':
      case 'square':
      default:
        return new WebhookPOSAdapter(config);
    }
  }
}
