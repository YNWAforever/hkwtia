import "server-only";

import {and, asc, eq} from "drizzle-orm";
import {z} from "zod";

import {routing} from "@/i18n/routing";
import {requireAdmin} from "@/lib/auth/actor";
import {getDb} from "@/lib/db/repos/common";
import {auditEvents, pageCopy} from "@/lib/db/server-schema";
import type {PageCopyOverride} from "@/lib/i18n/apply-page-copy";
import {pageCopyEnglishRejection} from "@/lib/i18n/page-copy-catalog";
import {pageCopyNamespaces, type PageCopyNamespace} from "@/lib/i18n/page-copy-scope";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const localeSchema = z.enum(routing.locales);
const namespaceSchema = z.enum(pageCopyNamespaces);
// Dotted path within a namespace; numeric segments address array members.
const keyPathSchema = z.string().trim().min(1).max(300)
  .regex(/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/);

// Both locales are saved in one call so a failure cannot leave English
// overridden while Chinese silently kept its previous value.
const saveInputSchema = z.object({
  namespace: namespaceSchema,
  // A cleared value removes the override so the page falls back to the bundle.
  entries: z.array(z.object({
    locale: localeSchema,
    keyPath: keyPathSchema,
    value: z.string().trim().max(20_000),
  }).strict()).max(2_000),
}).strict();

export type PageCopySaveInput = z.input<typeof saveInputSchema>;

export type PageCopyEntry = Readonly<{
  locale: string;
  namespace: string;
  keyPath: string;
  value: string;
}>;

export type PageCopySaveResult = Readonly<{updated: number; cleared: number}>;

type PageCopyAudit = Readonly<{
  actorUserId: string;
  actorType: AdminActor["kind"];
  action: "page_copy.updated";
  targetType: "page_copy";
  targetId: string;
  metadata: Record<string, unknown>;
}>;

export type PageCopyMutationDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  listForNamespace: (namespace: string) => Promise<readonly PageCopyEntry[]>;
  upsert: (row: Readonly<{
    locale: string;
    namespace: string;
    keyPath: string;
    value: string;
    updatedByProfileId: string;
  }>) => Promise<void>;
  remove: (locale: string, namespace: string, keyPath: string) => Promise<void>;
  insertAudit: (input: PageCopyAudit) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;

export type PageCopyReadDependencies = Readonly<{
  listForLocale: (locale: string) => Promise<readonly PageCopyEntry[]>;
  listAll: () => Promise<readonly PageCopyEntry[]>;
}>;

const projection = {
  locale: pageCopy.locale,
  namespace: pageCopy.namespace,
  keyPath: pageCopy.keyPath,
  value: pageCopy.value,
} as const;

async function defaultMutationDependencies(): Promise<PageCopyMutationDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    listForNamespace: async (namespace) => tx.select(projection).from(pageCopy)
      .where(eq(pageCopy.namespace, namespace)),
    upsert: async (row) => {
      await tx.insert(pageCopy).values(row).onConflictDoUpdate({
        target: [pageCopy.locale, pageCopy.namespace, pageCopy.keyPath],
        set: {
          value: row.value,
          updatedByProfileId: row.updatedByProfileId,
          updatedAt: new Date(),
        },
      });
    },
    remove: async (locale, namespace, keyPath) => {
      await tx.delete(pageCopy).where(and(
        eq(pageCopy.locale, locale),
        eq(pageCopy.namespace, namespace),
        eq(pageCopy.keyPath, keyPath),
      ));
    },
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

async function defaultReadDependencies(): Promise<PageCopyReadDependencies> {
  const db = await getDb();
  const ordered = () => db.select(projection).from(pageCopy)
    .orderBy(asc(pageCopy.namespace), asc(pageCopy.keyPath));
  return {
    listForLocale: async (locale) => db.select(projection).from(pageCopy)
      .where(eq(pageCopy.locale, locale))
      .orderBy(asc(pageCopy.namespace), asc(pageCopy.keyPath)),
    listAll: async () => ordered(),
  };
}

function rejectionError(keyPath: string, message: string): z.ZodError {
  return new z.ZodError([{
    code: z.ZodIssueCode.custom,
    path: [keyPath],
    message,
  }]);
}

/**
 * Reads the overrides for one locale. Unauthenticated by design: this feeds
 * `getRequestConfig`, and every value it returns is already public marketing
 * copy rendered on a public page.
 */
export async function listPageCopyForLocale(
  locale: string,
  dependencies?: PageCopyReadDependencies,
): Promise<readonly PageCopyOverride[]> {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return [];
  const rows = await (dependencies ?? await defaultReadDependencies()).listForLocale(parsed.data);
  // The merge re-validates, but dropping unknown namespaces here keeps a stale
  // row left behind by a narrowed allowlist from ever reaching the bundle.
  return rows.flatMap((row) => namespaceSchema.safeParse(row.namespace).success
    ? [{
      namespace: row.namespace as PageCopyNamespace,
      keyPath: row.keyPath,
      value: row.value,
    }]
    : []);
}

export async function listPageCopyForAdmin(
  actor: Actor,
  dependencies?: PageCopyReadDependencies,
): Promise<readonly PageCopyEntry[]> {
  requireAdmin(actor);
  return (dependencies ?? await defaultReadDependencies()).listAll();
}

/**
 * Replaces the overrides for one namespace across both locales in a single
 * transaction. Only the entries that actually differ are written, so re-saving
 * an untouched form is a no-op and the audit row records what a staff member
 * really changed.
 */
export async function savePageCopy(
  actor: Actor,
  input: unknown,
  dependencies?: PageCopyMutationDependencies,
): Promise<PageCopySaveResult> {
  requireAdmin(actor);
  const parsed = saveInputSchema.parse(input);

  // An override may only replace an existing English leaf. Anything else is a
  // tampered form: fail the save rather than silently dropping the field.
  const seen = new Set<string>();
  for (const entry of parsed.entries) {
    const identity = `${entry.locale}:${entry.keyPath}`;
    if (seen.has(identity)) throw rejectionError(entry.keyPath, "PAGE_COPY_KEY_DUPLICATED");
    seen.add(identity);
    if (entry.value === "") continue;
    const rejection = pageCopyEnglishRejection({
      namespace: parsed.namespace, keyPath: entry.keyPath, value: entry.value,
    });
    if (rejection) throw rejectionError(entry.keyPath, rejection);
  }

  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    const current = new Map((await transaction.listForNamespace(parsed.namespace))
      .map((row) => [`${row.locale}:${row.keyPath}`, row.value]));
    const updated: string[] = [];
    const cleared: string[] = [];

    for (const entry of parsed.entries) {
      const identity = `${entry.locale}:${entry.keyPath}`;
      const existing = current.get(identity);
      if (entry.value === "") {
        if (existing === undefined) continue;
        await transaction.remove(entry.locale, parsed.namespace, entry.keyPath);
        cleared.push(identity);
        continue;
      }
      if (existing === entry.value) continue;
      await transaction.upsert({
        locale: entry.locale,
        namespace: parsed.namespace,
        keyPath: entry.keyPath,
        value: entry.value,
        updatedByProfileId: actor.profileId,
      });
      updated.push(identity);
    }

    if (updated.length || cleared.length) {
      await transaction.insertAudit({
        actorUserId: actor.profileId,
        actorType: actor.kind,
        action: "page_copy.updated",
        targetType: "page_copy",
        targetId: parsed.namespace,
        metadata: {namespace: parsed.namespace, updated, cleared},
      });
    }

    return {updated: updated.length, cleared: cleared.length};
  });
}

export const pageCopyRepository = {
  listForLocale: listPageCopyForLocale,
  listForAdmin: listPageCopyForAdmin,
  save: savePageCopy,
};
