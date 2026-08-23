// /smartstock-edge/core/local-queue.ts
// SmartStock LiveRetail V2 — Store Edge Durable In-Memory / SQLite Queue

export interface QueuedTransaction {
  id: string;
  source_event_id: string;
  payload: Record<string, unknown>;
  enqueued_at: string;
  retry_count: number;
}

export class EdgeLocalQueue {
  private queue: QueuedTransaction[] = [];

  enqueue(sourceEventId: string, payload: Record<string, unknown>): QueuedTransaction {
    const item: QueuedTransaction = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      source_event_id: sourceEventId,
      payload,
      enqueued_at: new Date().toISOString(),
      retry_count: 0,
    };
    this.queue.push(item);
    return item;
  }

  peek(limit = 50): QueuedTransaction[] {
    return this.queue.slice(0, limit);
  }

  ack(ids: string[]) {
    const idSet = new Set(ids);
    this.queue = this.queue.filter((item) => !idSet.has(item.id));
  }

  size(): number {
    return this.queue.length;
  }
}
