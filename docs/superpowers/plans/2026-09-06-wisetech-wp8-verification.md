# WP-8 · Verification, evidence and gate closure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the WiseTech design-fidelity programme with release evidence recorded against WP-7's isolated Vercel Preview, the living checklist flipped to `verified` with PR links for every row WP-4…WP-8 own, an evidence document, and the owner-only actions written down (not performed).

**Architecture:** Docs-and-harness work only. Two small harness additions make a protected Preview reachable without ever committing a credential: Playwright gains an optional `storageState` and a script that turns a Vercel share URL into that state; Lighthouse CI gains an optional cookie header and skips its local server when a remote base URL is given. A new read-only `/zh` walk spec turns the spec's "manual `/zh` walk" into a repeatable check. Everything else is evidence capture and record-keeping. Nothing under `app/`, `lib/`, `components/`, `config/`, `messages/` changes.

**Tech Stack:** Playwright 1.x (`@playwright/test`), `@lhci/cli` (`lhci autorun`), Vitest, `gh`.

**Scope authority:** master plan `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §5 "WP-8", §6, §7; design `docs/superpowers/specs/2026-09-06-wisetech-wp7-routes-seo-design.md` §8 (D-4: own PR after WP-7). Checklist rows 8.1–8.7 in `docs/integration/wisetech-design-fidelity-checklist.md`.

**Facts the tasks depend on (verified 2026-09-06):**

- WP-7 is PR #40 (`worktree-wt-wp7-routes-seo`, tip `19dda79`), CI `quality` passed; Preview deployment `dpl_6dsVDPHvx1pZsX7MimnyPdxE9o74`, branch alias `https://hkwtia-git-worktree-wt-wp7-routes-seo-ynwaforevers-projects.vercel.app`, state READY.
- The Vercel project has **Vercel Authentication (SSO) enabled for all previews** (`ssoProtection.deploymentType = prod_deployment_urls_and_all_previews`); password protection and trusted IPs are off. The repo already supports `VERCEL_SHARE_TOKEN` / `_vercel_share` for its credential-gated `m*` specs (`tests/fixtures/m3-acceptance-safety.ts`, `README.md` ~160). A share URL is minted by the Vercel tooling (`get_access_to_vercel_url`), expires in ~23 h, and must never be committed or echoed into a report.
- `playwright.config.ts` derives `baseURL` from `PLAYWRIGHT_BASE_URL` and starts no managed server when it is set; `tests/e2e/wisetech-visual-baseline.spec.ts` deliberately skips under `PLAYWRIGHT_BASE_URL`. `tests/unit/m2-browser-acceptance-contract.test.ts` pins strings inside `playwright.config.ts` (keep them intact).
- `lighthouserc.js` targets `/`, `/zh`, `/membership`, `/zh/membership`, runs `npm.cmd run start` as `startServerCommand`, thresholds perf 0.9 / a11y 0.95 / seo 0.95, uploads to temporary public storage.
- The Preview's database is **not known to be isolated** (delivery gates: "isolated Neon: NOT PASSED"). Therefore only read-only specs run against the Preview. Verified read-only (their only interactions are locale switches, menu/dialog opening and navigation): `public-shell`, `accessibility`, `public-route-matrix`, `wisetech-redirects`, `wisetech-pr3-public-pages`, `wisetech-pr5-public-journeys` (opens the concierge dialog, sends nothing). Local-only: `concierge.spec.ts` (sends messages; needs the deterministic acceptance env) and every `m*` spec (credential-gated, writes).
- Checklist rows 4.1–4.14, 5.1–5.5, 6.1–6.7 still read `not started` although WP-4/5/6 merged as PRs #37, #38, #39 — WP-8 row 8.5 ("this checklist all `verified`") closes that debt using each PR's recorded gate (bodies saved in the session scratchpad as `pr37-body.md`, `pr38-body.md`, `pr39-body.md`; re-fetch with `gh pr view <n> --json body --jq .body`). Row 3.19 (Lighthouse on a Preview) is `ported` and becomes `verified` by Task 4.
- The first visual baselines (the programme's "before") were committed in `895216b` (WP-0, 2026-09-02); the current ones are on this branch. Before/after per breakpoint and locale is therefore a table of `git show 895216b:<png>` vs working-tree paths, not copied PNGs (29 MB per capture).
- `LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-10"`; today is 2026-09-06. Phase B (removal) is an owner action on or after that date and is not performed here. `docs/integration/wisetech-delivery-gates.md` still says "6 September 2026" — correct it to 2026-09-10 with a pointer to Phase A.

**Branch:** `worktree-wt-wp8-verification`, created from the WP-7 tip in the same worktree. PR base is `main` if #40 has merged by Task 9, otherwise `worktree-wt-wp7-routes-seo` (retarget to `main` after #40 merges).

**Repo gotchas (every task):** never stage `AGENTS.md`, `next-env.d.ts`, `package-lock.json`, `tests/unit/__snapshots__/email-render-snapshots.test.tsx.snap`; `git checkout -- AGENTS.md next-env.d.ts` after any `next dev`/`next build`; never bare `git stash`; port 3000 may be held — use `PLAYWRIGHT_PORT=3100`; Next 16 refuses a second dev server per directory (`taskkill /PID <n> /T /F`); commit trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Task 1: Protected-Preview session harness (Playwright `storageState`, Lighthouse cookie header)

**Files:**
- Create: `scripts/vercel-preview-session.mjs`, `tests/unit/preview-session-harness.test.ts`
- Modify: `playwright.config.ts`, `lighthouserc.js`, `.gitignore`, `README.md` (the Preview paragraph near line 160), `.env.example` (document `VERCEL_SHARE_URL`, `PLAYWRIGHT_STORAGE_STATE`, `LHCI_COOKIE_FILE` next to `VERCEL_SHARE_TOKEN`)
- Regression: `tests/unit/m2-browser-acceptance-contract.test.ts`, `tests/unit/m3-e2e-safety.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/preview-session-harness.test.ts`:
```ts
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {previewSessionPlan} from "../../scripts/vercel-preview-session.mjs";

const gitignore = readFileSync("./.gitignore", "utf8");
const playwrightConfig = readFileSync("./playwright.config.ts", "utf8");
const lighthouse = readFileSync("./lighthouserc.js", "utf8");

// WP-8: a Vercel-protected Preview is reached through a share URL that becomes a browser
// storage state and a Lighthouse cookie header — both written under an ignored directory,
// never printed, never committed (delivery gates: "record outcomes without copying credentials").
describe("preview session harness", () => {
  it("refuses to run without a share url, and refuses non-vercel or non-https hosts", () => {
    expect(() => previewSessionPlan({})).toThrow("VERCEL_SHARE_URL_REQUIRED");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "http://hkwtia-x.vercel.app/?_vercel_share=t"})).toThrow("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "https://example.com/?_vercel_share=t"})).toThrow("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "https://hkwtia-x.vercel.app/"})).toThrow("VERCEL_SHARE_URL_MISSING_TOKEN");
  });

  it("writes only under the ignored .playwright directory and reports the origin, never the token", () => {
    const plan = previewSessionPlan({VERCEL_SHARE_URL: "https://hkwtia-x.vercel.app/?_vercel_share=secret-token"});
    expect(plan.origin).toBe("https://hkwtia-x.vercel.app");
    expect(plan.statePath).toBe(".playwright/preview-state.json");
    expect(plan.cookiePath).toBe(".playwright/preview-cookie.txt");
    expect(JSON.stringify(plan)).not.toContain("secret-token");
    expect(gitignore).toMatch(/^\.playwright\/$/m);
  });

  it("lets Playwright and Lighthouse consume the session without changing their defaults", () => {
    expect(playwrightConfig).toContain("storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined");
    expect(playwrightConfig).toContain("process.env.VERCEL_SHARE_TOKEN ? 'off' : 'on-first-retry'");
    expect(lighthouse).toContain("process.env.LHCI_COOKIE_FILE");
    expect(lighthouse).toMatch(/startServerCommand: remote \? undefined : 'npm\.cmd run start'/);
  });
});
```

- [ ] **Step 2: Run and confirm they fail** — `npx vitest run tests/unit/preview-session-harness.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

`scripts/vercel-preview-session.mjs` (ESM; Playwright is a devDependency):
```js
import {mkdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const STATE_DIR = ".playwright";
export const STATE_PATH = `${STATE_DIR}/preview-state.json`;
export const COOKIE_PATH = `${STATE_DIR}/preview-cookie.txt`;

// Pure planning step, unit-tested: validates the share url and names the outputs. Never returns
// the token — callers log `plan.origin` only.
export function previewSessionPlan(env) {
  const raw = env.VERCEL_SHARE_URL?.trim();
  if (!raw) throw new Error("VERCEL_SHARE_URL_REQUIRED");
  const url = new URL(raw);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) {
    throw new Error("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
  }
  if (!url.searchParams.get("_vercel_share")) throw new Error("VERCEL_SHARE_URL_MISSING_TOKEN");
  return {origin: url.origin, statePath: STATE_PATH, cookiePath: COOKIE_PATH};
}

async function main() {
  const plan = previewSessionPlan(process.env);
  const {chromium} = await import("playwright");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Visiting the share url sets Vercel's `_vercel_jwt` cookie and redirects to the deployment.
    const response = await page.goto(process.env.VERCEL_SHARE_URL, {waitUntil: "domcontentloaded"});
    if (!response || response.status() >= 400 || !page.url().startsWith(plan.origin)) {
      throw new Error("VERCEL_SHARE_URL_DID_NOT_AUTHENTICATE");
    }
    mkdirSync(STATE_DIR, {recursive: true});
    await context.storageState({path: plan.statePath});
    const jwt = (await context.cookies(plan.origin)).find((cookie) => cookie.name === "_vercel_jwt");
    if (!jwt) throw new Error("VERCEL_SESSION_COOKIE_MISSING");
    writeFileSync(plan.cookiePath, `_vercel_jwt=${jwt.value}\n`, {mode: 0o600});
    console.log(`preview session written for ${plan.origin} -> ${plan.statePath}, ${plan.cookiePath}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "PREVIEW_SESSION_FAILED");
    process.exitCode = 1;
  });
}
```
(Match the entrypoint check to the pattern `scripts/seed-m5.ts` uses — the WP-5 notes say `import.meta.url === file://…` breaks on Windows; the `fileURLToPath` comparison above is that pattern. If `playwright` (not just `@playwright/test`) is not installed, import `chromium` from `@playwright/test` instead.)

`playwright.config.ts` — inside `use`, after `baseURL,`:
```ts
    // WP-8: a Vercel-protected Preview is entered through the session `scripts/vercel-preview-session.mjs`
    // writes; unset locally, so the managed dev server path is unchanged.
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined,
```

`lighthouserc.js`:
```js
import {readFileSync} from 'node:fs';

const baseUrl = process.env.LHCI_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const remote = Boolean(process.env.LHCI_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL);
// WP-8: a protected Preview needs Vercel's session cookie; the file is written by
// scripts/vercel-preview-session.mjs under the ignored .playwright/ directory.
const cookie = process.env.LHCI_COOKIE_FILE ? readFileSync(process.env.LHCI_COOKIE_FILE, 'utf8').trim() : undefined;
```
and in `collect`: `startServerCommand: remote ? undefined : 'npm.cmd run start',` (keep `startServerReadyPattern`/`Timeout` — harmless when the command is undefined; if lhci rejects them, make them conditional the same way), `settings: {chromeFlags: '…', ...(cookie ? {extraHeaders: {Cookie: cookie}} : {})}`. Keep the four existing URLs (Task 3 adds more).

`.gitignore`: add `.playwright/`. `README.md`: after the existing `VERCEL_SHARE_TOKEN` sentence add: how to mint a share URL (Vercel dashboard → deployment → Share, or the Vercel tooling), `VERCEL_SHARE_URL=… node scripts/vercel-preview-session.mjs`, then `PLAYWRIGHT_BASE_URL=<preview> PLAYWRIGHT_STORAGE_STATE=.playwright/preview-state.json npm run test:e2e -- <read-only specs>` and `LHCI_BASE_URL=<preview> LHCI_COOKIE_FILE=.playwright/preview-cookie.txt npm run test:lighthouse`; state that the files expire with the share link and are ignored.

- [ ] **Step 4: Run and confirm** — `npx vitest run tests/unit/preview-session-harness.test.ts tests/unit/m2-browser-acceptance-contract.test.ts tests/unit/m3-e2e-safety.test.ts` PASS; `npx tsc --noEmit`; `npx eslint scripts/vercel-preview-session.mjs lighthouserc.js playwright.config.ts`; `node scripts/vercel-preview-session.mjs` without env exits 1 with `VERCEL_SHARE_URL_REQUIRED`.

- [ ] **Step 5: Commit** — `git add scripts/vercel-preview-session.mjs tests/unit/preview-session-harness.test.ts playwright.config.ts lighthouserc.js .gitignore README.md .env.example` / `chore: reach a protected Vercel Preview through an ignored Playwright session and Lighthouse cookie`.

---

## Task 2: Read-only `/zh` walk spec

**Files:**
- Create: `tests/e2e/wisetech-zh-walk.spec.ts`
- Read first: `tests/e2e/public-route-matrix.spec.ts` (how it imports the route list and iterates locales — mirror its import style; e2e files may not use the `@/` alias), `config/public-routes.ts`, `app/[locale]/layout.tsx` (the `<html lang>` value for zh-HK).

- [ ] **Step 1: Write the spec** (it is its own RED/GREEN: it must pass locally on the managed server)

```ts
import {expect, test} from "@playwright/test";

import {publicRoutes} from "../../config/public-routes";

// WP-8 row 8.4: the spec's "manual /zh walk" as a repeatable, read-only check. Every public
// route under /zh must answer 200, declare a Chinese document language, carry exactly one h1,
// leak no raw message key or JS placeholder into the text, and link nowhere with the internal
// /zh-HK prefix (CLAUDE.md boundary 5).
const rawKey = /\b[A-Z][A-Za-z]+(?:\.[a-z][A-Za-z]+){2,}\b/;   // e.g. Programmes.hero.title

test.describe("zh-HK walk", () => {
  for (const route of publicRoutes) {
    const zhPath = route === "/" ? "/zh" : `/zh${route}`;
    test(`${zhPath} renders in Chinese without leaks`, async ({page}) => {
      const response = await page.goto(zhPath, {waitUntil: "domcontentloaded"});
      expect(response?.status(), zhPath).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", /^zh/);
      await expect(page.locator("main#main-content h1")).toHaveCount(1);
      const text = await page.locator("body").innerText();
      expect(text, `${zhPath} raw key`).not.toMatch(rawKey);
      expect(text, `${zhPath} placeholder`).not.toMatch(/\bundefined\b|\[object Object\]|NaN/);
      const badHrefs = await page.locator('a[href^="/zh-HK/"], a[href="/zh-HK"]').count();
      expect(badHrefs, `${zhPath} /zh-HK href`).toBe(0);
    });
  }
});
```
If `main#main-content` is not the public layout's landmark id, use the one `tests/unit/public-landmark-contract.test.ts` pins. If some route legitimately renders no `h1` in an empty-data state, assert `toBeLessThanOrEqual(1)` for that route only and comment why.

- [ ] **Step 2: Run locally** — `PLAYWRIGHT_PORT=3100 npm run test:e2e -- tests/e2e/wisetech-zh-walk.spec.ts` → all routes pass (count = `publicRoutes.length`). Any failure is either a real WP-7/i18n defect (report, do not patch product code) or a false positive in the regex (tighten the regex, say why).

- [ ] **Step 3: Commit** — `test: add the read-only zh-HK walk spec (WP-8 row 8.4)`.

---

## Task 3: Lighthouse targets for the spec's pages

**Files:** `lighthouserc.js`

- [ ] Add `/events`, `/zh/events`, `/programmes`, `/zh/programmes`, `/partners`, `/zh/partners` to `collect.url` (spec row 8.3 names `/`, `/membership`, `/events`; the two WP-7 pages are added because they are new surfaces). Keep `numberOfRuns: 1`. Commit `chore: audit the events and WP-7 pages in Lighthouse CI`.

---

## Task 4: Evidence run against the Preview (read-only)

**Inputs the controller supplies at dispatch:** the Preview origin (`https://hkwtia-git-worktree-wt-wp7-routes-seo-ynwaforevers-projects.vercel.app` or the deployment URL) and a fresh share URL in the `VERCEL_SHARE_URL` environment of the command (never written into any tracked file or report).

- [ ] **Step 1:** `VERCEL_SHARE_URL=<share-url> node scripts/vercel-preview-session.mjs` → prints the origin only. Confirm `.playwright/` is ignored (`git status --short` shows nothing new).
- [ ] **Step 2 (Playwright, read-only specs only):**
  ```sh
  PLAYWRIGHT_BASE_URL=<preview-origin> PLAYWRIGHT_STORAGE_STATE=.playwright/preview-state.json npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts tests/e2e/wisetech-redirects.spec.ts tests/e2e/wisetech-pr3-public-pages.spec.ts tests/e2e/wisetech-pr5-public-journeys.spec.ts tests/e2e/wisetech-zh-walk.spec.ts
  ```
  Record per-spec totals and the run's wall time. Expected: green; the visual-baseline spec is intentionally not in the list (it skips under `PLAYWRIGHT_BASE_URL`). If a spec fails only because of Preview-specific state (e.g. an announcement bar present on the Preview database, a different event list), record it as an environment difference with the assertion text — do not patch the spec to fit the Preview.
- [ ] **Step 3 (Lighthouse):** `LHCI_BASE_URL=<preview-origin> LHCI_COOKIE_FILE=.playwright/preview-cookie.txt npm run test:lighthouse`. Record, per URL: performance, accessibility, SEO scores, LCP and CLS (from the JSON in `.lighthouseci/` — read `lhr-*.json` `audits["largest-contentful-paint"].numericValue` and `audits["cumulative-layout-shift"].numericValue`), and the temporary-public-storage report URLs the run prints. Thresholds: perf ≥ 0.90, a11y ≥ 0.95, SEO ≥ 0.95, LCP < 2.5 s, CLS < 0.05. If a URL misses a threshold, record it verbatim — WP-8 is verification, not tuning; open a follow-up in the report.
- [ ] **Step 4:** Save the raw outputs to the session scratchpad (`wp8-preview-e2e.log`, `wp8-lighthouse.log`). Remove `.playwright/` after Task 5 no longer needs it (it holds the session cookie). Nothing to commit in this task.

---

## Task 5: Local gate and local-only browser suites on the WP-8 tip

- [ ] Master plan §7 order: `npm run audit:strings`; focused `npx vitest run tests/unit/wisetech-tokens.test.ts tests/unit/wisetech-css-port.test.ts tests/unit/homepage.test.tsx tests/unit/preview-session-harness.test.ts`; `npm test`; `npm run lint`; `npm run typecheck`; `npm run build`; `npm audit --omit=dev --audit-level=high`. Record exit codes and totals. Known load-timeouts (rerun alone, report both): `board-reporter-service`, `ci-security-contract`, `homepage`, `public-environment-isolation`, `repository-boundary`, `wt-pages/about-chairman-committees`, `wt-pages/launchpad-page`, `wt-pages/about`, `wt-pages/programs-editions`. `git checkout -- AGENTS.md next-env.d.ts` after the build.
- [ ] Local browser suites (managed server, `PLAYWRIGHT_PORT=3100`): `npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts tests/e2e/wisetech-redirects.spec.ts tests/e2e/wisetech-pr3-public-pages.spec.ts tests/e2e/wisetech-pr5-public-journeys.spec.ts tests/e2e/wisetech-zh-walk.spec.ts tests/e2e/wisetech-visual-baseline.spec.ts`. Then `tests/e2e/concierge.spec.ts` with `M4A_DETERMINISTIC_ACCEPTANCE=true M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED=true` if the managed environment accepts it (WP-2 notes) — if it skips, record the skip reason. Record totals; 0 visual diffs expected (WP-7 recaptured). Stop the server; revert the two managed files.

---

## Task 6: `docs/integration/wisetech-design-fidelity-evidence.md`

Format precedent: `docs/integration/wisetech-pr5-verification.md` (identity block, exact commands, HKT intervals, exit codes, totals, boundary statement). Sections:

1. **Record identity** — date, branch, tip SHA, Preview deployment id + origin, WP-7 PR #40 (merged or open), what this record does not claim (no production action, no schema change, Preview database isolation unverified).
2. **Local gate** — Task 5 table.
3. **Preview evidence** — Task 4: per-spec totals, Lighthouse table (URL × perf/a11y/seo/LCP/CLS × report link), how access was obtained (share link → ignored session; token never recorded).
4. **Local-only browser evidence** — Task 5's second list, with the reason each suite is local-only (writes / deterministic env / baselines skip remotely).
5. **`/zh` walk** — the zh-walk totals plus a short human note from a browser pass of `/zh`, `/zh/programmes`, `/zh/partners` (the controller does this pass in the in-app browser and hands the note over).
6. **Before / after per breakpoint and locale** — a table over the visual-baseline routes × 4 viewports × 2 locales: "before" = `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` (WP-0 capture of the pre-programme site), "after" = the working-tree file at this tip; group by page; note the 16 WP-7 files that have no "before". State the capture commits (`895216b` → `af97302`).
7. **Programme totals** — one line per WP with its PR and final gate, from the checklist prose and PR bodies.
8. **Open items** — anything Task 4/5 recorded as failing, skipped, or environment-different; the follow-up chips from earlier WPs still open.

Commit `docs: WP-8 design-fidelity evidence record`.

---

## Task 7: Checklist, §6 table and delivery gates

**Files:** `docs/integration/wisetech-design-fidelity-checklist.md`, `docs/integration/wisetech-delivery-gates.md`

- [ ] Checklist rows: 4.1–4.14 → `verified`, PR [#37], evidence from `pr37-body.md` (final gate numbers, the RSC-boundary `/contact` fix, three contrast fixes); 5.1–5.5 → `verified`, [#38] (tooling only — 5.3/5.5 evidence says "no asset disposition flipped; import never executed", which is what those rows require at this stage; if a row's check genuinely cannot be `verified` until an owner acts, leave it `ported` and say why in the evidence column); 6.1–6.7 → `verified`, [#39]; 7.1–7.5 → `verified`, [#40] with the Preview origin and Task 4 totals; 3.19 → `verified` with the Preview Lighthouse result (or stays `ported` with the recorded miss); 8.1–8.7 → `verified` with "this PR" (Task 9 replaces it with the number) — 8.6 and 8.7 are `verified` when the record exists, not when the owner acts (their check column says "recorded, not performed" / "review"). Add a prose paragraph above the table like the WP-2/WP-3 ones summarising WP-4…WP-8.
- [ ] §6 acceptance-criteria table: every row's status from `not started` to `verified` (or `ported` with a reason), citing the checks actually run in Tasks 4–5.
- [ ] `wisetech-delivery-gates.md`: (a) the two browser rows → `PASSED (Preview, read-only scope)` with the Preview origin, date, scenario totals and Lighthouse scores, plus a sentence that write-path scenarios ran locally because Preview database isolation is unverified; (b) a new "Owner actions recorded by WP-8 (not performed)" list: enable `quality` as a required check on `main` and `release`; create the isolated Neon branch + test identities (gate 2); assign a UAT owner (gate 3); production approval (gate 4); unsubscribe Phase B on or after 2026-09-10 (remove the `cronSecret` fallback in `lib/api/unsubscribe-route.ts` and `app/[locale]/(public)/unsubscribe/page.tsx`, delete `LEGACY_UNSUBSCRIBE_SECRET_SUNSET` and `tests/unit/unsubscribe-secret-rotation.test.ts`); push the donor README note (Task 8); (c) correct the "6 September 2026" unsubscribe row to 2026-09-10 (Phase A, `docs/superpowers/plans/2026-09-01-unsubscribe-secret-sunset.md`). Do not change any gate's fail-closed status.
- [ ] `npx vitest run tests/unit/wisetech-delivery-gates.test.ts tests/unit/wisetech-route-parity.test.ts` (they pin sentences in these docs) — green, or update the pinned sentence in the test in the same commit and say so. Commit `docs: flip the design-fidelity checklist to verified and record the owner actions`.

---

## Task 8: Donor README note (draft for the owner)

**Files:** `docs/integration/wisetech-donor-readme-note.md`

- [ ] Write the exact Markdown the owner pastes into `YNWAforever/wisetech`'s README (that repository is read-only to this programme): a one-paragraph notice that the design has been integrated into `YNWAforever/hkwtia` (link), the integration spec path, the donor commit `f91ecc5` this programme reconciled, that the repo is archived/read-only, and where to raise design issues (hkwtia issues). Bilingual (en, then zh-HK). Commit `docs: draft the donor repository README note (WP-8 row 8.7)`.

---

## Task 9: PR

- [ ] Final `git status --short` clean (snapshot artifact aside); `git log --oneline <base>..HEAD`. Push `worktree-wt-wp8-verification`; `gh pr create` with base `main` if #40 is merged, else `worktree-wt-wp7-routes-seo`; title `WP-8: verification, evidence and gate closure`; body: summary, evidence highlights (Preview origin, e2e totals, Lighthouse table), owner-action list, commits table, gate table, and the trailer line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then replace "this PR" in checklist rows 8.x with the number in one follow-up commit (`docs: record the WP-8 PR link`) and push. Report the URL; do not merge.
