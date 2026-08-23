// /supabase/functions/_shared/pos/connector-interface.ts
// SmartStock LiveRetail V2 — Split POS Connector Interfaces

import { POSCapabilities } from './capabilities.ts';
import { CanonicalPOSTransaction } from './canonical-schema.ts';

export interface RawPOSEnvelope {
  source_system: string;
  source_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  received_at: string;
}

export interface IPOSWebhookHandler {
  verifySignature(rawBody: string, headers: Headers, secret?: string): Promise<boolean>;
  extractSourceId(payload: Record<string, unknown>, headers: Headers): string;
  parse(rawBody: string, headers: Headers): Promise<RawPOSEnvelope>;
}

export interface IPOSCanonicalMapper {
  toCanonicalTransaction(
    raw: RawPOSEnvelope,
    context: { tenant_id: string; store_id: string; pos_config_id: string }
  ): Promise<CanonicalPOSTransaction>;
}

export interface PollingCursor {
  last_fetched_at: string;
  last_page_token?: string;
  last_sequence?: number;
}

export interface IPOSPollingTransport {
  fetchUpdates(
    cursor: PollingCursor,
    context: { tenant_id: string; store_id: string; config: Record<string, unknown> }
  ): Promise<{ transactions: CanonicalPOSTransaction[]; nextCursor: PollingCursor }>;
}

export interface IPOSConnector {
  getCapabilities(): POSCapabilities;
  getWebhookHandler?(): IPOSWebhookHandler;
  getMapper(): IPOSCanonicalMapper;
  getPollingTransport?(): IPOSPollingTransport;
}
