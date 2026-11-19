'use client';

// /src/lib/export.ts
// SmartStock — Zero-dependency report exporters: Excel (.xlsx), CSV and PDF (print-to-PDF).

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export interface ExportSheet<T = any> {
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

const safeName = (s: string) => s.replace(/[^\w\-]+/g, '_');
const stamp = () => new Date().toISOString().slice(0, 10);

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────── CSV ───────────────────────────
export function exportCSV<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.header)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))];
  // BOM so Excel opens UTF-8 (Hindi / Tamil / Arabic) correctly
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${safeName(filename)}_${stamp()}.csv`);
}

// ─────────────────────────── XLSX ───────────────────────────
// Minimal OOXML workbook packed in an uncompressed (STORE) zip.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // STORE
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);

    chunks.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }

  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, end] as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const xmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml<T>(sheet: ExportSheet<T>): string {
  const cell = (v: unknown, r: number, c: number, header = false) => {
    const ref = `${colName(c)}${r}`;
    const style = header ? ' s="1"' : '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
    const s = v == null ? '' : String(v);
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(s)}</t></is></c>`;
  };
  const widths = sheet.columns
    .map((col, i) => {
      const max = Math.max(col.header.length, ...sheet.rows.slice(0, 200).map((r) => String(col.value(r) ?? '').length));
      return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(10, max + 2))}" customWidth="1"/>`;
    })
    .join('');
  const header = `<row r="1">${sheet.columns.map((c, i) => cell(c.header, 1, i, true)).join('')}</row>`;
  const body = sheet.rows
    .map((row, ri) => `<row r="${ri + 2}">${sheet.columns.map((c, ci) => cell(c.value(row), ri + 2, ci)).join('')}</row>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${header}${body}</sheetData></worksheet>`;
}

export function exportXLSX(filename: string, sheets: ExportSheet[]) {
  const names = sheets.map((s, i) => xmlEsc(s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet${i + 1}`));
  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF14706B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  download(zipStore(files), `${safeName(filename)}_${stamp()}.xlsx`);
}

// ─────────────────────────── PDF ───────────────────────────
// Renders a print-optimised document in a hidden iframe and opens the browser's
// print dialog ("Save as PDF"). Works on Chrome, Edge, Safari, Firefox, iOS & Android.

export function exportPDF<T>(opts: {
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Optional chart / summary markup (e.g. an SVG element's outerHTML). */
  htmlBefore?: string;
  landscape?: boolean;
}) {
  const esc = (v: unknown) => xmlEsc(v == null ? '' : String(v));
  const dir = document.documentElement.dir || 'ltr';
  const html = `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
@page { size: A4 ${opts.landscape ? 'landscape' : 'portrait'}; margin: 14mm; }
body { font-family: 'Segoe UI', 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Arabic', Arial, sans-serif; color: #101828; font-size: 10px; }
header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom: 2px solid #14706B; padding-bottom: 6px; margin-bottom: 12px; }
h1 { font-size: 16px; margin: 0; } .sub { color:#475467; font-size: 10px; } .brand { color:#14706B; font-weight:700; }
table { width:100%; border-collapse: collapse; } th { background:#14706B; color:#fff; text-align:start; padding:5px 6px; font-size:9px; }
td { padding:4px 6px; border-bottom:1px solid #EAECF0; font-size:9px; vertical-align: top; } tr:nth-child(even) td { background:#F9FAFB; }
thead { display: table-header-group; } tr { page-break-inside: avoid; }
.charts { margin-bottom: 12px; } .charts svg { max-width: 100%; height: auto; }
footer { margin-top: 10px; color:#98A2B3; font-size: 8px; }
</style></head><body>
<header><div><h1>${esc(opts.title)}</h1>${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ''}</div>
<div class="sub"><span class="brand">SmartStock LiveRetail</span><br/>Generated ${esc(new Date().toLocaleString())}</div></header>
${opts.htmlBefore ? `<div class="charts">${opts.htmlBefore}</div>` : ''}
<table><thead><tr>${opts.columns.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr></thead>
<tbody>${opts.rows.map((r) => `<tr>${opts.columns.map((c) => `<td>${esc(c.value(r))}</td>`).join('')}</tr>`).join('')}</tbody></table>
<footer>${opts.rows.length} rows · Confidential — internal use only</footer>
</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  }, 250);
}
