// /smartstock-edge/core/health-server.ts
// SmartStock LiveRetail V2 — Store Edge Local Health & Diagnostics HTTP Server

import { DurableSQLiteQueue } from './sqlite-queue.ts';

export class EdgeHealthServer {
  constructor(
    private queue: DurableSQLiteQueue,
    private config: { port: number; agentId: string; storeId: string }
  ) {}

  getHealthStatus() {
    return {
      status: 'UP',
      agent_id: this.config.agentId,
      store_id: this.config.storeId,
      queue_size: this.queue.size(),
      memory_usage: typeof process !== 'undefined' ? process.memoryUsage?.() : {},
      uptime_seconds: typeof process !== 'undefined' ? Math.floor(process.uptime?.() || 0) : 0,
      timestamp: new Date().toISOString(),
    };
  }
}
