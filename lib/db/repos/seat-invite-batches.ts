import "server-only";
import {randomUUID} from "node:crypto";
import {and, asc, desc, eq, inArray, isNull, lt} from "drizzle-orm";
import {z} from "zod";
import {getDb, type Database} from "@/lib/db/repos/common";
import {createSeatService, seatServiceDependencies, SeatServiceError, type SeatServiceDependencies} from "@/lib/db/repos/seats";
import {portalSeatBatches, portalSeatBatchItems, auditEvents, profiles, companyMembers} from "@/lib/db/server-schema";
import {requireMember, forbidden, type Actor} from "@/lib/membership/lifecycle";
import type {SeatBatchStore, SeatBatchView, SeatInviteRow} from "@/lib/portal/seat-bulk-contract";

type Member = Extract<Actor, {kind: "member"}>;
type Batch = typeof portalSeatBatches.$inferSelect;
type Context = {available: number; seatLimit: number; pendingEmails: ReadonlySet<string>; role: "owner" | "admin"};
const retryCodes = ["SEAT_LIMIT_REACHED", "ROLE_POLICY"];
const id = z.string().uuid();
const rowInput = z.object({position: z.number().int().min(1).max(50), email: z.string().max(254), role: z.enum(["member", "admin", "owner"]),
  issue: z.enum(["INVALID_EMAIL", "INVALID_ROLE", "DUPLICATE"]).nullable()}).strict();
async function withManager<T>(actor: Actor, companyId: string, run: (tx: Database, seats: SeatServiceDependencies, context: Context) => Promise<T>) {
  requireMember(actor); id.parse(companyId);
  const seats = await seatServiceDependencies();
  return seats.withCompanyTransaction(companyId, async (transaction) => {
    const company = await seats.getCompany(actor, companyId, transaction);
    if (!company) forbidden();
    const members = await seats.listMembers(companyId, transaction);
    const manager = members.find((row) => row.userId === actor.profileId && row.revokedAt === null);
    if (!manager || (manager.role !== "owner" && manager.role !== "admin")) forbidden();
    const pending = await seats.listPendingInvitations(companyId, transaction);
    return run(transaction as Database, seats, {available: Math.max(0, company.seatLimit - members.length - pending.length), seatLimit: company.seatLimit,
      pendingEmails: new Set(pending.map((row) => row.invitedEmail.trim().toLowerCase())), role: manager.role});
  });
}
async function readBatch(tx: Database, companyId: string, batchId: string): Promise<Batch> {
  id.parse(batchId);
  const rows = await tx.select().from(portalSeatBatches).where(and(eq(portalSeatBatches.id, batchId), eq(portalSeatBatches.companyId, companyId))).limit(1).for("update");
  if (!rows[0]) throw new Error("BATCH_NOT_FOUND");
  return rows[0];
}
function requireCreator(actor: Member, batch: Batch) {if (actor.profileId !== batch.actorProfileId || actor.userId !== batch.actorAuthUserId) forbidden();}
async function view(tx: Database, actor: Member, batch: Batch, context: Context): Promise<SeatBatchView> {
  const rows = await tx.select({itemId: portalSeatBatchItems.id, position: portalSeatBatchItems.position, email: portalSeatBatchItems.email,
    role: portalSeatBatchItems.role, state: portalSeatBatchItems.state, code: portalSeatBatchItems.errorCode, attemptCount: portalSeatBatchItems.attemptCount,
    claimExpiresAt: portalSeatBatchItems.claimExpiresAt}).from(portalSeatBatchItems).where(eq(portalSeatBatchItems.batchId, batch.id)).orderBy(asc(portalSeatBatchItems.position)).limit(50);
  return {batchId: batch.id, companyId: batch.companyId, state: batch.state, available: context.available,
    canCommit: actor.profileId === batch.actorProfileId && actor.userId === batch.actorAuthUserId && (batch.state === "committed" || batch.expiresAt > new Date()), expiresAt: batch.expiresAt.toISOString(),
    items: rows.map((row) => {
      const expiredClaim = row.state === "sending" && row.claimExpiresAt !== null && row.claimExpiresAt <= new Date();
      return {itemId: row.itemId, position: row.position, email: row.email, role: row.role, state: expiredClaim ? "uncertain" : row.state,
        code: expiredClaim ? "DELIVERY_UNCERTAIN" : row.code, retryable: row.state === "failed" && retryCodes.includes(row.code ?? "") && row.attemptCount < 5};
    })};
}
async function audit(tx: Database, actor: Member, action: string, batch: Batch, metadata: Record<string, unknown> = {}) {
  await tx.insert(auditEvents).values({actorUserId: actor.profileId, actorType: "member", action, targetType: "seat_batch", targetId: batch.id,
    metadata: {companyId: batch.companyId, ...metadata}});
}
function previewIssue(row: SeatInviteRow, memberEmails: ReadonlySet<string>, context: Context) {
  if (row.issue) return row.issue;
  if (!z.string().email().safeParse(row.email).success) return "INVALID_EMAIL";
  if (row.role === "owner" && context.role !== "owner") return "ROLE_POLICY";
  if (memberEmails.has(row.email)) return "MEMBERSHIP_EXISTS";
  if (context.pendingEmails.has(row.email)) return "ALREADY_PENDING";
  return null;
}

export const seatInviteBatchesRepository: SeatBatchStore = {
  async preview(actor, input) {
    requireMember(actor);
    const locale = z.enum(["en", "zh-HK"]).parse(input.locale);
    const rows = z.array(rowInput).min(1).max(50).parse(input.rows);
    if (new Set(rows.map((row) => row.position)).size !== rows.length) throw new Error("INVALID_INPUT");
    return withManager(actor, input.companyId, async (tx, _seats, context) => {
      const [batch] = await tx.insert(portalSeatBatches).values({companyId: input.companyId, actorProfileId: actor.profileId, actorAuthUserId: actor.userId,
        locale, expiresAt: new Date(Date.now() + 30 * 60_000)}).returning();
      const items = [];
      const emails = new Set<string>();
      const memberRows = await tx.select({email: profiles.email}).from(companyMembers).innerJoin(profiles, eq(profiles.id, companyMembers.userId))
        .where(and(eq(companyMembers.companyId, input.companyId), isNull(companyMembers.revokedAt)));
      const memberEmails = new Set(memberRows.flatMap((row) => row.email ? [row.email.trim().toLowerCase()] : []));
      for (const row of rows) {
        const email = row.email.trim().toLowerCase();
        const errorCode = emails.has(email) ? "DUPLICATE" : previewIssue({...row, email}, memberEmails, context);
        emails.add(email);
        items.push({batchId: batch.id, position: row.position, email, role: row.role, state: errorCode ? "blocked" as const : "preview" as const, errorCode});
      }
      await tx.insert(portalSeatBatchItems).values(items);
      await audit(tx, actor, "seat.batch.previewed", batch, {count: rows.length});
      return view(tx, actor, batch, context);
    });
  },
  async read(actor, input) {
    requireMember(actor);
    return withManager(actor, input.companyId, async (tx, _seats, context) => view(tx, actor, await readBatch(tx, input.companyId, input.batchId), context));
  },
  async commit(actor, input) {
    requireMember(actor); id.parse(input.requestId);
    const selectedIds = z.array(id).min(1).max(50).parse(input.selectedItemIds);
    if (new Set(selectedIds).size !== selectedIds.length) throw new Error("INVALID_INPUT");
    return withManager(actor, input.companyId, async (tx, _seats, context) => {
      const batch = await readBatch(tx, input.companyId, input.snapshotId);
      requireCreator(actor, batch);
      if (batch.state === "committed") return view(tx, actor, batch, context);
      if (batch.expiresAt <= new Date()) throw new Error("BATCH_EXPIRED");
      const selected = await tx.select().from(portalSeatBatchItems).where(and(eq(portalSeatBatchItems.batchId, batch.id), inArray(portalSeatBatchItems.id, selectedIds)));
      if (selected.length !== selectedIds.length || selected.some((row) => row.state !== "preview" || row.errorCode)) throw new Error("INVALID_INPUT");
      if (selected.some((row) => row.role !== "member") && input.confirmElevated !== true) throw new Error("ELEVATED_CONFIRMATION_REQUIRED");
      if (selected.some((row) => row.role === "owner") && context.role !== "owner") forbidden();
      if (selected.length > context.available) throw new Error("SEAT_LIMIT_REACHED");
      const request = await tx.select({id: portalSeatBatches.id}).from(portalSeatBatches)
        .where(and(eq(portalSeatBatches.actorProfileId, actor.profileId), eq(portalSeatBatches.requestId, input.requestId))).limit(1);
      if (request.length) throw new Error("BATCH_REQUEST_CONFLICT");
      await tx.update(portalSeatBatchItems).set({state: "skipped", errorCode: "NOT_SELECTED"}).where(and(eq(portalSeatBatchItems.batchId, batch.id), eq(portalSeatBatchItems.state, "preview")));
      await tx.update(portalSeatBatchItems).set({state: "pending", errorCode: null}).where(and(eq(portalSeatBatchItems.batchId, batch.id), inArray(portalSeatBatchItems.id, selectedIds)));
      const [committed] = await tx.update(portalSeatBatches).set({state: "committed", requestId: input.requestId}).where(eq(portalSeatBatches.id, batch.id)).returning();
      await audit(tx, actor, "seat.batch.committed", committed, {count: selectedIds.length, elevatedConfirmed: input.confirmElevated});
      return view(tx, actor, committed, context);
    });
  },
  async retry(actor, input) {
    requireMember(actor);
    return withManager(actor, input.companyId, async (tx, _seats, context) => {
      const batch = await readBatch(tx, input.companyId, input.batchId); requireCreator(actor, batch);
      if (batch.state !== "committed") throw new Error("INVALID_INPUT");
      const retried = await tx.update(portalSeatBatchItems).set({state: "pending", errorCode: null, finishedAt: null})
        .where(and(eq(portalSeatBatchItems.batchId, batch.id), eq(portalSeatBatchItems.state, "failed"), inArray(portalSeatBatchItems.errorCode, retryCodes), lt(portalSeatBatchItems.attemptCount, 5))).returning({id: portalSeatBatchItems.id});
      await audit(tx, actor, "seat.batch.retried", batch, {count: retried.length});
      return view(tx, actor, batch, context);
    });
  },
  async prepareNext(actor, input) {
    requireMember(actor);
    return withManager(actor, input.companyId, async (tx, seats) => {
      const batch = await readBatch(tx, input.companyId, input.batchId); requireCreator(actor, batch);
      if (batch.state !== "committed") throw new Error("INVALID_INPUT");
      const [item] = await tx.select().from(portalSeatBatchItems).where(and(eq(portalSeatBatchItems.batchId, batch.id), eq(portalSeatBatchItems.state, "pending")))
        .orderBy(asc(portalSeatBatchItems.position)).limit(1).for("update");
      if (!item) return false;
      const service = createSeatService({...seats, withCompanyTransaction: async (_companyId, work) => work(tx)});
      try {
        // The existing service and this outbox share one transaction and the membership lock.
        const invitation = await service.inviteSeat(actor, input.companyId, {email: item.email, role: item.role});
        await tx.update(portalSeatBatchItems).set({state: invitation.token ? "delivery_pending" : "skipped", errorCode: invitation.token ? null : "ALREADY_PENDING",
          invitationId: invitation.id, deliveryToken: invitation.token || null, attemptCount: item.attemptCount + 1}).where(eq(portalSeatBatchItems.id, item.id));
        await audit(tx, actor, "seat.batch.invitation_prepared", batch, {itemId: item.id, invitationId: invitation.id, queued: Boolean(invitation.token)});
      } catch (error) {
        if (!(error instanceof SeatServiceError) || !["SEAT_LIMIT_REACHED", "ROLE_POLICY", "MEMBERSHIP_EXISTS"].includes(error.code)) throw error;
        await tx.update(portalSeatBatchItems).set({state: error.code === "MEMBERSHIP_EXISTS" ? "skipped" : "failed", errorCode: error.code,
          attemptCount: item.attemptCount + 1, finishedAt: new Date()}).where(eq(portalSeatBatchItems.id, item.id));
        await audit(tx, actor, "seat.batch.item_blocked", batch, {itemId: item.id, code: error.code});
      }
      return true;
    });
  },
  async cancel(actor, input) {
    requireMember(actor);
    return withManager(actor, input.companyId, async (tx, seats, context) => {
      const batch = await readBatch(tx, input.companyId, input.batchId); requireCreator(actor, batch);
      if (batch.state !== "committed") throw new Error("INVALID_INPUT");
      const items = await tx.select().from(portalSeatBatchItems).where(and(eq(portalSeatBatchItems.batchId, batch.id), inArray(portalSeatBatchItems.state, ["pending", "delivery_pending"]))).for("update");
      const service = createSeatService({...seats, withCompanyTransaction: async (_companyId, work) => work(tx)});
      for (const item of items) {
        const invitation = item.invitationId ? await seats.getInvitation?.(item.invitationId, tx) : null;
        if (invitation && !invitation.acceptedAt && !invitation.revokedAt) await service.revokeInvitation(actor, invitation.id);
        await tx.update(portalSeatBatchItems).set({state: "skipped", errorCode: "CANCELLED_BEFORE_SEND", deliveryToken: null, finishedAt: new Date()}).where(eq(portalSeatBatchItems.id, item.id));
      }
      await audit(tx, actor, "seat.batch.pending_cancelled", batch, {count: items.length});
      const used = (await seats.listMembers(input.companyId, tx)).length + (await seats.listPendingInvitations(input.companyId, tx)).length;
      return view(tx, actor, batch, {...context, available: Math.max(0, context.seatLimit - used)});
    });
  },
  async claimDelivery(actor, input) {
    requireMember(actor);
    return withManager(actor, input.companyId, async (tx, seats) => {
      const batch = await readBatch(tx, input.companyId, input.batchId); requireCreator(actor, batch);
      if (batch.state !== "committed") throw new Error("INVALID_INPUT");
      await tx.update(portalSeatBatchItems).set({state: "uncertain", errorCode: "DELIVERY_UNCERTAIN", deliveryToken: null, finishedAt: new Date()})
        .where(and(eq(portalSeatBatchItems.batchId, batch.id), eq(portalSeatBatchItems.state, "sending"), lt(portalSeatBatchItems.claimExpiresAt, new Date())));
      const [item] = await tx.select().from(portalSeatBatchItems).where(and(eq(portalSeatBatchItems.batchId, batch.id), eq(portalSeatBatchItems.state, "delivery_pending")))
        .orderBy(asc(portalSeatBatchItems.position)).limit(1).for("update");
      if (!item) return null;
      const invitation = item.invitationId ? await seats.getInvitation?.(item.invitationId, tx) : null;
      const contextMembers = await seats.listMembers(input.companyId, tx);
      const role = contextMembers.find((row) => row.userId === actor.profileId && row.revokedAt === null)?.role;
      if (!invitation || invitation.companyId !== input.companyId || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date() || !item.deliveryToken || (item.role === "owner" && role !== "owner")) {
        await tx.update(portalSeatBatchItems).set({state: "skipped", errorCode: "INVITATION_UNAVAILABLE", deliveryToken: null, finishedAt: new Date()}).where(eq(portalSeatBatchItems.id, item.id));
        await audit(tx, actor, "seat.batch.delivery_skipped", batch, {itemId: item.id});
        return null;
      }
      const claimId = randomUUID();
      await tx.update(portalSeatBatchItems).set({state: "sending", claimId, claimExpiresAt: new Date(Date.now() + 120_000)})
        .where(eq(portalSeatBatchItems.id, item.id));
      await audit(tx, actor, "seat.batch.delivery_claimed", batch, {itemId: item.id});
      return {itemId: item.id, claimId, email: invitation.invitedEmail, token: item.deliveryToken, locale: batch.locale};
    });
  },
  async settleDelivery(actor, input) {
    requireMember(actor); id.parse(input.companyId); id.parse(input.batchId); id.parse(input.itemId); id.parse(input.claimId);
    const outcome = z.enum(["succeeded", "uncertain"]).parse(input.outcome);
    const db = await getDb();
    await db.transaction(async (transaction) => {
      const tx = transaction as unknown as Database;
      const batch = await readBatch(tx, input.companyId, input.batchId); requireCreator(actor, batch);
      // Persist an already-started send outcome even if management permission was revoked in flight.
      // The claim is a private server capability and is never accepted by a published action.
      const rows = await tx.update(portalSeatBatchItems).set({state: outcome, errorCode: outcome === "uncertain" ? "DELIVERY_UNCERTAIN" : null,
        deliveryToken: null, claimExpiresAt: null, finishedAt: new Date()})
        .where(and(eq(portalSeatBatchItems.batchId, batch.id), eq(portalSeatBatchItems.id, input.itemId), eq(portalSeatBatchItems.state, "sending"), eq(portalSeatBatchItems.claimId, input.claimId)))
        .returning({id: portalSeatBatchItems.id});
      if (rows.length) await audit(tx, actor, "seat.batch.delivery_settled", batch, {itemId: input.itemId, outcome});
    });
  },
};

export async function listRecentSeatInviteBatches(actor: Actor, companyId: string) {
  requireMember(actor);
  return withManager(actor, companyId, async (tx) => tx.select({id: portalSeatBatches.id, createdAt: portalSeatBatches.createdAt})
    .from(portalSeatBatches).where(and(eq(portalSeatBatches.companyId, companyId), eq(portalSeatBatches.state, "committed")))
    .orderBy(desc(portalSeatBatches.createdAt), desc(portalSeatBatches.id)).limit(10));
}
