// /smartstock-edge/core/uploader.ts
// SmartStock LiveRetail V2 — Store Edge Encrypted Batch Uploader

import { EdgeLocalQueue, QueuedTransaction } from './local-queue.ts';

export interface EdgeUploaderConfig {
  smartstockUrl: string;
  posConfigId: string;
  tenantApiKey: string;
  batchSize?: number;
}

export class EdgeBatchUploader {
  constructor(
    private queue: EdgeLocalQueue,
    private config: EdgeUploaderConfig
  ) {}

  async flushBatch(): Promise<{ sent: number; failed: number }> {
    const items = this.queue.peek(this.config.batchSize || 50);
    if (items.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const gatewayUrl = `${this.config.smartstockUrl}/functions/v1/pos-ingestion-gateway`;

    const successfulIds: string[] = [];

    for (const item of items) {
      try {
        const res = await fetch(gatewayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pos-config-id': this.config.posConfigId,
            'Authorization': `Bearer ${this.config.tenantApiKey}`,
          },
          body: JSON.stringify(item.payload),
        });

        if (res.ok) {
          successfulIds.push(item.id);
        } else {
          item.retry_count++;
        }
      } catch {
        item.retry_count++;
      }
    }

    if (successfulIds.length > 0) {
      this.queue.ack(successfulIds);
    }

    return {
      sent: successfulIds.length,
      failed: items.length - successfulIds.length,
    };
  }
}
