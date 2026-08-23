// /supabase/functions/_shared/pos/connectors/generic/polling-transport.ts
// SmartStock LiveRetail V2 — Generic REST Polling Transport

import { IPOSPollingTransport, PollingCursor } from '../../connector-interface.ts';
import { CanonicalPOSTransaction } from '../../canonical-schema.ts';

export class GenericPollingTransport implements IPOSPollingTransport {
  async fetchUpdates(
    cursor: PollingCursor,
    context: { tenant_id: string; store_id: string; config: Record<string, unknown> }
  ): Promise<{ transactions: CanonicalPOSTransaction[]; nextCursor: PollingCursor }> {
    const endpoint = context.config.polling_endpoint as string;
    const apiKey = context.config.api_key as string;

    if (!endpoint) {
      return { transactions: [], nextCursor: cursor };
    }

    const url = new URL(endpoint);
    url.searchParams.set('updated_since', cursor.last_fetched_at);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey || ''}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Polling failed with status ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const rawTxns = Array.isArray(data) ? data : data.transactions || data.orders || [];

    // Map each item to CanonicalPOSTransaction
    const transactions: CanonicalPOSTransaction[] = rawTxns.map((item: any) => ({
      schema_version: '1.0',
      transaction_id: `POLL-${context.tenant_id}-${item.id || item.transaction_id}`,
      source_transaction_id: String(item.id || item.transaction_id),
      source_system: 'GENERIC_POLL',
      tenant_id: context.tenant_id,
      store_id: context.store_id,
      transaction_type: item.type === 'RETURN' ? 'RETURN' : 'SALE',
      status: item.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
      business_timestamp: item.timestamp || item.created_at || new Date().toISOString(),
      received_timestamp: new Date().toISOString(),
      currency: item.currency || 'EUR',
      lines: (item.items || []).map((l: any, idx: number) => ({
        line_id: String(l.id || idx),
        sku: l.sku,
        source_sku: l.sku,
        quantity: Math.abs(Number(l.quantity || 1)),
        source_quantity: Math.abs(Number(l.quantity || 1)),
        source_uom: l.uom || 'EA',
        base_quantity: Math.abs(Number(l.quantity || 1)),
        base_uom: l.uom || 'EA',
        uom_conversion_factor: 1.0,
        line_type: (l.is_return || l.quantity < 0) ? 'RETURN' : 'MERCHANDISE',
      })),
      metadata: {},
    }));

    const nextCursor: PollingCursor = {
      last_fetched_at: new Date().toISOString(),
      last_sequence: cursor.last_sequence ? cursor.last_sequence + transactions.length : undefined,
    };

    return { transactions, nextCursor };
  }
}
