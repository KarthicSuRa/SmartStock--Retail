// /supabase/functions/_shared/pos/file-parser.ts
// SmartStock LiveRetail V2 — Universal File Parser (CSV, JSON Lines)

export class POSFileParser {
  static parseCSV(content: string, delimiter = ',', skipHeader = true): Array<Record<string, string>> {
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

  static parseJSONLines(content: string): Array<Record<string, unknown>> {
    return content
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map((line) => JSON.parse(line));
  }
}
