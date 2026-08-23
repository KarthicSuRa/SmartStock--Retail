// /supabase/functions/_shared/pos/capabilities.ts
// SmartStock LiveRetail V2 — POS Connector Capabilities & Quality Model

export type POSQualityLevel = 'A' | 'B' | 'C' | 'D';
export type POSTransportType = 'WEBHOOK' | 'POLLING' | 'FILE' | 'EDGE_AGENT' | 'DATABASE_CDC' | 'EVENT_BUS';

export interface POSCapabilities {
  connector_id: string;
  display_name: string;
  transport: POSTransportType;
  quality_level: POSQualityLevel;
  realtime_webhooks: boolean;
  transaction_polling: boolean;
  historical_sales_read: boolean;
  returns_supported: boolean;
  voids_supported: boolean;
  exchanges_supported: boolean;
  inventory_updates: boolean;
  sequence_numbers: boolean;
  event_ids: boolean;
  transaction_versioning: boolean;
  store_locations: boolean;
  terminal_ids: boolean;
  offline_transactions: boolean;
  reconciliation_api: boolean;
  max_history_days?: number;
  webhook_ordering_guaranteed: boolean;
  supports_partial_returns: boolean;
}

export const STANDARD_POS_CAPABILITIES: Record<string, POSCapabilities> = {
  shopify: {
    connector_id: 'shopify',
    display_name: 'Shopify POS & E-Commerce',
    transport: 'WEBHOOK',
    quality_level: 'A',
    realtime_webhooks: true,
    transaction_polling: true,
    historical_sales_read: true,
    returns_supported: true,
    voids_supported: true,
    exchanges_supported: false,
    inventory_updates: true,
    sequence_numbers: false,
    event_ids: true,
    transaction_versioning: true,
    store_locations: true,
    terminal_ids: false,
    offline_transactions: false,
    reconciliation_api: true,
    max_history_days: 60,
    webhook_ordering_guaranteed: false, // Explicitly warned by Shopify
    supports_partial_returns: true,
  },

  square: {
    connector_id: 'square',
    display_name: 'Square POS',
    transport: 'WEBHOOK',
    quality_level: 'A',
    realtime_webhooks: true,
    transaction_polling: true,
    historical_sales_read: true,
    returns_supported: true,
    voids_supported: true,
    exchanges_supported: true,
    inventory_updates: true,
    sequence_numbers: false,
    event_ids: true,
    transaction_versioning: true,
    store_locations: true,
    terminal_ids: true,
    offline_transactions: true,
    reconciliation_api: true,
    max_history_days: 90,
    webhook_ordering_guaranteed: false,
    supports_partial_returns: true,
  },

  lightspeed: {
    connector_id: 'lightspeed',
    display_name: 'Lightspeed Retail (X-Series)',
    transport: 'WEBHOOK',
    quality_level: 'A',
    realtime_webhooks: true,
    transaction_polling: true,
    historical_sales_read: true,
    returns_supported: true,
    voids_supported: true,
    exchanges_supported: false,
    inventory_updates: true,
    sequence_numbers: true,
    event_ids: true,
    transaction_versioning: true,
    store_locations: true,
    terminal_ids: true,
    offline_transactions: true,
    reconciliation_api: true,
    webhook_ordering_guaranteed: false,
    supports_partial_returns: true,
  },

  generic_webhook: {
    connector_id: 'generic_webhook',
    display_name: 'Generic Cloud Webhook',
    transport: 'WEBHOOK',
    quality_level: 'B',
    realtime_webhooks: true,
    transaction_polling: false,
    historical_sales_read: false,
    returns_supported: true,
    voids_supported: true,
    exchanges_supported: false,
    inventory_updates: false,
    sequence_numbers: false,
    event_ids: true,
    transaction_versioning: false,
    store_locations: true,
    terminal_ids: true,
    offline_transactions: false,
    reconciliation_api: false,
    webhook_ordering_guaranteed: false,
    supports_partial_returns: false,
  },

  generic_file_sftp: {
    connector_id: 'generic_file_sftp',
    display_name: 'Enterprise File / SFTP Import',
    transport: 'FILE',
    quality_level: 'D',
    realtime_webhooks: false,
    transaction_polling: true,
    historical_sales_read: true,
    returns_supported: true,
    voids_supported: true,
    exchanges_supported: false,
    inventory_updates: false,
    sequence_numbers: true,
    event_ids: true,
    transaction_versioning: false,
    store_locations: true,
    terminal_ids: true,
    offline_transactions: true,
    reconciliation_api: false,
    webhook_ordering_guaranteed: true,
    supports_partial_returns: true,
  },
};
