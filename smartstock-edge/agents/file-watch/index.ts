// /smartstock-edge/agents/file-watch/index.ts
// SmartStock LiveRetail V2 — Store Edge File Watch Agent

import { EdgeLocalQueue } from '../../core/local-queue.ts';
import { EdgeBatchUploader } from '../../core/uploader.ts';

export class EdgeFileWatchAgent {
  private queue = new EdgeLocalQueue();
  private uploader: EdgeBatchUploader;
  private isRunning = false;

  constructor(
    private config: {
      watchDirectory: string;
      smartstockUrl: string;
      posConfigId: string;
      tenantApiKey: string;
      pollIntervalMs?: number;
    }
  ) {
    this.uploader = new EdgeBatchUploader(this.queue, {
      smartstockUrl: config.smartstockUrl,
      posConfigId: config.posConfigId,
      tenantApiKey: config.tenantApiKey,
    });
  }

  enqueueTransaction(rawTransaction: Record<string, unknown>, sourceId?: string) {
    const id = sourceId || `EDGE-FILE-${Date.now()}`;
    this.queue.enqueue(id, rawTransaction);
  }

  async start() {
    this.isRunning = true;
    console.log(`[EdgeFileWatchAgent] Watching directory: ${this.config.watchDirectory}`);

    while (this.isRunning) {
      if (this.queue.size() > 0) {
        const res = await this.uploader.flushBatch();
        if (res.sent > 0) {
          console.log(`[EdgeFileWatchAgent] Flushed ${res.sent} transactions to SmartStock`);
        }
      }
      await new Promise((r) => setTimeout(r, this.config.pollIntervalMs || 5000));
    }
  }

  stop() {
    this.isRunning = false;
  }
}
