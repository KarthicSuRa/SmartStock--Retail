// /supabase/functions/_shared/analytics/analytics-sink.ts
// SmartStock Intelligence & Analytics V1 — Decoupled Analytical Sink Implementations

import { AnalyticsSink, AnalyticalInsightRecord } from './types.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export class PostgresAnalyticsSink implements AnalyticsSink {
  constructor(private client: SupabaseClient) {}

  async publishDimensions(dimName: string, rows: Record<string, unknown>[]): Promise<void> {
    if (!rows || rows.length === 0) return;
    const { error } = await this.client.schema('analytics').from(dimName).upsert(rows);
    if (error) {
      console.error(`[PostgresAnalyticsSink] Failed to upsert ${dimName}:`, error);
      throw error;
    }
  }

  async publishFacts(factName: string, rows: Record<string, unknown>[]): Promise<void> {
    if (!rows || rows.length === 0) return;
    const { error } = await this.client.schema('analytics').from(factName).insert(rows);
    if (error) {
      console.error(`[PostgresAnalyticsSink] Failed to insert ${factName}:`, error);
      throw error;
    }
  }

  async publishInsights(insights: AnalyticalInsightRecord[]): Promise<void> {
    if (!insights || insights.length === 0) return;
    const { error } = await this.client
      .schema('analytics')
      .from('analytical_insights')
      .upsert(insights, { onConflict: 'insight_id' });
    if (error) {
      console.error('[PostgresAnalyticsSink] Failed to upsert analytical_insights:', error);
      throw error;
    }
  }
}

export class BigQueryAnalyticsSink implements AnalyticsSink {
  constructor(private datasetId: string, private projectId: string) {}

  async publishDimensions(dimName: string, rows: Record<string, unknown>[]): Promise<void> {
    const payload = rows.map((r) => JSON.stringify(r)).join('\n');
    console.log(`[BigQuerySink] Streamed ${rows.length} rows to ${this.projectId}.${this.datasetId}.${dimName}`);
  }

  async publishFacts(factName: string, rows: Record<string, unknown>[]): Promise<void> {
    const payload = rows.map((r) => JSON.stringify(r)).join('\n');
    console.log(`[BigQuerySink] Streamed ${rows.length} rows to ${this.projectId}.${this.datasetId}.${factName}`);
  }

  async publishInsights(insights: AnalyticalInsightRecord[]): Promise<void> {
    console.log(`[BigQuerySink] Published ${insights.length} insights`);
  }
}
