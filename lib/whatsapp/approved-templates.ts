import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {runLiveWoztellSchema} from "@/lib/config/env";
import {
  templateRegistryActor,
  whatsappTemplatesRepository,
  type WhatsAppTemplateRegistryReader,
} from "@/lib/db/repos/whatsapp-templates";

/**
 * Which template keys may be sent, as one dependency-light module a page and a
 * Server Action can both import.
 *
 * The function this replaces lived at `lib/ai/woztell-production.ts:103`: it was
 * not exported, it hard-coded a two-element list of concierge follow-ups, and it
 * sat in a server-only module that imports the concierge service, the OpenAI
 * embedding adapter and the agent runtime — so an admin page importing it would
 * drag the whole webhook wiring into a page render. Both problems are why the
 * gate and the picker read from here instead.
 *
 * C-7 (C2 Task 2) swapped the SOURCE for the `whatsapp_templates` registry and
 * made this `async`. It did not change the CONTRACT, which is why C1 Task 7's
 * `TEMPLATE_NOT_APPROVED` gate and C1 Task 8's picker both read this one
 * function: a control that offers a key the gate would refuse is a control that
 * lies, and two sources are how that happens.
 */
export async function approvedTemplateKeys(
  registry: WhatsAppTemplateRegistryReader = whatsappTemplatesRepository,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ReadonlySet<WhatsAppTemplateKey>> {
  const configured = Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateKey[];
  // The SAME parse `aiEnv()` applies, read here by injection rather than through
  // `aiEnv()` itself — see `runLiveWoztellSchema` for why this module may not
  // call it. The C-9 review found this reading the raw variable with a second,
  // looser rule (`!== "1"`), which is how one switch comes to mean "live" on the
  // send path and "mock" on the page that decides what may be sent.
  //
  // A value the schema refuses counts as LIVE, which is the fail-closed
  // direction: `RUN_LIVE_WOZTELL=true` is an operator who meant to go live, and
  // the answer to a switch we cannot read is "consult the registry", never
  // "approve everything". It also matches what the send paths do with it —
  // `aiEnv()` throws there, so nothing is sent either way.
  const live = runLiveWoztellSchema.safeParse(environment.RUN_LIVE_WOZTELL);
  // Behaviour preserved exactly from the private original, so every non-live
  // test stays green: off the live switch, everything in the config is
  // sendable, because nothing leaves the building anyway (the adapter answers
  // with a `mock:` provider id). It also means CI never opens a database to
  // answer this question — the registry is not consulted at all on this branch,
  // which is what keeps every WhatsApp unit test a unit test.
  if (live.success && live.data !== "1") return new Set(configured);

  let approval: Awaited<ReturnType<WhatsAppTemplateRegistryReader["approved"]>>;
  try {
    approval = await registry.approved(templateRegistryActor());
  } catch {
    // Fail CLOSED. The alternative — falling back to the environment variable
    // when the read fails — would let a database outage silently promote the
    // allowlist this registry replaced, and an unapproved element name is a
    // provider 4xx, a permanent failure and a staff task per recipient (S-14).
    return new Set<WhatsAppTemplateKey>();
  }

  // The operator allowlist survives exactly one condition: a registry with no
  // rows at all, which is what a half-run migration or a database restored
  // without 0034 looks like. "Nothing approved yet" is a different answer and
  // means nothing is sent.
  if (approval.empty) {
    const allowlist = new Set(
      (environment.WOZTELL_APPROVED_TEMPLATE_KEYS ?? "")
        .split(",")
        .map((value) => value.trim()),
    );
    return new Set(configured.filter((key) => allowlist.has(key)));
  }

  // Intersected with the config, never trusted whole: `whatsapp_templates` is
  // reference data an admin edits, and the `as const` in
  // `config/whatsapp-templates.ts` is what types every send call site, so the
  // registry can never approve a key the code cannot send.
  return new Set(configured.filter((key) => approval.keys.has(key)));
}

/**
 * The two concierge follow-ups, and only those.
 *
 * Kept separate from the function above so the staff picker can widen to every
 * approved template without widening what the concierge may send unattended: a
 * bot that could reach for `dunning_3` on its own is a different product from
 * one that can send a follow-up nudge.
 */
export const CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS: ReadonlySet<WhatsAppTemplateKey> = new Set<WhatsAppTemplateKey>([
  "concierge_follow_up_en",
  "concierge_follow_up_zh_hk",
]);
