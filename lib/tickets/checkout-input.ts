import {z} from "zod";

import {MAX_TICKET_SEATS} from "@/config/tickets";

const buyerSchema = z.object({
  eventId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  buyerName: z.string().trim().min(1).max(200),
  buyerEmail: z.string().trim().toLowerCase().pipe(z.string().email().max(320)),
  locale: z.enum(["en", "zh-HK"]),
}).strict();
const seatSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().pipe(z.string().email().max(320)),
}).strict();

export type TicketCheckoutFormData = z.output<typeof buyerSchema> & Readonly<{
  quantity: number;
  seats: readonly z.output<typeof seatSchema>[];
}>;
export type TicketCheckoutFormResult =
  | Readonly<{ok: true; data: TicketCheckoutFormData}>
  | Readonly<{ok: false; fieldErrors: Readonly<Record<string, "required" | "invalid" | "extra">>} >;

/** Every selected row is required; unselected nonempty rows are never silently dropped. */
export function parseTicketCheckoutForm(formData: FormData): TicketCheckoutFormResult {
  const fieldErrors: Record<string, "required" | "invalid" | "extra"> = {};
  const rawQuantity = formData.get("quantity");
  const quantity = typeof rawQuantity === "string" && /^\d+$/.test(rawQuantity) ? Number(rawQuantity) : NaN;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKET_SEATS) fieldErrors.quantity = "invalid";

  const buyer = buyerSchema.safeParse({
    eventId: formData.get("eventId"),
    idempotencyKey: formData.get("idempotencyKey"),
    buyerName: formData.get("buyerName"),
    buyerEmail: formData.get("buyerEmail"),
    locale: formData.get("locale"),
  });
  if (!buyer.success) {
    for (const issue of buyer.error.issues) {
      const name = String(issue.path[0] ?? "form");
      fieldErrors[name] = formData.get(name) == null || formData.get(name) === "" ? "required" : "invalid";
    }
  }

  const seats: z.output<typeof seatSchema>[] = [];
  if (!fieldErrors.quantity) {
    for (let index = 0; index < quantity; index += 1) {
      const nameField = `seatName-${index}`;
      const emailField = `seatEmail-${index}`;
      const name = formData.get(nameField);
      const email = formData.get(emailField);
      const parsed = seatSchema.safeParse({name, email});
      if (parsed.success) seats.push(parsed.data);
      else {
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] === "name" ? nameField : emailField;
          fieldErrors[field] = formData.get(field) == null || formData.get(field) === "" ? "required" : "invalid";
        }
      }
    }
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("seatName-") && !key.startsWith("seatEmail-")) continue;
      const match = /^seat(?:Name|Email)-(\d+)$/.exec(key);
      if (match && Number(match[1]) < quantity) continue;
      if (typeof value !== "string" || value.trim()) fieldErrors[key] = "extra";
    }
  }
  if (!buyer.success || Object.keys(fieldErrors).length > 0) return {ok: false, fieldErrors};
  return {ok: true, data: {...buyer.data, quantity, seats}};
}
