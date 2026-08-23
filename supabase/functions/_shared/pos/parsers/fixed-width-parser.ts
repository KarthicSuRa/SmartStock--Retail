// /supabase/functions/_shared/pos/parsers/fixed-width-parser.ts
// SmartStock LiveRetail V2 — Fixed-Width File Parser

import { IPOSFileParser } from './parser-interface.ts';

export interface FixedWidthColumnConfig {
  name: string;
  start: number; // 0-indexed character start
  length: number;
}

export class FixedWidthFileParser implements IPOSFileParser {
  detect(_content: string): boolean {
    return false; // Typically configured explicitly by file format config
  }

  parse(content: string, options?: { columns?: FixedWidthColumnConfig[] }): Array<Record<string, string>> {
    const columns = options?.columns || [];
    if (columns.length === 0) return [];

    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    const records: Array<Record<string, string>> = [];

    for (const line of lines) {
      const record: Record<string, string> = {};
      for (const col of columns) {
        record[col.name] = line.substring(col.start, col.start + col.length).trim();
      }
      records.push(record);
    }

    return records;
  }
}
