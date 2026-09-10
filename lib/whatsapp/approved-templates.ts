import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";

/**
 * Which template keys may be sent, as one dependency-light module a page and a
 * Server Action can both import.
 *
 * The function this replaces lives at `lib/ai/woztell-production.ts:103`: it is
 * not exported, it hard-codes a two-element list of concierge follow-ups, and it
 * sits in a server-only module that imports the concierge service, the OpenAI
 * embedding adapter and the agent runtime — so an admin page importing it would
 * drag the whole webhook wiring into a page render. Both problems are why the
 * gate and the picker read from here instead.
 *
 * C-7 (C2 Task 2) swaps the SOURCE for the `whatsapp_templates` registry and
 * makes this `async`. It does not change the CONTRACT, which is why Task 7's
 * `TEMPLATE_NOT_APPROVED` gate and Task 8's picker both read this one function:
 * a control that offers a key the gate would refuse is a control that lies, and
 * two sources are how that happens.
 *
 * Created by Task 7 rather than Task 8 because Task 7 is the task that needs it:
 * without it `TEMPLATE_NOT_APPROVED` is a translated string with no code path
 * that raises it. Task 8 Step 0 finishes the job by deleting the private copy in
 * `lib/ai/woztell-production.ts` and pointing the concierge fallback here.
 */
export function approvedTemplateKeys(
  environment: NodeJS.ProcessEnv = process.env,
): ReadonlySet<WhatsAppTemplateKey> {
  const configured = Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateKey[];
  // Behaviour preserved exactly from the private original, so every non-live
  // test stays green: off the live switch, everything in the config is
  // sendable, because nothing leaves the building anyway (the adapter answers
  // with a `mock:` provider id). On it, only what an operator has listed.
  if (environment.RUN_LIVE_WOZTELL !== "1") return new Set(configured);
  const allowlist = new Set(
    (environment.WOZTELL_APPROVED_TEMPLATE_KEYS ?? "")
      .split(",")
      .map((value) => value.trim()),
  );
  return new Set(configured.filter((key) => allowlist.has(key)));
}

/**
 * The two concierge follow-ups, and only those.
 *
 * Kept separate from the function above so the staff picker can widen to all
 * five approved templates without widening what the concierge may send
 * unattended: a bot that could reach for `dunning_3` on its own is a different
 * product from one that can send a follow-up nudge.
 */
export const CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS: ReadonlySet<WhatsAppTemplateKey> = new Set<WhatsAppTemplateKey>([
  "concierge_follow_up_en",
  "concierge_follow_up_zh_hk",
]);
