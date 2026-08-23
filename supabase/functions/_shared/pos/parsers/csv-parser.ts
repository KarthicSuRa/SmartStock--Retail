// /supabase/functions/_shared/pos/parsers/csv-parser.ts
// SmartStock LiveRetail V2 — CSV File Parser

import { IPOSFileParser } from './parser-interface.ts';

export class CSVFileParser implements IPOSFileParser {
  detect(content: string): boolean {
    const firstLine = content.split(/\r?\n/)[0] || '';
    return firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t');
  }

  parse(content: string, options?: { delimiter?: string; skipHeader?: boolean }): Array<Record<string, string>> {
    const delimiter = options?.delimiter || (content.includes(';') ? ';' : ',');
    const skipHeader = options?.skipHeader !== false;

    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    let headers: string[] = [];
    let startIndex = 0;

    if (skipHeader) {
      headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));
      startIndex = 1;
    } else {
      headers = lines[0].split(delimiter).map((_, idx) => `column_${idx}`);
    }

    const records: Array<Record<string, string>> = [];
    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map((p) => p.trim().replace(/^["']|["']$/g, ''));
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = parts[idx] || '';
      });
      records.push(obj);
    }

    return records;
  }
}
