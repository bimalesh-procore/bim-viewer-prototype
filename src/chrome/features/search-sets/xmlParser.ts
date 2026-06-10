/**
 * Parser for Navisworks "exchange" XML search-set exports.
 *
 * The format is the de-facto industry standard for round-tripping saved
 * search sets between Navisworks, Naviate, and other BIM tools.
 *
 * We parse the full condition tree so that `SearchQueryEngine.execute()`
 * can evaluate each set against the loaded model.
 *
 * Sample file shipped at `public/sample-search-sets.xml`.
 */

// ── Types matching SearchQueryEngine's internal condition format ──────────────

export interface EngineCondition {
  type: 'condition';
  category: string;
  property: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'defined' | 'undefined';
  value?: string;
}

export interface EngineGroup {
  type?: 'group';
  logic: 'and' | 'or';
  rules: (EngineCondition | EngineGroup)[];
}

export interface ParsedSearchSet {
  type: 'set';
  /** Stable GUID from the source XML if present, otherwise generated. */
  guid: string;
  /** Display name from the `name` attribute on `<selectionset>`. */
  name: string;
  /** Number of conditions inside the `<findspec>` — drives the summary subtitle. */
  conditionCount: number;
  /** "all" / "any" boolean joining mode (defaults to "all"). */
  mode: 'all' | 'any';
  /** Parsed condition tree ready for SearchQueryEngine.execute(). */
  conditions: EngineGroup;
}

export interface ParsedFolder {
  type: 'folder';
  /** Stable GUID from the source XML if present, otherwise generated. */
  guid: string;
  /** Display name from the `name` attribute on `<selectionset>`. */
  name: string;
  /** Direct children — may be a mix of folders and leaf sets. */
  children: ParsedNode[];
}

/** A node in the parsed import tree — either a folder group or a leaf search set. */
export type ParsedNode = ParsedSearchSet | ParsedFolder;

export interface ParsedImportFile {
  /** Display name shown as the root tree folder (defaults to the file name). */
  fileName: string;
  /** Parsed tree preserving the folder/set nesting from the source XML. */
  children: ParsedNode[];
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlParseError';
  }
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

/** Recursively collect all leaf ParsedSearchSet nodes from a node list. */
export function collectLeafSets(nodes: ParsedNode[]): ParsedSearchSet[] {
  const result: ParsedSearchSet[] = [];
  for (const node of nodes) {
    if (node.type === 'set') result.push(node);
    else result.push(...collectLeafSets(node.children));
  }
  return result;
}

/** Recursively collect all leaf GUIDs from a node list. */
export function collectLeafGuids(nodes: ParsedNode[]): string[] {
  return collectLeafSets(nodes).map((s) => s.guid);
}

// ── Navisworks test attribute → engine operator ───────────────────────────────

const TEST_MAP: Record<string, EngineCondition['operator']> = {
  equals:         'equals',
  notequals:      'notEquals',
  'not-equals':   'notEquals',
  contains:       'contains',
  notcontains:    'notContains',
  'not-contains': 'notContains',
  wildcard:       'contains',  // approximate — treat wildcards as substring
  defined:        'defined',
  undefined:      'undefined',
};

// ── Navisworks property display-name → engine key ────────────────────────────
// These match the keys on the `Element` sub-object built by SearchQueryEngine.
const PROP_MAP: Record<string, string> = {
  type:          'type',
  'type name':   'type',
  name:          'name',
  objecttype:    'objectType',
  'object type': 'objectType',
  description:   'description',
  tag:           'tag',
  id:            'expressID',
};

function normalizeProperty(displayName: string): string {
  const key = displayName.trim().toLowerCase();
  return PROP_MAP[key] ?? key;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Return direct child elements with the given tag name.
 * Using `el.children` (not querySelectorAll) so we only get immediate children —
 * `:scope` is unreliable in XML documents parsed via DOMParser.
 */
function directChildren(el: Element, tag: string): Element[] {
  const wanted = tag.toLowerCase();
  return Array.from(el.children).filter(
    (c) => (c.localName ?? c.tagName).toLowerCase() === wanted,
  );
}

function directChildrenAny(el: Element, tags: string[]): Element[] {
  const wanted = new Set(tags.map((t) => t.toLowerCase()));
  return Array.from(el.children).filter(
    (c) => wanted.has((c.localName ?? c.tagName).toLowerCase()),
  );
}

const SET_NODE_TAGS = ['selectionset', 'searchset'];
const FOLDER_NODE_TAGS = ['viewfolder'];
const TREE_NODE_TAGS = [...SET_NODE_TAGS, ...FOLDER_NODE_TAGS];

function hasAncestorWithLocalName(el: Element, tags: string[], stopAt?: Element): boolean {
  const wanted = new Set(tags.map((t) => t.toLowerCase()));
  let cur: Element | null = el.parentElement;
  while (cur && cur !== stopAt) {
    if (wanted.has((cur.localName ?? cur.tagName).toLowerCase())) return true;
    cur = cur.parentElement;
  }
  return false;
}

function firstOwnedDescendantByLocalName(owner: Element, tag: string): Element | null {
  const candidates = descendantsByLocalName(owner, tag);
  for (const el of candidates) {
    // Ignore descendants that live inside a nested tree-node subtree.
    if (!hasAncestorWithLocalName(el, TREE_NODE_TAGS, owner)) {
      return el;
    }
  }
  return null;
}

function isOwnedSetDescendant(owner: Element, candidate: Element): boolean {
  if (candidate === owner) return false;
  let cur: Element | null = candidate.parentElement;
  while (cur) {
    if (cur === owner) return true;
    const name = (cur.localName ?? cur.tagName).toLowerCase();
    if (TREE_NODE_TAGS.includes(name)) return false;
    cur = cur.parentElement;
  }
  return false;
}

function childSetElements(owner: Element): Element[] {
  const direct = directChildrenAny(owner, TREE_NODE_TAGS);
  if (direct.length > 0) return direct;

  // Fallback: child tree nodes wrapped in non-tree containers under this owner.
  return descendantsByLocalName(owner, '*')
    .filter((el) => TREE_NODE_TAGS.includes((el.localName ?? el.tagName).toLowerCase()))
    .filter((el) => isOwnedSetDescendant(owner, el));
}

function topLevelSetElements(container: Element): Element[] {
  const direct = directChildrenAny(container, TREE_NODE_TAGS);
  if (direct.length > 0) return direct;

  // Fallback: some exporters wrap tree nodes in extra nodes. Find descendants
  // that are not nested under another tree node, and treat them as top-level roots.
  return descendantsByLocalName(container, '*')
    .filter((el) => TREE_NODE_TAGS.includes((el.localName ?? el.tagName).toLowerCase()))
    .filter((el) => !hasAncestorWithLocalName(el, TREE_NODE_TAGS, container));
}

/** Return all descendant elements matching a local tag name (namespace-agnostic). */
function descendantsByLocalName(root: ParentNode, tag: string): Element[] {
  const wanted = tag.toLowerCase();
  if (wanted === '*') {
    return Array.from(root.querySelectorAll('*')) as Element[];
  }
  return Array.from(root.querySelectorAll('*')).filter(
    (el) => ((el as Element).localName ?? (el as Element).tagName).toLowerCase() === wanted,
  ) as Element[];
}

/** Return first descendant element matching a local tag name (namespace-agnostic). */
function firstDescendantByLocalName(root: ParentNode, tag: string): Element | null {
  return descendantsByLocalName(root, tag)[0] ?? null;
}

// ── Condition parser ──────────────────────────────────────────────────────────

function parseConditionElement(el: Element): EngineCondition | null {
  const test = el.getAttribute('test')?.toLowerCase() ?? 'equals';
  const operator = TEST_MAP[test] ?? 'equals';

  const categoryName = firstDescendantByLocalName(firstDescendantByLocalName(el, 'category') ?? el, 'name')
    ?.textContent?.trim() ?? 'Element';
  const propertyName = firstDescendantByLocalName(firstDescendantByLocalName(el, 'property') ?? el, 'name')
    ?.textContent?.trim() ?? '';
  const valueText = firstDescendantByLocalName(firstDescendantByLocalName(el, 'value') ?? el, 'data')
    ?.textContent?.trim() ?? '';

  if (!propertyName) return null;

  return {
    type: 'condition',
    category: categoryName,
    property: normalizeProperty(propertyName),
    operator,
    ...(operator !== 'defined' && operator !== 'undefined' ? { value: valueText } : {}),
  };
}

function parseFindspec(findspec: Element): EngineGroup {
  const modeAttr = findspec.getAttribute('mode')?.toLowerCase() ?? 'all';
  const logic: 'and' | 'or' = modeAttr === 'any' ? 'or' : 'and';

  const rules: (EngineCondition | EngineGroup)[] = [];

  // Use a flat descendant query rather than :scope (unreliable in XML DOMParser docs).
  const condEls = descendantsByLocalName(findspec, 'condition');

  for (const el of condEls) {
    const cond = parseConditionElement(el);
    if (cond) rules.push(cond);
  }

  return { logic, rules };
}

// ── Recursive node parser ─────────────────────────────────────────────────────

/**
 * Parse a single `<selectionset>` element.
 *
 * A `<selectionset>` is a **leaf** if it has a direct `<findspec>` child.
 * It is a **folder** if it has no `<findspec>` — its direct `<selectionset>`
 * children are parsed recursively to preserve arbitrary nesting depth.
 */
function parseSelectionSetEl(el: Element): ParsedNode {
  const tagName = (el.localName ?? el.tagName).toLowerCase();
  const name = el.getAttribute('name')?.trim() || 'Untitled';
  const guid = el.getAttribute('guid')?.trim() || crypto.randomUUID();

  if (tagName === 'viewfolder') {
    const children = childSetElements(el).map(parseSelectionSetEl);
    return {
      type: 'folder',
      guid,
      name,
      children,
    };
  }

  // Most files put <findspec> directly under the set node, but some exporters
  // wrap it (e.g. <findspecs><findspec>...</findspec></findspecs>).
  const directFindspec = directChildren(el, 'findspec')[0] ?? null;
  const wrappedFindspec =
    directChildren(el, 'findspecs')
      .flatMap((group) => directChildren(group, 'findspec'))[0] ?? null;
  // Fallback for unusual wrappers, but only if the findspec belongs to THIS node
  // (not a nested child set), otherwise folder nodes collapse into leaves.
  const descendantFindspec = firstOwnedDescendantByLocalName(el, 'findspec');
  const findspec = directFindspec ?? wrappedFindspec ?? descendantFindspec;

  if (findspec) {
    const mode = (findspec.getAttribute('mode') === 'any' ? 'any' : 'all') as 'all' | 'any';
    const conditionCount = descendantsByLocalName(el, 'condition').length;
    const conditions = parseFindspec(findspec);
    return { type: 'set', guid, name, conditionCount, mode, conditions };
  }

  const childSetEls = childSetElements(el);
  return {
    type: 'folder',
    guid,
    name,
    children: childSetEls.map(parseSelectionSetEl),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse a Navisworks-style search-set XML string.
 *
 * Tolerates files that wrap sets under either `<exchange><selectionsets>`
 * (Navisworks export) or a bare `<selectionsets>` root. Throws
 * `XmlParseError` for malformed XML or files with zero leaf sets.
 *
 * The returned tree preserves folder/group nesting exactly as it appears in
 * the source XML. `<selectionset>` nodes without a `<findspec>` child are
 * treated as folders; those with a `<findspec>` are leaf search sets.
 */
export function parseSearchSetsXml(xmlText: string, fileName: string): ParsedImportFile {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseError = firstDescendantByLocalName(doc, 'parsererror');
  if (parseError) {
    throw new XmlParseError(`Malformed XML: ${parseError.textContent?.trim() ?? 'unknown error'}`);
  }

  const container = firstDescendantByLocalName(doc, 'selectionsets');
  if (!container) {
    throw new XmlParseError('No <selectionsets> element found in file.');
  }

  const topLevelEls = topLevelSetElements(container);
  const children = topLevelEls.map(parseSelectionSetEl);

  if (collectLeafSets(children).length === 0) {
    throw new XmlParseError('No <selectionset> elements with conditions found in file.');
  }

  // Strip path + extension so the folder label reads "sample-search-sets"
  // rather than "sample-search-sets.xml" or a full path.
  const cleanName = fileName.replace(/^.*[\\/]/, '').replace(/\.xml$/i, '');

  return { fileName: cleanName, children };
}
