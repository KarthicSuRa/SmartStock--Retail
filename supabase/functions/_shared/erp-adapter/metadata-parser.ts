// /supabase/functions/_shared/erp-adapter/metadata-parser.ts
//
// Dependency-free, targeted EDMX parser for preflight discovery.
//
// Edge Functions do not guarantee a DOM/XML parser, and adding a dependency
// just to read $metadata is unnecessary: SAP's EDMX uses a small, predictable
// subset of XML for the parts we need (EntityType, Property,
// NavigationProperty, Key, EntitySet). We parse exactly that subset, keep the
// evidence for human re-adjudication, and never guess when the document does
// not match our expectations.

export interface EdmxEntityType {
  name: string;
  baseType?: string;
  properties: string[];
  navigations: string[];
  keys: string[];
}

export interface EdmxParseResult {
  version: 'V2' | 'V4' | 'UNKNOWN';
  versionEvidence: string[];
  entityTypes: Record<string, EdmxEntityType>;
  /** EntitySet name -> qualified EntityType name. */
  entitySets: Record<string, string>;
  truncated: boolean;
  error?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ENTITIES = 100;

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return tag.match(re)?.[2];
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

/** Resolve inherited properties/navigations through the BaseType chain. */
function effective(
  name: string,
  types: Record<string, EdmxEntityType>,
  seen: Set<string> = new Set(),
): EdmxEntityType | undefined {
  if (seen.has(name)) return undefined;
  seen.add(name);
  const own = types[name];
  if (!own) return undefined;
  if (!own.baseType) return own;
  const shortBase = own.baseType.split('.').pop()!;
  const parent = effective(shortBase, types, seen) ?? effective(own.baseType, types, seen);
  if (!parent) return own;
  return {
    ...own,
    properties: dedupe([...parent.properties, ...own.properties]),
    navigations: dedupe([...parent.navigations, ...own.navigations]),
    keys: dedupe([...parent.keys, ...own.keys]),
  };
}

/**
 * Parses an OData $metadata document. The result is intentionally conservative:
 * an unrecognised document yields version UNKNOWN with an error, never a
 * confidently wrong field matrix.
 */
export function parseEdmx(xml: string): EdmxParseResult {
  const result: EdmxParseResult = {
    version: 'UNKNOWN',
    versionEvidence: [],
    entityTypes: {},
    entitySets: {},
    truncated: false,
  };

  if (new TextEncoder().encode(xml).length > MAX_BYTES) {
    result.truncated = true;
    result.error = `$metadata exceeds ${MAX_BYTES} bytes; discovery refuses a truncated contract.`;
    return result;
  }

  // --- version detection (heuristic, evidence recorded) -------------------
  const edmxTag = xml.match(/<edmx:Edmx\b[^>]*>/i)?.[0] ?? xml.slice(0, 256);
  const firstSchema = xml.match(/<Schema\b[^>]*>/i)?.[0] ?? '';
  const versionAttr = attr(edmxTag, 'Version');
  const hasV4Namespace = /docs\.oasis-open\.org\/odata\/ns\/edm/i.test(firstSchema)
    || /<NavigationProperty\b[^>]*\bBinding\s*=/i.test(xml)
    || /Edm\.DateTimeOffset/i.test(xml);
  const hasV2Namespace = /schemas\.microsoft\.com\/ado\/2008\/09\/edm/i.test(firstSchema)
    || /schemas\.microsoft\.com\/ado\/2007\/06\/edmx/i.test(edmxTag);

  result.versionEvidence = [edmxTag.slice(0, 256), firstSchema.slice(0, 256)];
  if (versionAttr === '4.0' || (hasV4Namespace && !hasV2Namespace)) {
    result.version = 'V4';
  } else if (versionAttr === '1.0' || hasV2Namespace) {
    result.version = 'V2';
  } else {
    result.error = 'Could not determine OData version from $metadata; EDMX namespaces are unrecognised.';
    return result;
  }

  // --- EntityType blocks ---------------------------------------------------
  const entityTypeRe = /<EntityType\b([^>]*?)(?:\/>|>([\s\S]*?)<\/EntityType>)/gi;
  let match: RegExpExecArray | null;
  while ((match = entityTypeRe.exec(xml)) !== null) {
    if (Object.keys(result.entityTypes).length >= MAX_ENTITIES) {
      result.truncated = true;
      break;
    }
    const head = match[1] ?? '';
    const body = match[2] ?? '';
    const name = attr(head, 'Name');
    if (!name) continue;

    const properties: string[] = [];
    for (const p of body.matchAll(/<Property\b([^>]*?)\/>/gi)) {
      const n = attr(p[1], 'Name');
      if (n) properties.push(n);
    }
    const navigations: string[] = [];
    for (const nav of body.matchAll(/<NavigationProperty\b([^>]*?)\/>/gi)) {
      const n = attr(nav[1], 'Name');
      if (n) navigations.push(n);
    }
    const keys: string[] = [];
    const keyBlock = body.match(/<Key\b[^>]*>([\s\S]*?)<\/Key>/i)?.[1];
    if (keyBlock) {
      for (const ref of keyBlock.matchAll(/<PropertyRef\b([^>]*?)\/>/gi)) {
        const n = attr(ref[1], 'Name');
        if (n) keys.push(n);
      }
    }

    result.entityTypes[name] = {
      name,
      baseType: attr(head, 'BaseType'),
      properties: dedupe(properties),
      navigations: dedupe(navigations),
      keys: dedupe(keys),
    };
  }

  // --- EntityContainer / EntitySet ---------------------------------------
  for (const set of xml.matchAll(/<EntitySet\b([^>]*?)\/>/gi)) {
    const name = attr(set[1], 'Name');
    const type = attr(set[1], 'EntityType');
    if (name && type) result.entitySets[name] = type;
  }

  if (Object.keys(result.entityTypes).length === 0) {
    result.error = result.error ?? 'No EntityType definitions found in $metadata.';
  }
  return result;
}

/** Entity type with inherited members resolved, by EntitySet name. */
export function entityFields(
  parsed: EdmxParseResult,
  entitySet: string,
): EdmxEntityType | undefined {
  const qualified = parsed.entitySets[entitySet];
  if (!qualified) return undefined;
  return effective(qualified.split('.').pop()!, parsed.entityTypes);
}

export function hasProperty(parsed: EdmxParseResult, entitySet: string, property: string): boolean {
  return entityFields(parsed, entitySet)?.properties.includes(property) ?? false;
}

export function hasNavigation(parsed: EdmxParseResult, entitySet: string, navigation: string): boolean {
  return entityFields(parsed, entitySet)?.navigations.includes(navigation) ?? false;
}
