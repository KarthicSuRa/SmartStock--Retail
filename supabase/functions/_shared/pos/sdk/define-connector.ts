// /supabase/functions/_shared/pos/sdk/define-connector.ts
// SmartStock LiveRetail V2 — Internal POS Connector SDK

import { IPOSConnector, IPOSWebhookHandler, IPOSCanonicalMapper, IPOSPollingTransport, RawPOSEnvelope, PollingCursor } from '../connector-interface.ts';
import { POSCapabilities } from '../capabilities.ts';
import { CanonicalPOSTransaction } from '../canonical-schema.ts';

export interface ConnectorDefinition {
  id: string;
  displayName: string;
  capabilities: Partial<POSCapabilities>;
  verifyWebhookSignature?: (rawBody: string, headers: Headers, secret?: string) => Promise<boolean>;
  extractSourceId?: (payload: Record<string, unknown>, headers: Headers) => string;
  parseWebhook?: (rawBody: string, headers: Headers) => Promise<RawPOSEnvelope>;
  mapTransaction: (
    raw: RawPOSEnvelope,
    context: { tenant_id: string; store_id: string; pos_config_id: string }
  ) => Promise<CanonicalPOSTransaction>;
  pollUpdates?: (
    cursor: PollingCursor,
    context: { tenant_id: string; store_id: string; config: Record<string, unknown> }
  ) => Promise<{ transactions: CanonicalPOSTransaction[]; nextCursor: PollingCursor }>;
}

export function defineConnector(def: ConnectorDefinition): IPOSConnector {
  const fullCapabilities: POSCapabilities = {
    connector_id: def.id,
    display_name: def.displayName,
    transport: def.capabilities.transport || 'WEBHOOK',
    quality_level: def.capabilities.quality_level || 'B',
    realtime_webhooks: def.capabilities.realtime_webhooks ?? true,
    transaction_polling: def.capabilities.transaction_polling ?? Boolean(def.pollUpdates),
    historical_sales_read: def.capabilities.historical_sales_read ?? false,
    returns_supported: def.capabilities.returns_supported ?? true,
    voids_supported: def.capabilities.voids_supported ?? true,
    exchanges_supported: def.capabilities.exchanges_supported ?? false,
    inventory_updates: def.capabilities.inventory_updates ?? false,
    sequence_numbers: def.capabilities.sequence_numbers ?? false,
    event_ids: def.capabilities.event_ids ?? true,
    transaction_versioning: def.capabilities.transaction_versioning ?? false,
    store_locations: def.capabilities.store_locations ?? true,
    terminal_ids: def.capabilities.terminal_ids ?? true,
    offline_transactions: def.capabilities.offline_transactions ?? false,
    reconciliation_api: def.capabilities.reconciliation_api ?? Boolean(def.pollUpdates),
    webhook_ordering_guaranteed: def.capabilities.webhook_ordering_guaranteed ?? false,
    supports_partial_returns: def.capabilities.supports_partial_returns ?? true,
  };

  const mapper: IPOSCanonicalMapper = {
    toCanonicalTransaction: def.mapTransaction,
  };

  const webhookHandler: IPOSWebhookHandler | undefined = def.parseWebhook
    ? {
        verifySignature: def.verifyWebhookSignature || (() => Promise.resolve(true)),
        extractSourceId: def.extractSourceId || ((p) => String(p.id || Date.now())),
        parse: def.parseWebhook,
      }
    : undefined;

  const pollingTransport: IPOSPollingTransport | undefined = def.pollUpdates
    ? {
        fetchUpdates: def.pollUpdates,
      }
    : undefined;

  return {
    getCapabilities: () => fullCapabilities,
    getWebhookHandler: webhookHandler ? () => webhookHandler : undefined,
    getMapper: () => mapper,
    getPollingTransport: pollingTransport ? () => pollingTransport : undefined,
  };
}
