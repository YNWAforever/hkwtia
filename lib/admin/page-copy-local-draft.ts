import {z} from "zod";
import {isPageCopyNamespace, type PageCopyNamespace} from "@/lib/i18n/page-copy-scope";

export type LocalCopyDraft = Readonly<{
  schemaVersion: 1; namespace: string; baseRevision: string; updatedAt: string;
  changes: Readonly<Record<string, string>>;
}>;
export type LocalCopyDraftLabels = Readonly<{
  saved: string; unavailable: string; available: string; restore: string; discard: string;
  conflict: string; compare: string; current: string; draft: string;
}>;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const ttl = 24 * 60 * 60 * 1000;
const schema = z.object({schemaVersion: z.literal(1), namespace: z.string(),
  baseRevision: z.string().regex(/^[a-f0-9]{64}$/), updatedAt: z.string().datetime(),
  changes: z.record(z.string().max(50_000))}).strict();

export function localCopyDraftKey(identity: string, namespace: PageCopyNamespace): string {
  if (!identity || !isPageCopyNamespace(namespace)) throw new Error("INVALID_COPY_DRAFT_SCOPE");
  return "hkwtia:cms-draft:v1:" + encodeURIComponent(identity) + ":" + namespace;
}

/** Pure decoding also supports a browser external-store snapshot without render-time writes. */
export function parseLocalCopyDraft(raw: string, namespace: PageCopyNamespace, allowedFields: ReadonlySet<string>, now = Date.now()): LocalCopyDraft | null {
  try {
    const parsed = raw.length <= 1_000_000 ? schema.safeParse(JSON.parse(raw)) : null;
    if (!parsed?.success || parsed.data.namespace !== namespace ||
      now - Date.parse(parsed.data.updatedAt) > ttl || Date.parse(parsed.data.updatedAt) > now + 60_000 ||
      Object.keys(parsed.data.changes).length === 0 || Object.keys(parsed.data.changes).some(field => !allowedFields.has(field))) return null;
    return parsed.data;
  } catch { return null; }
}

export function readLocalCopyDraft(store: Store, key: string, namespace: PageCopyNamespace, allowedFields: ReadonlySet<string>, now = Date.now()):
  Readonly<{status: "available"; draft: LocalCopyDraft} | {status: "missing" | "unavailable"}> {
  try {
    const raw = store.getItem(key);
    if (!raw) return {status: "missing"};
    const draft = parseLocalCopyDraft(raw, namespace, allowedFields, now);
    if (!draft) { store.removeItem(key); return {status: "missing"}; }
    return {status: "available", draft};
  } catch { return {status: "unavailable"}; }
}

export function writeLocalCopyDraft(store: Store, key: string, draft: LocalCopyDraft, allowedFields: ReadonlySet<string>): boolean {
  try {
    const parsed = schema.parse(draft);
    if (!isPageCopyNamespace(parsed.namespace) || Object.keys(parsed.changes).some(field => !allowedFields.has(field))) return false;
    if (!Object.keys(parsed.changes).length) store.removeItem(key);
    else {
      const value = JSON.stringify(parsed);
      if (value.length > 1_000_000) return false;
      store.setItem(key, value);
    }
    return true;
  } catch { return false; }
}

export function discardLocalCopyDraft(store: Store, key: string): boolean {
  try { store.removeItem(key); return true; } catch { return false; }
}
