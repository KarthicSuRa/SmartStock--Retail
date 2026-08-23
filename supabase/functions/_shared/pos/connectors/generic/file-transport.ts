// /supabase/functions/_shared/pos/connectors/generic/file-transport.ts
// SmartStock LiveRetail V2 — Generic File/SFTP Transport & Importer

import { POSFileParser } from '../../file-parser.ts';
import { POSFieldMapper, FieldMappingConfig } from '../../field-mapper.ts';
import { CanonicalPOSTransaction } from '../../canonical-schema.ts';

export class GenericFileTransport {
  static parseFileContent(
    content: string,
    format: 'CSV' | 'JSON_LINES',
    mapping: FieldMappingConfig,
    context: { tenant_id: string; source_system: string }
  ): CanonicalPOSTransaction[] {
    if (format === 'JSON_LINES') {
      const records = POSFileParser.parseJSONLines(content);
      return records.map((r) => POSFieldMapper.mapRecord(r, mapping, context));
    }

    // Default CSV
    const records = POSFileParser.parseCSV(content, ',', true);
    return records.map((r) => POSFieldMapper.mapRecord(r, mapping, context));
  }
}
