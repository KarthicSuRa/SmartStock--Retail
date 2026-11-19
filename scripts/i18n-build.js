#!/usr/bin/env node
// scripts/i18n-build.js
// Compiles translation sources (src/i18n/translations/*.tsv) into src/i18n/{hi,ta,nl,de,ar}.json
// and reports coverage against src/i18n/catalog.json.
//
// TSV format (tab-separated, one string per line, '#' = comment):
//   English<TAB>Hindi<TAB>Tamil<TAB>Dutch<TAB>German<TAB>Arabic
// Use {0}, {1}… for dynamic values in pattern strings. Leave a cell empty to fall back to English.
//
// Usage: node scripts/i18n-extract.js && node scripts/i18n-build.js [--missing]

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'src', 'i18n');
const SRC = path.join(DIR, 'translations');
const LANGS = ['hi', 'ta', 'nl', 'de', 'ar'];
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const dicts = Object.fromEntries(LANGS.map((l) => [l, {}]));
let lines = 0;
const problems = [];

for (const f of fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((x) => x.endsWith('.tsv')).sort() : []) {
  const rows = fs.readFileSync(path.join(SRC, f), 'utf8').split(/\r?\n/);
  rows.forEach((row, i) => {
    if (!row.trim() || row.startsWith('#')) return;
    const cells = row.split('\t');
    const en = norm(cells[0] ?? '');
    if (!en) return;
    if (cells.length !== 6) problems.push(`${f}:${i + 1} expected 6 columns, got ${cells.length}`);
    const ph = (en.match(/\{\d+\}/g) ?? []).sort().join();
    LANGS.forEach((l, li) => {
      const v = norm(cells[li + 1] ?? '');
      if (!v) return;
      if ((v.match(/\{\d+\}/g) ?? []).sort().join() !== ph) problems.push(`${f}:${i + 1} [${l}] placeholder mismatch`);
      dicts[l][en] = v;
    });
    lines++;
  });
}

for (const l of LANGS) {
  const sorted = Object.fromEntries(Object.entries(dicts[l]).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(DIR, `${l}.json`), JSON.stringify(sorted, null, 1) + '\n');
}

const catalog = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8'));
const keys = [...catalog.strings, ...catalog.patterns];
console.log(`translation rows: ${lines}`);
for (const l of LANGS) {
  const miss = keys.filter((k) => !dicts[l][k]);
  console.log(`${l}: ${keys.length - miss.length}/${keys.length} (${Math.round(((keys.length - miss.length) / keys.length) * 100)}%)`);
  if (process.argv.includes('--missing') && l === 'hi') miss.forEach((m) => console.log('  MISSING ' + m));
}
problems.slice(0, 40).forEach((p) => console.log('WARN ' + p));
if (problems.length > 40) console.log(`WARN … ${problems.length - 40} more`);
