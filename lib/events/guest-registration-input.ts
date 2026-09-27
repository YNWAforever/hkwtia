import {z} from "zod";

import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";

const inputSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  locale: z.enum(["en", "zh-HK"]),
  whatsappNumber: z.string().trim().max(32),
  organisation: z.string().trim().max(200),
  marketingConsent: z.boolean(),
  website: z.string().trim(),
});

const fields = ["eventId", "name", "email", "locale", "whatsappNumber", "organisation"] as const;
export type GuestRsvpField = (typeof fields)[number];
export type GuestRsvpFieldError = "required" | "invalid";
export type GuestRsvpFieldErrors = Partial<Record<GuestRsvpField, GuestRsvpFieldError>>;
export type GuestRsvpParseResult = Readonly<
  | {ok: true; data: z.infer<typeof inputSchema> & {normalizedWhatsAppNumber: string | null}}
  | {ok: false; fieldErrors: GuestRsvpFieldErrors}
>;

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Pure, shared form validation. No env, request headers, transport or repository reads. */
export function parseGuestRsvp(formData: FormData): GuestRsvpParseResult {
  const rawWhatsAppNumber = textValue(formData, "whatsappNumber").trim();
  const normalizedWhatsAppNumber = rawWhatsAppNumber ? normalizeWhatsAppNumber(rawWhatsAppNumber) : null;
  const parsed = inputSchema.safeParse({
    eventId: textValue(formData, "eventId"),
    name: textValue(formData, "name"),
    email: textValue(formData, "email"),
    locale: textValue(formData, "locale"),
    whatsappNumber: textValue(formData, "whatsappNumber"),
    organisation: textValue(formData, "organisation"),
    marketingConsent: formData.get("marketingConsent") === "on",
    website: textValue(formData, "website"),
  });
  if (!parsed.success) {
    const fieldErrors: GuestRsvpFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field !== "string" || !fields.includes(field as GuestRsvpField)) continue;
      const key = field as GuestRsvpField;
      if (fieldErrors[key]) continue;
      const value = textValue(formData, key).trim();
      fieldErrors[key] = value ? "invalid" : "required";
    }
    if (rawWhatsAppNumber && !normalizedWhatsAppNumber) fieldErrors.whatsappNumber = "invalid";
    return {ok: false, fieldErrors};
  }
  if (parsed.data.whatsappNumber && !normalizedWhatsAppNumber) {
    return {ok: false, fieldErrors: {whatsappNumber: "invalid"}};
  }
  return {ok: true, data: {...parsed.data, normalizedWhatsAppNumber}};
}
