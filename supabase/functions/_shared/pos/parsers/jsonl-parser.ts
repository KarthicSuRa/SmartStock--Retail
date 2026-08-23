// /supabase/functions/_shared/pos/parsers/jsonl-parser.ts
// SmartStock LiveRetail V2 — JSON Lines File Parser

import { IPOSFileParser } from './parser-interface.ts';

export class JSONLinesFileParser implements IPOSFileParser {
  detect(content: string): boolean {
    const firstLine = content.trim().split(/\r?\n/)[0] || '';
    return firstLine.startsWith('{') && firstLine.endsWith('}');
  }

  parse(content: string): Array<Record<string, string>> {
    return content
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const obj = JSON.parse(line);
        const flattened: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
          flattened[k] = String(v);
        }
        return flattened;
      });
  }
}
