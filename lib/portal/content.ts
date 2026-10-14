import "server-only";

import type {EventRecord} from "@/content/schemas";
import {listReceipts, type Receipt} from "@/lib/billing/receipt-service";
import {listDirectoryPage, listMemberEventPage, type DirectoryQuery, type DirectoryPage, type MemberEventPage, type PageInput} from "@/lib/db/repos/portal-paging";
export type {DirectoryQuery, DirectoryRecord, DirectoryPage} from "@/lib/db/repos/portal-paging";
import {localizeEvent, type LocalizedEvent} from "@/lib/db/repos/events";
import type {Event} from "@/lib/db/server-schema";
import {requestMemberships} from "@/lib/portal/request-context";
import {requireMember, type Actor, type MembershipRecord} from "@/lib/membership/lifecycle";
import {isBenefitEligibleMembershipStatus} from "@/lib/membership/entitlements";
import {classifyPortalAccess, PortalAccessDenied} from "@/lib/portal/access-state";

type MemberActor = Extract<Actor, {kind: "member"}>;

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
  page: (actor: MemberActor, query?: DirectoryQuery | null, cursor?: string | null) => Promise<DirectoryPage>;
}>;

type EventReader = Readonly<{
  page: (actor: MemberActor, input?: PageInput) => Promise<Omit<MemberEventPage, "items"> & {items: readonly (EventRecord | Event | MemberEventPage["items"][number])[]}>;
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

function membershipIsDirectoryEligible(membership: MembershipRecord): boolean {
  return isBenefitEligibleMembershipStatus(membership.status);
}

async function requirePortalEntitlement(actor: Actor, dependencies: PortalContentDependencies): Promise<MemberActor> {
  requireMember(actor);
  const membershipsForActor = await dependencies.memberships.list(actor);
  const access = classifyPortalAccess(membershipsForActor);
  if (access.status !== "ready") throw new PortalAccessDenied({status: access.status});
  return actor;
}

const defaultPortalContentDependencies: PortalContentDependencies = {
  memberships: {list: requestMemberships},
  directory: {page: listDirectoryPage},
  events: {page: listMemberEventPage},
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
  return deps.directory.page(member, query, cursor);
}

export async function getMemberEventPage(actor: Actor, page: PageInput = {}, inputDependencies?: Partial<PortalContentDependencies>, locale = "en") {
  const deps = dependencies(inputDependencies);
  const member = await requirePortalEntitlement(actor, deps);
  const result = await deps.events.page(member, page);
  return {...result, items: result.items.map((event): EventRecord | LocalizedEvent => {
    if (!("titleEn" in event)) return event;
    return localizeEvent({...event, startsAt: new Date(event.startsAt), endsAt: event.endsAt ? new Date(event.endsAt) : null}, locale);
  })};
}

/** Compatibility for consumers of the bounded first page. */
export async function getMemberEvents(actor: Actor, inputDependencies?: Partial<PortalContentDependencies>, locale = "en"): Promise<Array<EventRecord | LocalizedEvent>> {
  return (await getMemberEventPage(actor, {}, inputDependencies, locale)).items;
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
