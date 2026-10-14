"use server";
import {revalidatePath} from "next/cache";
import {unstable_rethrow} from "next/navigation";
import {z} from "zod";
import {requireActor} from "@/lib/auth/actor";
import {auth} from "@/lib/auth/server";
import {appEnv} from "@/lib/config/env";
import {localizedPath} from "@/lib/urls";
import {previewSeatInvites, commitSeatInvites, getSeatInviteBatch, retrySeatInvites, runSeatInviteBatch, cancelPendingSeatInvites} from "@/lib/portal/seat-bulk-core";
import type {SeatBulkState} from "@/lib/portal/seat-bulk-contract";

export async function seatBulkAction(_state: SeatBulkState, form: FormData): Promise<SeatBulkState> {
  const actor = await requireActor();
  const companyId = String(form.get("companyId") ?? "");
  const batchId = String(form.get("batchId") ?? "");
  try {
    const operation = z.enum(["preview", "commit", "continue", "retry", "refresh", "cancel"]).parse(form.get("operation"));
    if (operation === "preview") return {status: "ready", view: await previewSeatInvites(actor, {companyId, rows: form.get("rows"), locale: form.get("locale")})};
    if (operation === "refresh") return {status: "ready", view: await getSeatInviteBatch(actor, {companyId, batchId})};
    if (operation === "cancel") {
      const view = await cancelPendingSeatInvites(actor, {companyId, batchId});
      for (const locale of ["en", "zh-HK"]) revalidatePath(`/${locale}/portal/company/seats`);
      return {status: "ready", view};
    }
    const appUrl = new URL(appEnv().appUrl).origin;
    if (operation === "commit") await commitSeatInvites(actor, {companyId, snapshotId: batchId, requestId: form.get("requestId"), selectedItemIds: form.getAll("itemId"), confirmElevated: form.get("confirmElevated") === "on"});
    if (operation === "retry") await retrySeatInvites(actor, {companyId, batchId});
    const view = await runSeatInviteBatch(actor, {companyId, batchId}, {deliver: async (claim) => {
      const callback = new URL(localizedPath(claim.locale, "/portal/company/seats/accept"), appUrl);
      callback.searchParams.set("token", claim.token);
      const result = await auth.signIn.magicLink({email: claim.email, callbackURL: callback.toString()});
      if (result.error) throw new Error("INVITATION_DELIVERY_UNCERTAIN");
    }});
    for (const locale of ["en", "zh-HK"]) revalidatePath(`/${locale}/portal/company/seats`);
    return {status: "ready", view};
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "";
    const code = error instanceof z.ZodError || ["INVALID_INPUT", "BATCH_TOO_LARGE", "BATCH_REQUEST_CONFLICT"].includes(message) ? "invalid"
      : message === "FORBIDDEN" ? "forbidden" : ["BATCH_EXPIRED", "BATCH_NOT_FOUND"].includes(message) ? "expired"
      : message === "SEAT_LIMIT_REACHED" ? "capacity" : message === "ELEVATED_CONFIRMATION_REQUIRED" ? "confirmation" : "unavailable";
    if (code === "unavailable") console.error("PORTAL_SEAT_BATCH_UNAVAILABLE");
    for (const locale of ["en", "zh-HK"]) revalidatePath(`/${locale}/portal/company/seats`);
    if (code !== "forbidden" && z.string().uuid().safeParse(companyId).success && z.string().uuid().safeParse(batchId).success) {
      try {return {status: "error", code, view: await getSeatInviteBatch(actor, {companyId, batchId})};}
      catch (readError) {unstable_rethrow(readError);}
    }
    return {status: "error", code};
  }
}
