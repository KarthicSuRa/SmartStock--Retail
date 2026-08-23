// /supabase/functions/_shared/pos/parsers/parser-interface.ts
// SmartStock LiveRetail V2 — Pluggable POS File Parser Interface

export interface IPOSFileParser {
  detect(content: string): boolean;
  parse(content: string, options?: Record<string, unknown>): Array<Record<string, string>>;
}
