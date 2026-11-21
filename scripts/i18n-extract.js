#!/usr/bin/env node
// scripts/i18n-extract.js
// Extracts every user-visible English string from src/ into src/i18n/catalog.json.
//   - JSX text nodes ("Bin movement posted")
//   - display attributes (placeholder, title, aria-label, alt)
//   - human-readable string literals (labels, descriptions, toast titles, demo data)
//   - template literals with substitutions become patterns: `Only ${n} EA` → "Only {0} EA"
// Usage: node scripts/i18n-extract.js            → writes catalog + prints stats
//        node scripts/i18n-extract.js --missing  → also lists keys missing per language

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(SRC, 'i18n');
const SKIP_FILES = [/[\\/]i18n[\\/]/, /i18n\.tsx$/, /service-worker\.ts$/, /\.d\.ts$/];
const SKIP_ATTRS = new Set(['className', 'href', 'src', 'key', 'id', 'type', 'name', 'value', 'role', 'htmlFor', 'rel', 'target', 'method', 'action', 'd', 'fill', 'stroke', 'viewBox', 'points', 'transform', 'textAnchor', 'strokeDasharray', 'strokeLinejoin', 'strokeLinecap', 'dir', 'lang', 'autoComplete', 'inputMode', 'pattern', 'accept', 'capture', 'style', 'data-testid', 'fontWeight']);
const DISPLAY_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'ariaLabel', 'subtitle', 'description', 'centerLabel']);
const SKIP_CALLS = new Set(['require', 'import', 'getItem', 'setItem', 'removeItem', 'createPersistentStore', 'querySelector', 'querySelectorAll', 'addEventListener', 'removeEventListener', 'matchMedia', 'getElementById', 'createElement', 'setAttribute', 'removeAttribute', 'getAttribute', 'from', 'select', 'eq', 'channel', 'on', 'rpc', 'invoke', 'fetch', 'test', 'match', 'replace', 'split', 'startsWith', 'endsWith', 'includes', 'padStart', 'toLocaleString', 'NumberFormat', 'DateTimeFormat', 'Error', 'log', 'warn', 'error', 'debug', 'push', 'useState', 'cn', 'clsx', 'get', 'set', 'has', 'delete', 'newId', 'download', 'postMessage', 'Date', 'Blob', 'encode']);

const LETTER = /\p{L}/u;
// Things that are clearly not prose
const looksTechnical = (s) =>
  /^[a-z0-9_.\-:/#@[\]()%]+$/.test(s) || // css classes, keys, paths, ids
  /^(?:[a-z0-9]+-){1,}[a-z0-9]+(?:\s+(?:[a-z0-9:[\]#./%-]+))*$/.test(s) || // tailwind class lists
  /\b(?:px|py|text|bg|border|rounded|flex|grid|gap|w|h|mt|mb|ms|me|ps|pe)-[\w[\]#./]+/.test(s) && !/[A-Z]/.test(s.replace(/\[#[0-9A-F]+\]/gi, '')) ||
  /^https?:\/\//.test(s) ||
  /^\/[\w/\-[\]]*$/.test(s) ||
  /^[A-Z0-9_]+$/.test(s) && s.length > 1 && !/\s/.test(s) && /_/.test(s) || // CONSTANT_KEYS
  /^(?:M|L|A|Z|Q|V|H)[\d\s.,-]/.test(s) || // svg paths
  /^\p{L}+\.\p{L}+/u.test(s) && !/\s/.test(s) || // dotted keys a.b
  /^(?:use client|use server)$/.test(s);

const NOISE = [
  /^#[0-9a-f]{3,8}$/i, // colours
  /^\d{4}-\d{2}-\d{2}/, // ISO dates
  /^[A-Z]{1,6}[-_]?\d[\w-]*$/, // ids: MAT-00918, PO-123, W100
  /^[A-Z]{1,5}-[A-Z0-9]+(?:-[A-Z0-9]+)+$/, // bins/codes: BS-A-01-02, SF-02-A
  /^[A-Z]{2,5}-\d+$/,
  /^\d[\d\s.,:%a-z×x/-]*$/i, // numbers, durations '8h 30m', '24h', '2.5L'
  /</, // markup
  /^[a-z]+(?:[A-Z][a-z]+)+$/, // camelCase identifiers: CloudOff
  /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/, // PascalCase identifiers / icon names
  /^[a-z]+(?:_[a-z]+)+$/, // snake_case keys
  /^(?:GET|POST|PUT|PATCH|DELETE)$/,
];

const isHuman = (s) => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t || !LETTER.test(t)) return false;
  if (NOISE.some((r) => r.test(t))) return false;
  if (!/\p{L}{2,}/u.test(t)) return false;
  if (looksTechnical(t)) return false;
  if (t.length === 1) return false;
  // single lowercase word with no space is usually a key/enum (e.g. 'success', 'healthy') — keep only if short UI words appear capitalised elsewhere
  if (/^[a-z_]+$/.test(t) && t.length < 3) return false;
  return true;
};

const norm = (s) => s.replace(/\s+/g, ' ').trim();

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(f) && !SKIP_FILES.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

function extract() {
  const strings = new Map(); // text → Set(files)
  const patterns = new Map();
  const add = (map, s, file) => {
    const k = norm(s);
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(path.relative(ROOT, file).replace(/\\/g, '/'));
  };

  for (const file of walk(SRC)) {
    const code = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    const visit = (node) => {
      // Skip imports / exports / type positions
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node) || ts.isLiteralTypeNode?.(node)) return;

      if (ts.isJsxText(node)) {
        const t = norm(node.text);
        if (isHuman(t)) add(strings, t, file);
      } else if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sf);
        if (SKIP_ATTRS.has(name) || name.startsWith('on') && !DISPLAY_ATTRS.has(name)) return; // don't descend into className etc.
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (shouldSkipLiteral(node, sf)) return;
        if (isHuman(node.text)) add(strings, node.text, file);
      } else if (ts.isTemplateExpression(node)) {
        if (!shouldSkipLiteral(node, sf)) {
          let pat = node.head.text;
          node.templateSpans.forEach((span, i) => (pat += `{${i}}` + span.literal.text));
          const stripped = norm(pat.replace(/\{\d+\}/g, ' '));
          if (isHuman(stripped) && /\p{L}{2,}/u.test(stripped) && !looksTechnical(norm(pat))) add(patterns, pat, file);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { strings, patterns };
}

function shouldSkipLiteral(node, sf) {
  const p = node.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true; // object keys
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return true;
  if (ts.isExpressionStatement(p)) return true; // 'use client'
  // className={`...`} / attribute we skip
  let a = p;
  while (a && !ts.isJsxAttribute(a) && !ts.isStatement(a)) a = a.parent;
  if (a && ts.isJsxAttribute(a) && SKIP_ATTRS.has(a.name.getText(sf))) return true;
  // call arguments of non-display functions
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const callee = p.expression;
    const nm = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
    if (SKIP_CALLS.has(nm)) return true;
  }
  return false;
}

const { strings, patterns } = extract();
fs.mkdirSync(OUT_DIR, { recursive: true });
const catalog = {
  generated: new Date().toISOString(),
  strings: [...strings.keys()].sort(),
  patterns: [...patterns.keys()].sort(),
};
fs.writeFileSync(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2));
console.log(`strings: ${catalog.strings.length}  patterns: ${catalog.patterns.length}`);

if (process.argv.includes('--missing')) {
  for (const lang of ['hi', 'ta', 'nl', 'de', 'ar']) {
    const f = path.join(OUT_DIR, `${lang}.json`);
    const dict = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    const miss = [...catalog.strings, ...catalog.patterns].filter((k) => !(k in dict));
    console.log(`${lang}: ${miss.length} missing`);
  }
}
