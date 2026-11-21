'use client';

// /src/components/ui/ExportMenu.tsx
// Excel / CSV / PDF export buttons. Every export is written to the audit log.

import React from 'react';
import { FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import { exportCSV, exportPDF, exportXLSX, ExportColumn, ExportSheet } from '@/lib/export';
import { logActivity } from '@/lib/activity-log';
import { useI18n } from '@/lib/i18n';

export interface ExportMenuProps<T> {
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  module?: string;
  /** Extra sheets appended to the Excel workbook (e.g. summary). */
  extraSheets?: ExportSheet[];
  /** Returns HTML (e.g. chart SVG) to place above the table in the PDF. */
  pdfHtmlBefore?: () => string | undefined;
  landscape?: boolean;
}

export function ExportMenu<T>({ title, subtitle, columns, rows, module = 'reports', extraSheets = [], pdfHtmlBefore, landscape }: ExportMenuProps<T>) {
  const { t } = useI18n();

  // Exports follow the active UI language (headers + text cells; numbers untouched)
  const tr = (v: string | number | null | undefined) => (typeof v === 'string' ? t(v) : v);
  const tCols = <R,>(cols: ExportColumn<R>[]): ExportColumn<R>[] => cols.map((c) => ({ header: t(c.header), value: (r: R) => tr(c.value(r)) }));

  const run = (format: 'Excel' | 'CSV' | 'PDF') => {
    const cols = tCols(columns);
    const sheets = extraSheets.map((s) => ({ ...s, name: t(s.name), columns: tCols(s.columns) }));
    const heading = t(title);
    const sub = subtitle && t(subtitle);
    try {
      if (format === 'Excel') exportXLSX(heading, [{ name: heading.slice(0, 31), columns: cols, rows } as ExportSheet, ...sheets]);
      if (format === 'CSV') exportCSV(heading, cols, rows);
      if (format === 'PDF') exportPDF({ title: heading, subtitle: sub, columns: cols, rows, htmlBefore: pdfHtmlBefore?.(), landscape });
      logActivity({ module, action: `Export ${format}`, entity: `${title} (${rows.length} rows)`, status: 'success' });
    } catch (e) {
      logActivity({ module, action: `Export ${format}`, entity: title, status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const btn =
    'inline-flex items-center gap-1.5 px-2.5 h-8 rounded-[6px] border border-[#D0D5DD] bg-white text-xs font-semibold text-[#344054] hover:bg-[#F9FAFB] transition-colors';

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Export')}>
      <button type="button" className={btn} onClick={() => run('Excel')} disabled={rows.length === 0}>
        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" /> Excel
      </button>
      <button type="button" className={btn} onClick={() => run('CSV')} disabled={rows.length === 0}>
        <FileDown className="w-3.5 h-3.5 text-[#475467]" /> CSV
      </button>
      <button type="button" className={btn} onClick={() => run('PDF')} disabled={rows.length === 0}>
        <FileText className="w-3.5 h-3.5 text-rose-700" /> PDF
      </button>
    </div>
  );
}
