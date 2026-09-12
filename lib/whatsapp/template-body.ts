import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";

/**
 * Every declared BODY parameter of a template, resolved — or nothing.
 *
 * `lib/channels/woztell.ts` builds the body as
 * `template.variables.map((key) => ({… text: input.variables[key] ?? ""}))`, and
 * Meta rejects a template whose BODY parameter is empty. The adapter maps that
 * 4xx to `provider_client_error` (`lib/channels/woztell.ts`), `classifyDeliveryFailure`
 * makes 400-499 permanent (`lib/automation/retry.ts`), and every send path then
 * records a permanent failure and raises a staff task per recipient. So a blank
 * parameter is never a degraded message: it is a guaranteed permanent failure
 * with a person-shaped cost attached.
 *
 * This lives here, in its own dependency-light module, because the C-9 review
 * found the rule enforced in two of the four outbound paths and absent from the
 * other two. The campaign lane refused a blank twice (`resolveRecipientVariables`
 * at snapshot time, a private `resolvedBody` at dispatch time) while the journey
 * lane handed its context bag straight to the adapter — and that bag carried no
 * `memberName` and no `amountDue`, so the first live tick of `renewal_14` would
 * have sent parameter 1 empty and `dunning_3` parameters 1 and 2 empty, to every
 * member with a step due. The staff inbox lane was the same shape: the composer
 * marks each parameter `required`, which is a client-side attribute and nothing
 * more.
 *
 * The asymmetry that hid it is worth keeping in mind when reading either lane:
 * the email leg's `interpolate` THROWS `EMAIL_VARIABLE_MISSING:<name>`
 * (`lib/email/catalog.ts`) on a variable it cannot resolve, and the WhatsApp leg
 * silently substitutes `""`. One of those tells you; the other bills you.
 *
 * Returning `null` rather than throwing is deliberate, and each caller maps it
 * to the refusal its own lane already understands — the journey lane to "no
 * WhatsApp channel for this step" (email still sends), the dispatcher to
 * `missing_variable`, the inbox to `INVALID`. None of them may turn it into a
 * provider round trip.
 */
export function resolveTemplateBody(
  template: WhatsAppTemplateKey,
  variables: Readonly<Record<string, string | number>>,
): Readonly<Record<string, string>> | null {
  const body: Record<string, string> = {};
  for (const key of WHATSAPP_TEMPLATES[template].variables) {
    // `String(value)` rather than a type guard: the journey lane's bag is
    // `EmailVariables` (`string | number`), so a numeric variable is legitimate
    // and `0` must survive — only blank and whitespace are refusals.
    const value = variables[key] === undefined ? "" : String(variables[key]);
    if (value.trim() === "") return null;
    body[key] = value;
  }
  return body;
}
