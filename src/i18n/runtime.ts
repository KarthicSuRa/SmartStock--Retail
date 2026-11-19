'use client';

// /src/i18n/runtime.ts
// Whole-page translator. Translates every text node and display attribute in the DOM using the
// per-language dictionaries in src/i18n/<lang>.json (generated from catalog.json), and keeps
// translating as React re-renders. Original English is remembered per node so switching
// languages (or back to English) is lossless.
//
// Opt out for a subtree with  data-no-translate  (e.g. user-entered free text, codes).

export type Dict = Record<string, string>;

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);

interface Compiled {
  exact: Map<string, string>;
  patterns: { re: RegExp; out: string }[];
}

let active: Compiled | null = null;
let observer: MutationObserver | null = null;

// Originals and last-written values, so we can tell our writes from React's.
const origText = new WeakMap<Text, string>();
const lastText = new WeakMap<Text, string>();
const origAttr = new WeakMap<Element, Map<string, string>>();
const lastAttr = new WeakMap<Element, Map<string, string>>();

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compile(dict: Dict): Compiled {
  const exact = new Map<string, string>();
  const patterns: Compiled['patterns'] = [];
  for (const [k, v] of Object.entries(dict)) {
    if (!v) continue;
    if (/\{\d+\}/.test(k)) {
      const parts = k.split(/(\{\d+\})/);
      const order: number[] = [];
      const src = parts
        .map((p) => {
          const m = p.match(/^\{(\d+)\}$/);
          if (m) {
            order.push(Number(m[1]));
            return '(.+?)';
          }
          return escapeRe(p);
        })
        .join('');
      const re = new RegExp(`^${src}$`, 's');
      // translation refers to {n}; map capture position → placeholder index
      patterns.push({ re, out: v.replace(/\{(\d+)\}/g, (_, n) => `{{${order.indexOf(Number(n))}}}`) });
    } else {
      exact.set(norm(k), v);
    }
  }
  // longer patterns first (more specific)
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  return { exact, patterns };
}

/** Translate a single string with the active dictionary (identity when English / unknown). */
export function translateString(s: string, c: Compiled | null = active): string {
  if (!c || !s) return s;
  const key = norm(s);
  if (!key) return s;
  const hit = c.exact.get(key);
  if (hit !== undefined) return preserveSpace(s, hit);
  for (const p of c.patterns) {
    const m = key.match(p.re);
    if (m) {
      const out = p.out.replace(/\{\{(\d+)\}\}/g, (_, i) => {
        const v = m[Number(i) + 1] ?? '';
        return c.exact.get(norm(v)) ?? v;
      });
      return preserveSpace(s, out);
    }
  }
  return s;
}

function preserveSpace(original: string, translated: string) {
  const lead = original.match(/^\s*/)?.[0] ?? '';
  const trail = original.match(/\s*$/)?.[0] ?? '';
  return lead + translated + trail;
}

function skipped(el: Element | null): boolean {
  for (let n = el; n; n = n.parentElement) {
    if (SKIP_TAGS.has(n.tagName) || n.hasAttribute('data-no-translate') || (n as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function doText(node: Text) {
  const current = node.data;
  const last = lastText.get(node);
  // React (or anyone else) changed the text since our last write → new English original
  if (last === undefined || current !== last) origText.set(node, current);
  const original = origText.get(node) ?? current;
  if (!/\p{L}/u.test(original)) return;
  if (skipped(node.parentElement)) return;
  const next = active ? translateString(original) : original;
  if (next !== current) node.data = next;
  lastText.set(node, next);
}

function doAttrs(el: Element) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const current = el.getAttribute(a) ?? '';
    const lastMap = lastAttr.get(el) ?? new Map<string, string>();
    const origMap = origAttr.get(el) ?? new Map<string, string>();
    if (lastMap.get(a) === undefined || lastMap.get(a) !== current) origMap.set(a, current);
    const original = origMap.get(a) ?? current;
    const next = active ? translateString(original) : original;
    if (next !== current) el.setAttribute(a, next);
    lastMap.set(a, next);
    lastAttr.set(el, lastMap);
    origAttr.set(el, origMap);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as Element;
    if (SKIP_TAGS.has(el.tagName) || el.hasAttribute('data-no-translate')) return;
    doAttrs(el);
  }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
    n = tw.nextNode();
  }
}

/** Activate a dictionary (null = English) and keep the page translated. */
export function applyDictionary(dict: Dict | null) {
  active = dict ? compile(dict) : null;
  if (typeof document === 'undefined') return;
  walk(document.body);
  if (document.title) document.title = active ? translateString(document.title) : document.title;
  if (!observer) {
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') doText(r.target as Text);
        else if (r.type === 'attributes') doAttrs(r.target as Element);
        else r.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  }
}
