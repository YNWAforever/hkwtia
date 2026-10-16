import "server-only";
import {createHash, randomUUID} from "node:crypto";

import {and, asc, desc, eq, isNull, sql} from "drizzle-orm";
import {z} from "zod";

import {routing} from "@/i18n/routing";
import {requireAdmin} from "@/lib/auth/authorize";
import {getDb, type Database} from "@/lib/db/repos/common";
import {auditEvents, pageCopy, pageCopyDrafts} from "@/lib/db/server-schema";
import type {PageCopyOverride} from "@/lib/i18n/apply-page-copy";
import {pageCopyCatalog, pageCopyEnglishRejection} from "@/lib/i18n/page-copy-catalog";
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
  revision: z.string().regex(/^[a-f0-9]{64}$/),
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

export type PageCopySaveResult = Readonly<{updated: number; cleared: number; revision: string}>;

export function pageCopyRevision(rows: readonly Pick<PageCopyEntry, "locale" | "keyPath" | "value">[]): string {
  const entries = rows.map(({locale, keyPath, value}) => [locale, keyPath, value] as const)
    .sort((a, b) => `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

type PageCopyAudit = Readonly<{
  actorUserId: string;
  actorType: AdminActor["kind"];
  action: "page_copy.updated";
  targetType: "page_copy";
  targetId: string;
  metadata: Record<string, unknown>;
}>;

export type PageCopyMutationDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  lockNamespace: (namespace: string) => Promise<void>;
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

type PageCopyTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export function pageCopyTransaction(tx: PageCopyTransaction): Parameters<Parameters<PageCopyMutationDependencies["transaction"]>[0]>[0] {
  return {
    lockNamespace: async (namespace) => { await tx.execute(sql`SELECT pg_advisory_xact_lock(73083322, hashtext(${namespace}))`); },
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
  };
}
async function defaultMutationDependencies(): Promise<PageCopyMutationDependencies> {
  const db = await getDb();
  return {transaction: work => db.transaction(tx => work(pageCopyTransaction(tx)))};
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
    await transaction.lockNamespace(parsed.namespace);
    const currentRows = await transaction.listForNamespace(parsed.namespace);
    if (pageCopyRevision(currentRows) !== parsed.revision) throw new Error("PAGE_COPY_EDIT_CONFLICT");
    const current = new Map(currentRows
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
        current.delete(identity);
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
      current.set(identity, entry.value);
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

    const revision = pageCopyRevision([...current].map(([identity, value]) => {
      const separator = identity.indexOf(":");
      return {locale: identity.slice(0, separator), keyPath: identity.slice(separator + 1), value};
    }));
    return {updated: updated.length, cleared: cleared.length, revision};
  });
}

export const pageCopyRepository = {
  listForLocale: listPageCopyForLocale,
  listForAdmin: listPageCopyForAdmin,
  save: savePageCopy,
};

// Private draft/publication lifecycle shares the existing namespace lock, catalog
// and published-copy transaction. Public readers never query this table.
type CopyDraftEntry = {locale: "en" | "zh-HK"; keyPath: string; value: string};
const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const draftSaveSchema = z.object({namespace: namespaceSchema, baseRevision: revisionSchema,
  changes: z.record(z.string(), z.string().trim().max(20_000)), expectedDraftRevision: revisionSchema.nullable(), rebase: z.boolean().optional()}).strict();
const draftPublishSchema = z.object({draftId: z.string().uuid(), expectedDraftRevision: revisionSchema,
  expectedPublishedRevision: revisionSchema}).strict();
function requireDraftEditor(actor: Actor): asserts actor is AdminActor {
  requireAdmin(actor);
  if (process.env.CMS_SERVER_DRAFTS_ENABLED !== "true") throw new Error("CMS_DRAFTS_DISABLED");
}
const freshRevision = () => createHash("sha256").update(randomUUID()).digest("hex");
function copySnapshot(namespace: PageCopyNamespace, rows: readonly PageCopyEntry[]): CopyDraftEntry[] {
  const stored = new Map(rows.map(row => [`${row.locale}:${row.keyPath}`, row.value]));
  return routing.locales.flatMap(locale => pageCopyCatalog(namespace).map(({keyPath}) => ({locale, keyPath, value: stored.get(`${locale}:${keyPath}`) ?? ""})));
}
function applyDraftChanges(namespace: PageCopyNamespace, entries: readonly CopyDraftEntry[], changes: Record<string,string>): CopyDraftEntry[] {
  const allowed = new Set(pageCopyCatalog(namespace).map(entry => entry.keyPath));
  if (Object.keys(changes).length > 2000) throw new Error("PAGE_COPY_TOO_MANY_CHANGES");
  for (const [identity,value] of Object.entries(changes)) {
    const separator=identity.indexOf(":"); const locale=identity.slice(0,separator), keyPath=identity.slice(separator+1);
    if (!routing.locales.some(item => item === locale) || !allowed.has(keyPath)) throw rejectionError(keyPath,"KEY_PATH_UNKNOWN");
    const rejection=value ? pageCopyEnglishRejection({namespace,keyPath,value}) : null;
    if(rejection) throw rejectionError(keyPath,rejection);
  }
  return entries.map(entry => ({...entry, value: changes[`${entry.locale}:${entry.keyPath}`] ?? entry.value}));
}
async function publishedCopyVersion(tx: PageCopyTransaction, namespace: PageCopyNamespace) {
  const rows=await pageCopyTransaction(tx).listForNamespace(namespace);
  const [latest]=await tx.select({id:pageCopyDrafts.id}).from(pageCopyDrafts)
    .where(and(eq(pageCopyDrafts.namespace,namespace),sql`${pageCopyDrafts.publishedAt} IS NOT NULL`))
    .orderBy(desc(pageCopyDrafts.publicationSequence)).limit(1);
  return {rows, revision:createHash("sha256").update(pageCopyRevision(rows)+":"+(latest?.id ?? "legacy")).digest("hex")};
}
export async function readCopyWorkspace(actor: Actor, namespaceValue: unknown) {
  requireDraftEditor(actor); const namespace=namespaceSchema.parse(namespaceValue); const db=await getDb();
  return db.transaction(async tx => {
    await pageCopyTransaction(tx).lockNamespace(namespace);
    const current=await publishedCopyVersion(tx,namespace);
    const [draft]=await tx.select().from(pageCopyDrafts).where(and(eq(pageCopyDrafts.namespace,namespace),eq(pageCopyDrafts.ownerProfileId,actor.profileId),isNull(pageCopyDrafts.publishedAt))).limit(1);
    const history=await tx.select({id:pageCopyDrafts.id,publishedAt:pageCopyDrafts.publishedAt}).from(pageCopyDrafts)
      .where(and(eq(pageCopyDrafts.namespace,namespace),sql`${pageCopyDrafts.publishedAt} IS NOT NULL`)).orderBy(desc(pageCopyDrafts.publicationSequence)).limit(20);
    return {revision:current.revision,published:copySnapshot(namespace,current.rows),draft:draft ?? null,history};
  });
}
export async function saveCopyDraft(actor: Actor, input: unknown) {
  requireDraftEditor(actor); const parsed=draftSaveSchema.parse(input); const db=await getDb();
  return db.transaction(async tx => {
    await pageCopyTransaction(tx).lockNamespace(parsed.namespace);
    const current=await publishedCopyVersion(tx,parsed.namespace);
    if(current.revision!==parsed.baseRevision)throw new Error("PAGE_COPY_EDIT_CONFLICT");
    const [existing]=await tx.select().from(pageCopyDrafts).where(and(eq(pageCopyDrafts.namespace,parsed.namespace),eq(pageCopyDrafts.ownerProfileId,actor.profileId),isNull(pageCopyDrafts.publishedAt))).for("update").limit(1);
    if((existing?.revision ?? null)!==parsed.expectedDraftRevision || existing && existing.baseRevision!==current.revision && !parsed.rebase)throw new Error("PAGE_COPY_EDIT_CONFLICT");
    const baseEntries=copySnapshot(parsed.namespace,current.rows);
    const submitted=applyDraftChanges(parsed.namespace,existing?.entries ?? baseEntries,parsed.changes);
    const oldBase=new Map(existing?.baseEntries.map(entry=>[`${entry.locale}:${entry.keyPath}`,entry.value]));
    const edited=new Map(submitted.map(entry=>[`${entry.locale}:${entry.keyPath}`,entry.value]));
    // Explicit rebase retains only this editor's changes against their saved
    // base; untouched fields adopt concurrent published changes.
    const entries=parsed.rebase && existing ? baseEntries.map(entry=>({...entry,value:edited.get(`${entry.locale}:${entry.keyPath}`)!==oldBase.get(`${entry.locale}:${entry.keyPath}`) ? edited.get(`${entry.locale}:${entry.keyPath}`)! : entry.value})) : submitted;
    if(existing && existing.baseRevision===current.revision && pageCopyRevision(existing.entries)===pageCopyRevision(entries))return {draftId:existing.id,revision:existing.revision,publishedRevision:current.revision};
    const revision=freshRevision();
    const [draft]=existing ? await tx.update(pageCopyDrafts).set({entries,baseEntries,baseRevision:current.revision,revision,updatedAt:new Date()}).where(eq(pageCopyDrafts.id,existing.id)).returning()
      : await tx.insert(pageCopyDrafts).values({ownerProfileId:actor.profileId,namespace:parsed.namespace,baseRevision:current.revision,revision,entries,baseEntries}).returning();
    await tx.insert(auditEvents).values({actorUserId:actor.profileId,actorType:actor.kind,action:"page_copy.draft_saved",targetType:"page_copy_draft",targetId:draft!.id,metadata:{namespace:parsed.namespace,changedKeys:Object.keys(parsed.changes)}});
    return {draftId:draft!.id,revision,publishedRevision:current.revision};
  });
}
export async function publishCopyDraft(actor: Actor, input: unknown) {
  requireDraftEditor(actor); const parsed=draftPublishSchema.parse(input); const db=await getDb();
  return db.transaction(async tx => {
    const [initial]=await tx.select({namespace:pageCopyDrafts.namespace}).from(pageCopyDrafts).where(and(eq(pageCopyDrafts.id,parsed.draftId),eq(pageCopyDrafts.ownerProfileId,actor.profileId))).limit(1);
    if(!initial)throw new Error("PAGE_COPY_DRAFT_NOT_FOUND"); const namespace=namespaceSchema.parse(initial.namespace);
    const adapter=pageCopyTransaction(tx); await adapter.lockNamespace(namespace);
    const [draft]=await tx.select().from(pageCopyDrafts).where(and(eq(pageCopyDrafts.id,parsed.draftId),eq(pageCopyDrafts.ownerProfileId,actor.profileId))).for("update").limit(1);
    if(!draft || draft.publishedAt || draft.revision!==parsed.expectedDraftRevision)throw new Error("PAGE_COPY_EDIT_CONFLICT");
    const current=await publishedCopyVersion(tx,namespace);
    if(current.revision!==parsed.expectedPublishedRevision || draft.baseRevision!==current.revision)throw new Error("PAGE_COPY_EDIT_CONFLICT");
    const result=await savePageCopy(actor,{namespace,revision:pageCopyRevision(current.rows),entries:draft.entries},{transaction: work => work(adapter)});
    await tx.update(pageCopyDrafts).set({previousEntries:copySnapshot(namespace,current.rows),publishedAt:new Date(),publicationSequence:sql`nextval('page_copy_publication_seq')`,updatedAt:new Date()}).where(eq(pageCopyDrafts.id,draft.id));
    await tx.insert(auditEvents).values({actorUserId:actor.profileId,actorType:actor.kind,action:"page_copy.published",targetType:"page_copy_draft",targetId:draft.id,metadata:{namespace,updated:result.updated,cleared:result.cleared}});
    return {...result,revision:(await publishedCopyVersion(tx,namespace)).revision};
  });
}
export async function restoreCopyPublication(actor: Actor, input: unknown) {
  requireDraftEditor(actor);
  const parsed=z.object({publicationId:z.string().uuid(),expectedPublishedRevision:revisionSchema,expectedDraftRevision:revisionSchema.nullable(),previous:z.boolean()}).strict().parse(input);
  const db=await getDb();
  return db.transaction(async tx => {
    const [source]=await tx.select().from(pageCopyDrafts).where(and(eq(pageCopyDrafts.id,parsed.publicationId),sql`${pageCopyDrafts.publishedAt} IS NOT NULL`)).limit(1);
    if(!source)throw new Error("PAGE_COPY_DRAFT_NOT_FOUND"); const namespace=namespaceSchema.parse(source.namespace);
    await pageCopyTransaction(tx).lockNamespace(namespace);
    const current=await publishedCopyVersion(tx,namespace);
    if(current.revision!==parsed.expectedPublishedRevision)throw new Error("PAGE_COPY_EDIT_CONFLICT");
    const [existing]=await tx.select().from(pageCopyDrafts).where(and(eq(pageCopyDrafts.namespace,namespace),eq(pageCopyDrafts.ownerProfileId,actor.profileId),isNull(pageCopyDrafts.publishedAt))).for("update").limit(1);
    if((existing?.revision ?? null)!==parsed.expectedDraftRevision)throw new Error("PAGE_COPY_EDIT_CONFLICT");
    const entries=parsed.previous ? source.previousEntries : source.entries;
    if(!entries)throw new Error("PAGE_COPY_HISTORY_UNAVAILABLE");
    const revision=freshRevision(); const baseEntries=copySnapshot(namespace,current.rows);
    const [draft]=existing ? await tx.update(pageCopyDrafts).set({entries,baseEntries,baseRevision:current.revision,revision,updatedAt:new Date()}).where(eq(pageCopyDrafts.id,existing.id)).returning()
      : await tx.insert(pageCopyDrafts).values({ownerProfileId:actor.profileId,namespace,baseRevision:current.revision,revision,entries,baseEntries}).returning();
    await tx.insert(auditEvents).values({actorUserId:actor.profileId,actorType:actor.kind,action:"page_copy.draft_restored",targetType:"page_copy_draft",targetId:draft!.id,metadata:{namespace,publicationId:source.id,previous:parsed.previous}});
    return {draftId:draft!.id,revision,publishedRevision:current.revision};
  });
}
export async function readPrivateCopyDraft(actor: Actor, idValue: unknown) {
  requireDraftEditor(actor); const id=z.string().uuid().parse(idValue); const db=await getDb();
  const [draft]=await db.select().from(pageCopyDrafts).where(and(eq(pageCopyDrafts.id,id),eq(pageCopyDrafts.ownerProfileId,actor.profileId),isNull(pageCopyDrafts.publishedAt))).limit(1);
  if(!draft)throw new Error("PAGE_COPY_DRAFT_NOT_FOUND");return draft;
}
