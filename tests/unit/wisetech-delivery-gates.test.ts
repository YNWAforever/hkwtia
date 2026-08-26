import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

const root = process.cwd();
const deliveryPath = resolve(root, "docs/integration/wisetech-delivery-gates.md");
const templatePath = resolve(root, ".github/pull_request_template.md");

function readRequired(path: string, label: string) {
  expect(existsSync(path), `missing required ${label}`).toBe(true);
  return readFileSync(path, "utf8");
}

function expectAll(text: string, requirements: readonly string[], label: string) {
  for (const requirement of requirements) {
    expect(text, `${label} is missing: ${requirement}`).toContain(requirement);
  }
}

describe("WiseTech delivery gates", () => {
  it("records the seven sequential PR scopes, explicit boundaries, and fail-closed release gates", () => {
    const delivery = readRequired(deliveryPath, "WiseTech delivery-gates document");

    expectAll(delivery, [
      "c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f",
      "d2d82c01099490a8c2768c942186735667bbc881",
      "quality",
      "PR 1 — Scope: CI, branch safety, parity documents and known semantic/locale fixes. Must not include: Visual redesign.",
      "PR 2 — Scope: Tokens, fonts, header, mega menu, footer, responsive shell. Must not include: Schema changes.",
      "PR 3 — Scope: Homepage, About, History and programmes. Must not include: Demo content import.",
      "PR 4 — Scope: Announcement, partners, media upload and localized news migrations/CMS. Must not include: Public cutover.",
      "PR 5 — Scope: Events, News, Showcase, Launch Pad, Membership and contact journeys. Must not include: Auth/payment rewrites.",
      "PR 6 — Scope: Join, portal and admin visual alignment plus end-to-end regression. Must not include: Production deployment.",
      "PR 7 — Scope: Approved content migration, SEO/redirect validation and release evidence. Must not include: Unreviewed scope.",
      "Preview must be independent from production",
      "rollback by reverting its independently deployable PR/commit",
      "Site source archive transfer: NOT PASSED",
      "GitHub branch protection: NOT PASSED",
      "isolated Neon/test identities/providers: NOT PASSED",
      "Preview/UAT: NOT PASSED",
      "production approval: NOT PASSED",
      "6 September 2026 unsubscribe fallback deadline: NOT PASSED",
      "Fail closed",
      "No production database, provider, deploy, migration, or seed action was performed.",
    ], "delivery-gates document");
  });

  it("provides a reusable pull-request checklist with evidence and external-gate checks", () => {
    const template = readRequired(templatePath, "pull-request template");

    expectAll(template, [
      "Focused RED evidence",
      "Focused GREEN evidence",
      "npm.cmd run audit:strings",
      "npm.cmd test",
      "npm.cmd run lint",
      "npm.cmd run typecheck",
      "npm.cmd run build",
      "npm.cmd audit --omit=dev --audit-level=high",
      "Route/content parity",
      "Database/provider gates",
      "Rollback notes",
      "Site source archive transfer",
      "GitHub branch protection",
      "isolated Neon/test identities/providers",
      "Preview/UAT",
      "production approval",
      "6 September 2026 unsubscribe fallback deadline",
      "Do not mark an external gate as passed without recorded evidence.",
    ], "pull-request template");
  });
});
