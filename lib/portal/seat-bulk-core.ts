import "server-only";
import {unstable_rethrow} from "next/navigation";
import {z} from "zod";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";
import type {SeatBatchStore, SeatDeliveryClaim, SeatInviteRow} from "@/lib/portal/seat-bulk-contract";

const id = z.string().uuid();
const target = z.object({companyId: id, batchId: id}).strict();
async function repository(store?: SeatBatchStore) {return store ?? (await import("@/lib/db/repos/seat-invite-batches")).seatInviteBatchesRepository;}
export function parseSeatInviteRows(input: string): SeatInviteRow[] {
  if (input.length > 20_000) throw new Error("BATCH_TOO_LARGE");
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("INVALID_INPUT");
  if (lines.length > 50) throw new Error("BATCH_TOO_LARGE");
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const [rawEmail, rawRole = "member", ...extra] = line.split(/[,\t]/);
    const email = rawEmail.trim().toLowerCase().slice(0, 254);
    const parsedRole = z.enum(["member", "admin", "owner"]).safeParse(rawRole.trim().toLowerCase());
    let issue: string | null = !z.string().email().max(254).safeParse(rawEmail.trim()).success ? "INVALID_EMAIL"
      : !parsedRole.success || extra.length ? "INVALID_ROLE" : seen.has(email) ? "DUPLICATE" : null;
    if (!email) issue = "INVALID_EMAIL";
    seen.add(email);
    return {position: index + 1, email, role: parsedRole.success ? parsedRole.data : "member", issue};
  });
}
export async function previewSeatInvites(actor: Actor, input: unknown, store?: SeatBatchStore) {
  requireMember(actor);
  const data = z.object({companyId: id, rows: z.string(), locale: z.enum(["en", "zh-HK"])}).strict().parse(input);
  return (await repository(store)).preview(actor, {...data, rows: parseSeatInviteRows(data.rows)});
}
export async function commitSeatInvites(actor: Actor, input: unknown, store?: SeatBatchStore) {
  requireMember(actor);
  const data = z.object({companyId: id, snapshotId: id, requestId: id, selectedItemIds: z.array(id).min(1).max(50).refine((ids) => new Set(ids).size === ids.length), confirmElevated: z.boolean()}).strict().parse(input);
  return (await repository(store)).commit(actor, data);
}
export async function retrySeatInvites(actor: Actor, input: unknown, store?: SeatBatchStore) {
  requireMember(actor);
  return (await repository(store)).retry(actor, target.parse(input));
}
export async function getSeatInviteBatch(actor: Actor, input: unknown, store?: SeatBatchStore) {
  requireMember(actor);
  return (await repository(store)).read(actor, target.parse(input));
}
export async function cancelPendingSeatInvites(actor: Actor, input: unknown, store?: SeatBatchStore) {
  requireMember(actor);
  return (await repository(store)).cancel(actor, target.parse(input));
}

/** A request processes a bounded slice. Durable sending claims are never automatically retaken. */
export async function runSeatInviteBatch(actor: Actor, input: unknown, deps: {store?: SeatBatchStore; deliver: (claim: SeatDeliveryClaim) => Promise<void>; now?: () => number}) {
  requireMember(actor);
  const data = target.parse(input);
  const store = await repository(deps.store);
  const now = deps.now ?? Date.now;
  const startedAt = now();
  for (let count = 0; count < 5 && now() - startedAt < 6_000; count++) {
    const prepared = await store.prepareNext(actor, data);
    const claim = await store.claimDelivery(actor, data);
    if (!claim) {if (!prepared) break; continue;}
    let outcome: "succeeded" | "uncertain" = "succeeded";
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([deps.deliver(claim), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error("DELIVERY_TIMEOUT")), 5_000);})]);
    } catch (error) {unstable_rethrow(error); outcome = "uncertain";}
    finally {if (timer) clearTimeout(timer);}
    // Failure here leaves a durable sending claim; the next read ages it into uncertain,
    // never into another delivery attempt. Do not catch this as a provider failure.
    await store.settleDelivery(actor, {...data, itemId: claim.itemId, claimId: claim.claimId, outcome});
  }
  return store.read(actor, data);
}
