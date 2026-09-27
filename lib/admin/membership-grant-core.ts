import {batchRequestSchema} from "@/lib/admin/batches/types";
import {grantInputSchema} from "@/lib/membership/grants";

/** HTML datetime-local is interpreted in Asia/Hong_Kong; the round trip rejects overflow dates. */
export function hktLocalToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("GRANT_DATE_INVALID");
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year < 2020 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) throw new Error("GRANT_DATE_INVALID");
  const epoch = Date.UTC(year, month - 1, day, hour - 8, minute);
  const date = new Date(epoch);
  const roundTrip = new Date(epoch + 8 * 60 * 60 * 1000);
  if (!Number.isFinite(epoch) || roundTrip.getUTCFullYear() !== year || roundTrip.getUTCMonth() !== month - 1 || roundTrip.getUTCDate() !== day || roundTrip.getUTCHours() !== hour || roundTrip.getUTCMinutes() !== minute) throw new Error("GRANT_DATE_INVALID");
  return date.toISOString();
}

export function parseProfileGrantForm(profileId: string, formData: FormData) {
  return grantInputSchema.parse({
    target: {kind: "profile", profileId},
    planCode: formData.get("planCode"),
    effectiveAt: hktLocalToIso(String(formData.get("effectiveAt") ?? "")),
    expiresAt: hktLocalToIso(String(formData.get("expiresAt") ?? "")),
    reason: formData.get("reason"),
  });
}

/** Targets remain explicit IDs; eligibility and names are read by the durable preview worker. */
export function parseBatchGrantForm(formData: FormData) {
  const kind = formData.get("targetKind");
  const ids = String(formData.get("targetIds") ?? "").split(/\r?\n/).map((id) => id.trim()).filter(Boolean);
  return batchRequestSchema.parse({
    operation: "membership_grant", idempotencyKey: formData.get("idempotencyKey"),
    targets: [...new Set(ids)].map((id) => kind === "profile" ? {kind, profileId: id} : {kind, companyId: id}),
    payload: {
      planCode: formData.get("planCode"),
      effectiveAt: hktLocalToIso(String(formData.get("effectiveAt") ?? "")),
      expiresAt: hktLocalToIso(String(formData.get("expiresAt") ?? "")),
      reason: formData.get("reason"),
    },
  });
}