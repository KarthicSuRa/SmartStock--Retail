// /smartstock-edge/agents/database/sql-transport.ts
// SmartStock LiveRetail V2 — Store Edge Generic SQL Database Polling Agent

import { FieldMappingConfig, POSFieldMapper } from '../../../supabase/functions/_shared/pos/field-mapper.ts';
import { CanonicalPOSTransaction } from '../../../supabase/functions/_shared/pos/canonical-schema.ts';

export interface SQLDatabaseConfig {
  dbType: 'postgresql' | 'sqlserver' | 'mysql' | 'sqlite';
  tableName: string;
  cursorColumn: string;
  mapping: FieldMappingConfig;
  batchSize?: number;
}

export class EdgeSQLDatabaseAgent {
  constructor(
    private config: SQLDatabaseConfig,
    private context: { tenant_id: string; source_system: string }
  ) {}

  /**
   * Generates a read-only parameterized query string for cursor-based extraction.
   */
  buildPollingQuery(lastCursorValue: string | number): string {
    const limit = this.config.batchSize || 500;
    return `SELECT * FROM ${this.config.tableName} WHERE ${this.config.cursorColumn} > '${lastCursorValue}' ORDER BY ${this.config.cursorColumn} ASC LIMIT ${limit}`;
  }

  /**
   * Translates extracted raw database rows into canonical POS transactions.
   */
  processRows(rows: Array<Record<string, any>>): {
    transactions: CanonicalPOSTransaction[];
    nextCursor: string | number;
  } {
    const transactions: CanonicalPOSTransaction[] = [];
    let nextCursor: string | number = '';

    for (const row of rows) {
      const canonical = POSFieldMapper.mapRecord(row, this.config.mapping, this.context);
      transactions.push(canonical);
      nextCursor = row[this.config.cursorColumn] || nextCursor;
    }

    return { transactions, nextCursor };
  }
}
