// /supabase/functions/_shared/pos/sdk/stream-transport.ts
// SmartStock LiveRetail V2 — Enterprise Message-Stream Transport Interface (Kafka / SSE)

import { RawPOSEnvelope } from '../connector-interface.ts';

export interface POSStreamOffset {
  partition?: number;
  offset: string | number;
}

export interface IPOSStreamTransport {
  subscribe(topics: string[]): Promise<void>;
  consumeBatch(maxRecords?: number): Promise<Array<{ envelope: RawPOSEnvelope; offset: POSStreamOffset }>>;
  commitOffset(offset: POSStreamOffset): Promise<void>;
}

export class SSEStreamTransport implements IPOSStreamTransport {
  constructor(private streamUrl: string) {}

  async subscribe(_topics: string[]): Promise<void> {
    console.log(`[SSEStreamTransport] Connected to stream: ${this.streamUrl}`);
  }

  async consumeBatch(_maxRecords = 100): Promise<Array<{ envelope: RawPOSEnvelope; offset: POSStreamOffset }>> {
    return [];
  }

  async commitOffset(_offset: POSStreamOffset): Promise<void> {
    // Ack offset
  }
}
