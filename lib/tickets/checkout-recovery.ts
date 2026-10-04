import {createHash, randomBytes} from "node:crypto";

import type {Actor} from "@/lib/membership/lifecycle";

export type TicketRecoveryRecord = Readonly<{
  orderId: string; eventId: string; buyerProfileId: string | null;
  status: "pending" | "paid" | "expired" | "failed" | "refunded" | "refund_failed" | "refund_pending";
  seatCount: number; amountHkdCents: number; expiresAt: Date; recoveryExpiresAt: Date;
  stripeCheckoutSessionId: string | null; stripeCheckoutUrl: string | null;
}>;
export type TicketRecoverySummary = Readonly<{
  eventId: string; status: TicketRecoveryRecord["status"]; seatCount: number;
  amountHkdCents: number; expiresAt: string;
}>;
export type TicketRecoveryStore = Readonly<{
  read: (digest: string, now: Date) => Promise<TicketRecoveryRecord | null>;
  invalidate: (digest: string) => Promise<void>;
}>;
export type TicketRecoveryReadDependencies = Readonly<{store: TicketRecoveryStore; now: () => Date}>;
export type TicketRecoveryDependencies = TicketRecoveryReadDependencies & Readonly<{
  stripe: Readonly<{ticketSessionStatus: (sessionId: string) => Promise<"open" | "complete" | "expired">}>;
  orders: Readonly<{expireBySession: (sessionId: string, expectedOrderId: string) => Promise<boolean>; expireUnattachedOrder: (orderId: string) => Promise<boolean>}>;
}>;
export type TicketRecoveryInput = Readonly<{token: string; eventId: string; actor: Actor}>;
export type TicketRecoveryResumeResult =
  | Readonly<{status: "redirect"; url: string}>
  | Readonly<{status: "error"; code: "NOT_FOUND" | "UNAVAILABLE" | "RETRY_EXPIRED" | "ALREADY_COMPLETED"}>;

export function newRecoveryToken(): string {
  return randomBytes(32).toString("base64url");
}
export function recoveryDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function authorized(record: TicketRecoveryRecord, actor: Actor, eventId: string, now: Date): boolean {
  if (record.eventId !== eventId || record.recoveryExpiresAt <= now) return false;
  if (record.buyerProfileId !== null && (actor.kind !== "member" || actor.profileId !== record.buyerProfileId)) return false;
  return true;
}
async function verifiedRecord(input: TicketRecoveryInput, deps: TicketRecoveryReadDependencies): Promise<TicketRecoveryRecord | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) return null;
  const now = deps.now();
  const record = await deps.store.read(recoveryDigest(input.token), now);
  return record && authorized(record, input.actor, input.eventId, now) ? record : null;
}
export async function readTicketRecovery(input: TicketRecoveryInput, deps: TicketRecoveryReadDependencies): Promise<TicketRecoverySummary | null> {
  const record = await verifiedRecord(input, deps);
  if (!record) return null;
  return {eventId: record.eventId, status: record.status, seatCount: record.seatCount,
    amountHkdCents: record.amountHkdCents, expiresAt: record.expiresAt.toISOString()};
}
/** Local TTL/status alone cannot prove that an unknown provider attempt is safe to replace. */
export async function isProviderExpiredTicketRecovery(input: TicketRecoveryInput, deps: Pick<TicketRecoveryDependencies, "store" | "now" | "stripe">): Promise<boolean> {
  const record = await verifiedRecord(input, deps);
  if (record?.status !== "expired" || !record.stripeCheckoutSessionId) return false;
  return await deps.stripe.ticketSessionStatus(record.stripeCheckoutSessionId) === "expired";
}
export async function resumeTicketRecovery(input: TicketRecoveryInput, deps: TicketRecoveryDependencies): Promise<TicketRecoveryResumeResult> {
  const record = await verifiedRecord(input, deps);
  if (!record) return {status: "error", code: "NOT_FOUND"};
  if (record.status === "paid") return {status: "error", code: "ALREADY_COMPLETED"};
  if (record.status !== "pending") return {status: "error", code: "RETRY_EXPIRED"};
  if (!record.stripeCheckoutSessionId || !record.stripeCheckoutUrl) {
    if (record.expiresAt > deps.now()) return {status: "error", code: "UNAVAILABLE"};
    try {
      const expired = await deps.orders.expireUnattachedOrder(record.orderId);
      if (!expired) return {status: "error", code: "UNAVAILABLE"};
      await deps.store.invalidate(recoveryDigest(input.token));
      return {status: "error", code: "RETRY_EXPIRED"};
    } catch { return {status: "error", code: "UNAVAILABLE"}; }
  }
  try {
    const providerStatus = await deps.stripe.ticketSessionStatus(record.stripeCheckoutSessionId);
    if (providerStatus === "open") return {status: "redirect", url: record.stripeCheckoutUrl};
    if (providerStatus === "complete") return {status: "error", code: "ALREADY_COMPLETED"};
    const expired = await deps.orders.expireBySession(record.stripeCheckoutSessionId, record.orderId);
    if (!expired) return {status: "error", code: "UNAVAILABLE"};
    await deps.store.invalidate(recoveryDigest(input.token));
    return {status: "error", code: "RETRY_EXPIRED"};
  } catch { return {status: "error", code: "UNAVAILABLE"}; }
}
