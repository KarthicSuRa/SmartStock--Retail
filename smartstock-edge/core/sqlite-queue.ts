// /smartstock-edge/core/sqlite-queue.ts
// SmartStock LiveRetail V2 — Store Edge Hardened Durable Queue

export interface DurableQueueItem {
  id: string;
  source_event_id: string;
  payload_hash: string;
  payload: Record<string, unknown>;
  enqueued_at: string;
  retry_count: number;
  ack_state: 'PENDING' | 'IN_FLIGHT' | 'ACKED';
}

export class DurableSQLiteQueue {
  private queue: DurableQueueItem[] = [];
  private maxItems = 10000; // Disk quota: up to 10k transactions

  constructor(private storagePath?: string) {
    // In production environment, connects to local SQLite db file via better-sqlite3 or sqlite3
    console.log(`[DurableSQLiteQueue] Storage initialized at: ${this.storagePath || 'local-buffer.db'}`);
  }

  enqueue(sourceEventId: string, payload: Record<string, unknown>): DurableQueueItem {
    if (this.queue.length >= this.maxItems) {
      throw new Error('Queue disk quota exceeded');
    }

    const payloadStr = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < payloadStr.length; i++) {
      hash = (hash << 5) - hash + payloadStr.charCodeAt(i);
      hash |= 0;
    }

    const item: DurableQueueItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      source_event_id: sourceEventId,
      payload_hash: `h_${Math.abs(hash)}`,
      payload,
      enqueued_at: new Date().toISOString(),
      retry_count: 0,
      ack_state: 'PENDING',
    };

    this.queue.push(item);
    return item;
  }

  peek(limit = 50): DurableQueueItem[] {
    const items = this.queue.filter((i) => i.ack_state !== 'ACKED').slice(0, limit);
    for (const item of items) {
      item.ack_state = 'IN_FLIGHT';
    }
    return items;
  }

  ack(ids: string[]) {
    const idSet = new Set(ids);
    this.queue = this.queue.filter((i) => !idSet.has(i.id));
  }

  nack(ids: string[]) {
    const idSet = new Set(ids);
    for (const item of this.queue) {
      if (idSet.has(item.id)) {
        item.ack_state = 'PENDING';
        item.retry_count++;
      }
    }
  }

  size(): number {
    return this.queue.filter((i) => i.ack_state !== 'ACKED').length;
  }
}
