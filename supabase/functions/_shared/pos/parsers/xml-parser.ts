// /supabase/functions/_shared/pos/parsers/xml-parser.ts
// SmartStock LiveRetail V2 — XML Transaction File Parser

import { IPOSFileParser } from './parser-interface.ts';

export class XMLFileParser implements IPOSFileParser {
  detect(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith('<?xml') || (trimmed.startsWith('<') && trimmed.endsWith('>'));
  }

  parse(content: string, options?: { recordTag?: string }): Array<Record<string, string>> {
    const tag = options?.recordTag || 'transaction';
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const records: Array<Record<string, string>> = [];

    let match;
    while ((match = regex.exec(content)) !== null) {
      const block = match[1];
      const record: Record<string, string> = {};
      const tagRegex = /<([a-zA-Z0-9_-]+)>([^<]*)<\/\1>/g;
      let fieldMatch;
      while ((fieldMatch = tagRegex.exec(block)) !== null) {
        record[fieldMatch[1]] = fieldMatch[2].trim();
      }
      if (Object.keys(record).length > 0) {
        records.push(record);
      }
    }

    return records;
  }
}
