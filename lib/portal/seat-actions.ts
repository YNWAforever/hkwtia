"use server";
import {revalidatePath} from "next/cache";
import {requireActor} from "@/lib/auth/actor";
import {auth} from "@/lib/auth/server";
import {appEnv} from "@/lib/config/env";
import {localizedPath} from "@/lib/urls";
import {runSeatMutation, seatMutationRepositories} from "@/lib/portal/seat-mutation-core";
import type {SeatActionState} from "@/lib/portal/seat-action-state";

function revalidateSeats() {
  for (const locale of ["en", "zh-HK"]) revalidatePath(`/${locale}/portal/company/seats`);
}
const noDelivery = async () => {throw new Error("INVITATION_DELIVERY_UNAVAILABLE");};
export async function inviteSeatAction(_state: SeatActionState, form: FormData): Promise<SeatActionState> {
  const actor = await requireActor();
  // Resolve server configuration before reserving a seat.
  const appUrl = appEnv().appUrl;
  const result = await runSeatMutation(actor, {kind: "invite", companyId: form.get("companyId"), email: form.get("email"), role: form.get("role") ?? "member", locale: form.get("locale") ?? "en"}, {
    ...seatMutationRepositories,
    deliver: async (invitation, locale) => {
      const url = new URL(localizedPath(locale, "/portal/company/seats/accept"), appUrl);
      url.searchParams.set("token", invitation.token);
      const delivery = await auth.signIn.magicLink({email: invitation.invitedEmail, callbackURL: url.toString()});
      if (delivery.error) throw new Error("INVITATION_DELIVERY_UNCERTAIN");
    },
  });
  revalidateSeats();
  return result;
}
export async function revokeSeatAction(_state: SeatActionState, form: FormData): Promise<SeatActionState> {
  const actor = await requireActor();
  const result = await runSeatMutation(actor, {kind: "revoke", companyId: form.get("companyId"), targetId: form.get("memberId")}, {...seatMutationRepositories, deliver: noDelivery});
  revalidateSeats(); return result;
}
export async function changeSeatRoleAction(_state: SeatActionState, form: FormData): Promise<SeatActionState> {
  const actor = await requireActor();
  const result = await runSeatMutation(actor, {kind: "changeRole", companyId: form.get("companyId"), targetId: form.get("memberId"), role: form.get("role")}, {...seatMutationRepositories, deliver: noDelivery});
  revalidateSeats(); return result;
}
export async function revokeInvitationAction(_state: SeatActionState, form: FormData): Promise<SeatActionState> {
  const actor = await requireActor();
  const result = await runSeatMutation(actor, {kind: "revokeInvitation", companyId: form.get("companyId"), targetId: form.get("invitationId")}, {...seatMutationRepositories, deliver: noDelivery});
  revalidateSeats(); return result;
}
