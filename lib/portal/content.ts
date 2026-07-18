import "server-only";

import {and, eq, isNull, or, sql} from "drizzle-orm";

import {events as publicEvents} from "@/content/events";
import type {EventRecord} from "@/content/schemas";
import {listReceipts, type Receipt} from "@/lib/billing/receipt-service";
import {companyMembers, companies, memberships, profiles} from "@/lib/db/server-schema";
import {getDb, requireMember} from "@/lib/db/repos/common";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import type {Actor, MembershipRecord} from "@/lib/membership/lifecycle";

type MemberActor = Extract<Actor, {kind: "member"}>;

const directoryStatuses = ["active", "past_due", "cancel_at_period_end"] as const;
const defaultPageSize = 20;
const maxPageSize = 50;

export type DirectoryQuery = string | Readonly<{
  search?: string;
  industry?: string;
  sizeBand?: string;
  limit?: number;
}>;

export type DirectoryRecord = Readonly<{
  userId: string;
  displayName: string;
  jobTitle: string | null;
  companyId: string | null;
  companyDisplayName: string | null;
  industry: string | null;
  sizeBand: string | null;
}>;

type DirectoryCandidate = DirectoryRecord & Readonly<{
  active: boolean;
  profileDirectoryVisible: boolean;
  companyDirectoryVisible: boolean;
}>;

export type DirectoryPage = Readonly<{
  items: readonly DirectoryRecord[];
  nextCursor: string | null;
}>;

export type DocumentItem = Readonly<{
  id: string;
  title: string;
  kind: "resource" | "receipt";
  url: string | null;
  issuedAt: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
}>;

type MembershipReader = Readonly<{
  list: (actor: Actor) => Promise<MembershipRecord[]>;
}>;

type DirectoryReader = Readonly<{
  list: (actor: MemberActor) => Promise<DirectoryCandidate[]>;
}>;

type EventReader = Readonly<{
  list: (actor: MemberActor) => Promise<EventRecord[]>;
}>;

type ReceiptLike = Pick<Receipt, "id" | "date" | "amount" | "currency" | "status" | "hostedInvoiceUrl">;

type DocumentReader = Readonly<{
  listApproved: (actor: MemberActor) => Promise<readonly DocumentItem[]>;
  listReceipts: (actor: MemberActor, membership: MembershipRecord) => Promise<readonly ReceiptLike[]>;
}>;

export type PortalContentDependencies = Readonly<{
  memberships: MembershipReader;
  directory: DirectoryReader;
  events: EventReader;
  documents: DocumentReader;
}>;

function normalizeSearch(query: DirectoryQuery | null | undefined): Readonly<{text: string; industry: string; sizeBand: string; limit: number}> {
  if (typeof query !== "object" || query === null) {
    return {text: typeof query === "string" ? query.trim().toLocaleLowerCase() : "", industry: "", sizeBand: "", limit: defaultPageSize};
  }
  const limit = Number.isFinite(query.limit) ? Math.min(maxPageSize, Math.max(1, Math.trunc(query.limit!))) : defaultPageSize;
  return {
    text: (query.search ?? "").trim().toLocaleLowerCase(),
    industry: (query.industry ?? "").trim().toLocaleLowerCase(),
    sizeBand: (query.sizeBand ?? "").trim().toLocaleLowerCase(),
    limit,
  };
}

type CursorPayload = Readonly<{displayName: string; userId: string; companyId: string}>;

function encodeCursor(record: DirectoryRecord): string {
  const payload: CursorPayload = {
    displayName: record.displayName.toLocaleLowerCase(),
    userId: record.userId,
    companyId: record.companyId ?? "",
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("INVALID_CURSOR");
    const value = parsed as Record<string, unknown>;
    if (typeof value.displayName !== "string" || typeof value.userId !== "string" || typeof value.companyId !== "string") {
      throw new Error("INVALID_CURSOR");
    }
    return {displayName: value.displayName, userId: value.userId, companyId: value.companyId};
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

function compareDirectoryRecords(left: DirectoryRecord, right: DirectoryRecord): number {
  const nameOrder = left.displayName.toLocaleLowerCase().localeCompare(right.displayName.toLocaleLowerCase(), "en");
  if (nameOrder !== 0) return nameOrder;
  const userOrder = left.userId.localeCompare(right.userId, "en");
  if (userOrder !== 0) return userOrder;
  return (left.companyId ?? "").localeCompare(right.companyId ?? "", "en");
}

function isAfterCursor(record: DirectoryRecord, cursor: CursorPayload): boolean {
  const name = record.displayName.toLocaleLowerCase();
  if (name !== cursor.displayName) return name.localeCompare(cursor.displayName, "en") > 0;
  const userOrder = record.userId.localeCompare(cursor.userId, "en");
  if (userOrder !== 0) return userOrder > 0;
  return (record.companyId ?? "").localeCompare(cursor.companyId, "en") > 0;
}

function matchesDirectoryQuery(record: DirectoryRecord, query: Readonly<{text: string; industry: string; sizeBand: string}>): boolean {
  if (query.industry && !(record.industry ?? "").toLocaleLowerCase().includes(query.industry)) return false;
  if (query.sizeBand && !(record.sizeBand ?? "").toLocaleLowerCase().includes(query.sizeBand)) return false;
  if (!query.text) return true;
  return [record.displayName, record.jobTitle, record.companyDisplayName, record.industry, record.sizeBand]
    .some((value) => (value ?? "").toLocaleLowerCase().includes(query.text));
}

function visibleDirectoryRecords(rows: readonly DirectoryCandidate[], query: Readonly<{text: string; industry: string; sizeBand: string}>): DirectoryRecord[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => row.active && row.profileDirectoryVisible && (row.companyId === null || row.companyDirectoryVisible))
    .filter((row) => matchesDirectoryQuery(row, query))
    .map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      jobTitle: row.jobTitle,
      companyId: row.companyId,
      companyDisplayName: row.companyDisplayName,
      industry: row.industry,
      sizeBand: row.sizeBand,
    }))
    .filter((record) => {
      const key = `${record.userId}:${record.companyId ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareDirectoryRecords);
}

function membershipIsDirectoryEligible(membership: MembershipRecord): boolean {
  return (directoryStatuses as readonly string[]).includes(membership.status);
}

async function requirePortalEntitlement(actor: Actor, dependencies: PortalContentDependencies): Promise<MemberActor> {
  requireMember(actor);
  const membershipsForActor = await dependencies.memberships.list(actor);
  if (!membershipsForActor.some(membershipIsDirectoryEligible)) throw new Error("MEMBERSHIP_INACTIVE");
  return actor;
}

async function listDirectoryRows(actor: MemberActor): Promise<DirectoryCandidate[]> {
  const db = await getDb();
  const activeMembership = sql`EXISTS (
    SELECT 1 FROM ${memberships} AS directory_membership
    WHERE directory_membership.status IN ('active', 'past_due', 'cancel_at_period_end')
      AND (
        directory_membership.owner_user_id = ${profiles.id}
        OR EXISTS (
          SELECT 1 FROM ${companyMembers} AS directory_membership_member
          WHERE directory_membership_member.company_id = directory_membership.company_id
            AND directory_membership_member.user_id = ${profiles.id}
            AND directory_membership_member.revoked_at IS NULL
        )
      )
  )`;
  const rows = await db
    .select({
      userId: profiles.id,
      displayName: profiles.displayName,
      jobTitle: profiles.jobTitle,
      companyId: companyMembers.companyId,
      companyDisplayName: companies.displayName,
      industry: companies.industry,
      sizeBand: companies.sizeBand,
      profileDirectoryVisible: profiles.directoryVisible,
      companyDirectoryVisible: companies.directoryVisible,
    })
    .from(profiles)
    .leftJoin(companyMembers, and(eq(companyMembers.userId, profiles.id), isNull(companyMembers.revokedAt)))
    .leftJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(and(
      activeMembership,
      eq(profiles.directoryVisible, true),
      or(isNull(companyMembers.id), eq(companies.directoryVisible, true)),
    ));
  void actor;
  return rows.map((row) => ({
    ...row,
    companyId: row.companyId ?? null,
    companyDisplayName: row.companyDisplayName ?? null,
    industry: row.industry ?? null,
    sizeBand: row.sizeBand ?? null,
    companyDirectoryVisible: row.companyId === null || row.companyDirectoryVisible === true,
    active: true,
  }));
}

const defaultPortalContentDependencies: PortalContentDependencies = {
  memberships: membershipsRepository,
  directory: {list: listDirectoryRows},
  events: {list: async () => publicEvents.map((event) => ({...event}))},
  documents: {
    listApproved: async () => [],
    listReceipts: async (actor, membership) => {
      if (!membership.stripeCustomerId) return [];
      try {
        return await listReceipts(actor, membership.id);
      } catch (error) {
        // Company members can view approved resources but cannot read owner-only billing receipts.
        if (error instanceof Error && error.message === "FORBIDDEN") return [];
        throw error;
      }
    },
  },
};

function dependencies(input?: Partial<PortalContentDependencies>): PortalContentDependencies {
  return {...defaultPortalContentDependencies, ...input};
}

/** Search only the opted-in, active member surface; all private fields are stripped before return. */
export async function searchDirectory(
  actor: Actor,
  query: DirectoryQuery | null = "",
  cursor: string | null = null,
  inputDependencies?: Partial<PortalContentDependencies>,
): Promise<DirectoryPage> {
  const deps = dependencies(inputDependencies);
  const member = await requirePortalEntitlement(actor, deps);
  const parsedQuery = normalizeSearch(query);
  const decodedCursor = decodeCursor(cursor);
  const records = visibleDirectoryRecords(await deps.directory.list(member), parsedQuery);
  const afterCursor = decodedCursor ? records.filter((record) => isAfterCursor(record, decodedCursor)) : records;
  const page = afterCursor.slice(0, parsedQuery.limit);
  return {
    items: page,
    nextCursor: afterCursor.length > parsedQuery.limit && page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
  };
}

/** Return typed public event records for an entitled member; locale is resolved by the caller via `namespace`. */
export async function getMemberEvents(
  actor: Actor,
  inputDependencies?: Partial<PortalContentDependencies>,
): Promise<EventRecord[]> {
  const deps = dependencies(inputDependencies);
  const member = await requirePortalEntitlement(actor, deps);
  const records = await deps.events.list(member);
  return records
    .filter((event) => new Date(event.startsAt).getTime() >= Date.now())
    .map(({slug, startsAt, endsAt, venue, image, namespace}) => ({slug, startsAt, endsAt, venue, image, namespace}))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function documentFromReceipt(receipt: ReceiptLike): DocumentItem {
  return {
    id: receipt.id,
    title: receipt.id,
    kind: "receipt",
    url: receipt.hostedInvoiceUrl,
    issuedAt: receipt.date,
    amount: receipt.amount,
    currency: receipt.currency,
    status: receipt.status,
  };
}

/** Combine approved WTIA resources with receipts owned by this actor's memberships. */
export async function getDocuments(
  actor: Actor,
  inputDependencies?: Partial<PortalContentDependencies>,
): Promise<DocumentItem[]> {
  const deps = dependencies(inputDependencies);
  const member = await requirePortalEntitlement(actor, deps);
  const membershipsForActor = (await deps.memberships.list(member)).filter(membershipIsDirectoryEligible);
  const [approved, receiptGroups] = await Promise.all([
    deps.documents.listApproved(member),
    Promise.all(membershipsForActor.map((membership) => deps.documents.listReceipts(member, membership))),
  ]);
  const resources = approved.map((document) => ({
    id: document.id,
    title: document.title,
    kind: "resource" as const,
    url: document.url,
    issuedAt: document.issuedAt,
    amount: null,
    currency: null,
    status: null,
  }));
  return [...resources, ...receiptGroups.flat().map(documentFromReceipt)];
}

export {defaultPortalContentDependencies};
