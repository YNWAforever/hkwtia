import "server-only";
import {unstable_rethrow} from "next/navigation";
import {z} from "zod";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";
import {inviteSeat, revokeSeat, revokeInvitation, changeSeatRole, type SeatRole} from "@/lib/db/repos/seats";
import {requireCompanySeatTarget} from "@/lib/portal/seat-target";
import type {SeatActionErrorKey, SeatActionState} from "@/lib/portal/seat-action-state";

const common = {companyId: z.string().uuid()};
const role = z.enum(["member", "admin", "owner"]);
const inputSchema = z.discriminatedUnion("kind", [
  z.object({...common, kind: z.literal("invite"), email: z.string().trim().email().max(254), role, locale: z.enum(["en", "zh-HK"])}),
  z.object({...common, kind: z.literal("revoke"), targetId: z.string().uuid()}),
  z.object({...common, kind: z.literal("changeRole"), targetId: z.string().uuid(), role}),
  z.object({...common, kind: z.literal("revokeInvitation"), targetId: z.string().uuid()}),
]);
export type SeatMutationDependencies = Readonly<{
  requireTarget: typeof requireCompanySeatTarget;
  invite: (actor: Actor, companyId: string, input: {email: string; role: SeatRole}) => Promise<{id: string; invitedEmail: string; token: string}>;
  deliver: (invitation: {id: string; invitedEmail: string; token: string}, locale: "en" | "zh-HK") => Promise<void>;
  revoke: typeof revokeSeat; revokeInvitation: typeof revokeInvitation; changeRole: typeof changeSeatRole;
}>;
export const seatMutationRepositories = {requireTarget: requireCompanySeatTarget, invite: inviteSeat, revoke: revokeSeat, revokeInvitation, changeRole: changeSeatRole};
const errors: Record<string, SeatActionErrorKey> = {FORBIDDEN: "forbidden", SEAT_LIMIT_REACHED: "seatLimitReached", LAST_OWNER_PROTECTION: "lastOwner", ROLE_POLICY: "rolePolicy",
  MEMBER_NOT_FOUND: "notFound", INVITATION_NOT_FOUND: "notFound", INVALID_ROLE: "invalidInput", INVALID_EMAIL: "invalidInput", MEMBERSHIP_EXISTS: "alreadyMember"};

export async function runSeatMutation(actor: Actor, input: unknown, deps: SeatMutationDependencies): Promise<SeatActionState> {
  requireMember(actor);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return {status: "error", code: "invalidInput"};
  const data = parsed.data;
  try {
    if (data.kind === "invite") {
      const invitation = await deps.invite(actor, data.companyId, {email: data.email, role: data.role});
      if (!invitation.token) return {status: "error", code: "alreadyPending"};
      try { await deps.deliver(invitation, data.locale); }
      catch (error) {
        unstable_rethrow(error);
        // A provider timeout can follow a delivered email. Keep the original invitation;
        // a repeated request returns the pending row and must not issue another token/send.
        console.error("PORTAL_SEAT_INVITATION_DELIVERY_UNCERTAIN");
        return {status: "error", code: "deliveryUncertain"};
      }
    } else {
      await deps.requireTarget(actor, data.companyId, {kind: data.kind === "revokeInvitation" ? "invitation" : "member", id: data.targetId});
      if (data.kind === "revoke") await deps.revoke(actor, data.targetId);
      else if (data.kind === "changeRole") await deps.changeRole(actor, data.targetId, data.role);
      else await deps.revokeInvitation(actor, data.targetId);
    }
    return {status: "success"};
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? errors[error.message] : undefined;
    if (!code) console.error("PORTAL_SEAT_MUTATION_UNAVAILABLE");
    return {status: "error", code: code ?? "generic"};
  }
}
