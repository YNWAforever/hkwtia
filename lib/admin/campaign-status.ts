/**
 * Programme C-5. The `campaign_status` vocabulary, and nothing else.
 *
 * THIS FILE HAS NO IMPORTS, AND THAT IS ITS ENTIRE JOB. It exists because
 * `lib/admin/campaigns.ts` and `lib/db/repos/campaigns.ts` import each other:
 * the admin module needs `campaignsRepository`, and the repository needs the
 * admin module's schemas. A cycle is survivable as long as every binding
 * crossing it is dereferenced inside a function — `createCampaignSchema` is
 * read inside `createCampaign`, which runs long after both modules are
 * evaluated.
 *
 * `CAMPAIGN_STATUSES` was not. `campaignRecordSchema` is built at MODULE SCOPE
 * in the repository, so `z.enum(CAMPAIGN_STATUSES …)` ran during import, and
 * whenever the admin module was the entry point — which it is for
 * `/admin/segments`, a page that predates this phase — the repository evaluated
 * first and read a `const` still in its temporal dead zone. `next build` died
 * with `ReferenceError: Cannot access 'l' before initialization` while
 * collecting page data, taking `/admin/campaigns` and `/admin/segments` down
 * together. Neither `tsc --noEmit` nor vitest sees it: vite-node resolves the
 * cycle in an order that happens to work, so only the real bundler catches it.
 *
 * Both sides import THIS module directly. Do not re-export these two names from
 * `lib/admin/campaigns.ts` for convenience — a re-export puts the binding back
 * on the cycle and the next module-scope `z.enum(…)` reintroduces the crash.
 *
 * Dependency-free also means no `import "server-only"`, the same deliberate
 * choice `lib/admin/campaign-eligibility.ts` documents: this is a list of words
 * with no server capability in it, and a status a screen cannot name renders as
 * a blank cell, so a client label map must be able to reach it without copying
 * the list.
 */

/**
 * Every value `campaign_status` carries after 0033, in declaration order.
 * `sending` is here for spec parity and is written by nothing (S-6) —
 * `processing` is the in-flight state three statements in
 * `campaign-recipient-delivery.ts` already spell — and `/admin/campaigns` still
 * has to label it, because a status the screen cannot name renders as a blank
 * cell rather than as an error.
 */
export type CampaignStatus =
  | "queued" | "processing" | "completed" | "cancelled"
  | "draft" | "review" | "scheduled" | "sending" | "failed";

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "queued", "processing", "completed", "cancelled",
  "draft", "review", "scheduled", "sending", "failed",
];
