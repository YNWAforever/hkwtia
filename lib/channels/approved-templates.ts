import "server-only";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";

/**
 * Which registered templates WOZTELL has actually approved.
 *
 * Two send paths consult it — the concierge reply
 * (lib/ai/woztell-production.ts) and the journey runner (lib/jobs/runners.ts) —
 * and they used to disagree, because only the concierge had a gate at all: the
 * runner handed any registered key straight to the adapter. A template WOZTELL
 * has not approved is a provider 4xx, which the runner classifies as a
 * permanent failure and settles with a staff task *after* the email leg has
 * already gone out, so the member is told twice that something is wrong when
 * nothing is.
 *
 * `RUN_LIVE_WOZTELL !== "1"` is the mock adapter, which reaches no Meta API at
 * all (lib/channels/woztell.ts returns `mock:<key>`), so gating there would
 * only hide the send path from every test, preview and dev run. Read from
 * `process.env` rather than a feature-scoped env contract for the same reason
 * `RUN_LIVE_WOZTELL` already is at both call sites: these are live-delivery
 * switches, not credentials a page could be missing.
 */
export function approvedWhatsAppTemplateKeys<K extends WhatsAppTemplateKey>(
  registered: readonly K[],
): ReadonlySet<K> {
  if (process.env.RUN_LIVE_WOZTELL !== "1") return new Set(registered);
  const configured = new Set(
    (process.env.WOZTELL_APPROVED_TEMPLATE_KEYS ?? "")
      .split(",")
      .map((value) => value.trim()),
  );
  return new Set(registered.filter((key) => configured.has(key)));
}
