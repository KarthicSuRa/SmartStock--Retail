// /supabase/functions/_shared/pos/parsers/parser-registry.ts
// SmartStock LiveRetail V2 — Universal File Parser Registry

import { IPOSFileParser } from './parser-interface.ts';
import { CSVFileParser } from './csv-parser.ts';
import { JSONLinesFileParser } from './jsonl-parser.ts';
import { XMLFileParser } from './xml-parser.ts';
import { FixedWidthFileParser } from './fixed-width-parser.ts';

export class POSFileParserRegistry {
  private static parsers: Map<string, IPOSFileParser> = new Map();

  static initialize() {
    if (this.parsers.size === 0) {
      this.parsers.set('csv', new CSVFileParser());
      this.parsers.set('jsonl', new JSONLinesFileParser());
      this.parsers.set('xml', new XMLFileParser());
      this.parsers.set('fixed_width', new FixedWidthFileParser());
    }
  }

  static getParser(format: string): IPOSFileParser {
    this.initialize();
    return this.parsers.get(format.toLowerCase()) || this.parsers.get('csv')!;
  }

  static autoDetect(content: string): { parser: IPOSFileParser; format: string } {
    this.initialize();
    for (const [fmt, parser] of this.parsers.entries()) {
      if (parser.detect(content)) {
        return { parser, format: fmt };
      }
    }
    return { parser: this.parsers.get('csv')!, format: 'csv' };
  }
}
