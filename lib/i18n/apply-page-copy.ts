import {isPageCopyNamespace, type PageCopyNamespace} from "@/lib/i18n/page-copy-scope";

export type PageCopyOverride = Readonly<{
  namespace: PageCopyNamespace;
  keyPath: string;
  value: string;
}>;

export type PageCopyLeaf = Readonly<{keyPath: string; value: string}>;

export type PageCopyRejection =
  | "NAMESPACE_NOT_EDITABLE"
  | "KEY_PATH_UNKNOWN"
  | "PLACEHOLDER_MISMATCH";

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return typeof value === "object" && value !== null;
}

/** Array indices arrive as path segments (`sections.0.body.1`), never as keys. */
function childOf(container: Container, segment: string): unknown {
  if (Array.isArray(container)) {
    return /^(?:0|[1-9]\d*)$/.test(segment) ? container[Number(segment)] : undefined;
  }
  return Object.hasOwn(container, segment) ? container[segment] : undefined;
}

function setChild(container: Container, segment: string, value: unknown): void {
  if (Array.isArray(container)) {
    container[Number(segment)] = value;
    return;
  }
  container[segment] = value;
}

/**
 * Shallow copy that preserves array-ness. A generic `{...value}` here would
 * turn `Privacy.sections` into an object keyed `"0"`, which type-checks, looks
 * right in a debugger, and silently breaks every `t.raw()` consumer.
 */
function cloneContainer(container: Container): Container {
  return Array.isArray(container) ? [...container] : {...container};
}

function segmentsOf(keyPath: string): readonly string[] {
  return keyPath.split(".");
}

/** Resolves a dotted path to its string leaf, or null if it is not one. */
export function readLeaf(root: unknown, keyPath: string): string | null {
  let cursor: unknown = root;
  for (const segment of segmentsOf(keyPath)) {
    if (!isContainer(cursor)) return null;
    cursor = childOf(cursor, segment);
  }
  return typeof cursor === "string" ? cursor : null;
}

/**
 * ICU argument names in a message. An override that drops or renames one turns
 * a formatted value into literal text at every call site, so the sets must match.
 */
export function icuPlaceholders(value: string): readonly string[] {
  return [...value.matchAll(/\{\s*([A-Za-z0-9_]+)/g)]
    .map((match) => match[1] as string)
    .sort();
}

function placeholdersMatch(a: string, b: string): boolean {
  const left = icuPlaceholders(a);
  const right = icuPlaceholders(b);
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

/** Every string leaf under a namespace, as dotted paths, in bundle order. */
export function pageCopyLeaves(bundle: unknown, namespace: string): readonly PageCopyLeaf[] {
  const leaves: PageCopyLeaf[] = [];
  function walk(node: unknown, path: readonly string[]): void {
    if (typeof node === "string") {
      leaves.push({keyPath: path.join("."), value: node});
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, [...path, String(index)]));
      return;
    }
    if (isContainer(node)) {
      for (const key of Object.keys(node)) walk(childOf(node, key), [...path, key]);
    }
  }
  if (!isContainer(bundle)) return leaves;
  walk(childOf(bundle, namespace), []);
  return leaves;
}

/**
 * Why an override may not be applied, or null if it may. An override can only
 * ever replace an existing string leaf: it can never add a key, change a shape,
 * or remove a section, so policy pages stay fixed in structure.
 */
export function pageCopyRejection(
  bundle: unknown,
  override: Readonly<{namespace: string; keyPath: string; value: string}>,
): PageCopyRejection | null {
  if (!isPageCopyNamespace(override.namespace)) return "NAMESPACE_NOT_EDITABLE";
  const current = readLeaf(bundle, `${override.namespace}.${override.keyPath}`);
  if (current === null) return "KEY_PATH_UNKNOWN";
  if (!placeholdersMatch(current, override.value)) return "PLACEHOLDER_MISMATCH";
  return null;
}

/**
 * Returns a bundle with the accepted overrides substituted in. The bundle is
 * the fallback: anything not overridden, and every override that fails
 * validation, keeps its shipped value.
 *
 * This is a path-walk over a structural clone, not a deep merge. Only the
 * containers along a changed path are copied; everything else is shared with
 * the input, which is safe because nothing here mutates the original.
 */
export function applyPageCopy<T>(bundle: T, overrides: readonly PageCopyOverride[]): T {
  if (!isContainer(bundle) || overrides.length === 0) return bundle;
  let working: Container | null = null;

  for (const override of overrides) {
    if (pageCopyRejection(bundle, override)) continue;
    working ??= cloneContainer(bundle);
    const segments = [override.namespace, ...segmentsOf(override.keyPath)];
    let parent = working;
    for (const segment of segments.slice(0, -1)) {
      const child = childOf(parent, segment);
      // Guaranteed a container: the path already resolved to a string leaf.
      const cloned = cloneContainer(child as Container);
      setChild(parent, segment, cloned);
      parent = cloned;
    }
    setChild(parent, segments[segments.length - 1] as string, override.value);
  }

  return (working ?? bundle) as T;
}
