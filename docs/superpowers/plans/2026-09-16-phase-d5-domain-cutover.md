# Phase D-5 — The `hkwtia.org` cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the sitemap and the page canonicals follow `NEXT_PUBLIC_SITE_URL`, and write the ordered runbook that takes `hkwtia.org` live without a half-done cutover.

**Architecture:** No production behaviour changes. The 308 and its arming guard already exist in `next.config.ts` and are already pinned; the sitemap and `buildPageMetadata` already read the same variable through `absoluteUrl`. This slice adds the missing **verification** and the **runbook**.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-phase-d5-domain-cutover-design.md`

## Global Constraints

- **No production code change.** If a task finds itself editing `next.config.ts`, the sitemap or `lib/urls.ts`, it has misread the slice. The one exception is if the mutation step in Task 1 exposes a real gap — then say so and fix it, rather than weakening the test.
- **A test that mutates `NEXT_PUBLIC_SITE_URL` must restore it**, including when it throws, because the variable is read at call time by both the sitemap and the metadata builders. Follow `tests/unit/redirects.test.ts`'s save/`finally`-restore shape.
- **The test must not need a database.** Stub the repositories the sitemap reads; if a read cannot be stubbed cleanly, say what could not be covered rather than asserting something weaker and looking complete.
- **The runbook states its own limits.** The cutover cannot be rehearsed, and nothing in this slice may imply the domain is live.
- Conventional commits. Run before hand-off: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`.

---

### Task 1: The sitemap-host test

**Files:**
- Create: `tests/unit/sitemap-host.test.ts`
- Test: itself (no production file changes)

**Interfaces:**
- Consumes: the default export of `app/sitemap.ts`; `buildPageMetadata({locale, pathname, title, description, image?, index?})` from `lib/metadata.ts`; `absoluteUrl(path)` from `lib/urls.ts`, which reads `process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"` **at call time**.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

Create `tests/unit/sitemap-host.test.ts`. The sitemap is one async function that awaits several repositories, so stub them; every assertion below is about the **host**, not about row contents.

```ts
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// The sitemap is a single async function awaiting every repository at once, so
// they are stubbed rather than reached: this test is about the HOST each entry is
// published on, not about which rows exist.
vi.mock("@/lib/db/repos/company-profiles", () => ({companyProfilesRepository: {listPublishedSlugs: vi.fn(async () => [])}}));
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listPublic: vi.fn(async () => [])}}));
vi.mock("@/lib/db/repos/public-posts", () => ({listPublishedBuildLogs: vi.fn(async () => []), listPublishedNews: vi.fn(async () => [])}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: {listPublishedSlugs: vi.fn(async () => [])}}));

import sitemap from "@/app/sitemap";
import {buildPageMetadata} from "@/lib/metadata";

const CUTOVER_HOST = "https://hkwtia.org";
const PREVIEW_HOST = "https://hkwtia-preview.vercel.app";

// `absoluteUrl` reads the variable at call time, so it is assigned per case and
// restored in `afterEach` even if an assertion throws -- an unrestored variable
// would leak into the metadata builders of every later test in the run.
const original = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

async function locs(): Promise<string[]> {
  return (await sitemap()).map((entry) => entry.url);
}

describe("the sitemap's host", () => {
  it("publishes every entry on the configured host once the cutover is done", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = CUTOVER_HOST;
    const urls = await locs();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(`${CUTOVER_HOST}/`)).toBe(true);
      expect(url).not.toContain("vercel.app");
      expect(url).not.toContain("localhost");
    }
  });

  it("never mentions hkwtia.org before the cutover has happened", async () => {
    // The counterpart of the redirect test's "a typo must not arm it": a sitemap
    // that published the real domain while DNS still pointed elsewhere would ask
    // crawlers to index a host that does not answer.
    process.env.NEXT_PUBLIC_SITE_URL = PREVIEW_HOST;
    const urls = await locs();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).not.toContain("hkwtia.org");
  });

  it("keeps the locale alternates on the same host as the entry they annotate", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = CUTOVER_HOST;
    const entries = await sitemap();
    const annotated = entries.filter((entry) => entry.alternates?.languages);
    expect(annotated.length).toBeGreaterThan(0);
    for (const entry of annotated) {
      const languages = entry.alternates!.languages as Record<string, string>;
      for (const value of Object.values(languages)) {
        expect(new URL(value).origin).toBe(CUTOVER_HOST);
      }
    }
  });

  it("agrees with the canonical a page publishes for the same route", async () => {
    // Both read NEXT_PUBLIC_SITE_URL today and nothing pinned that they agree;
    // a sitemap entry and a canonical pointing at different hosts is how a
    // cutover looks successful while quietly telling crawlers two things.
    process.env.NEXT_PUBLIC_SITE_URL = CUTOVER_HOST;
    const metadata = buildPageMetadata({locale: "en", pathname: "/events", title: "Events", description: "Events"});
    const canonical = new URL(String(metadata.alternates?.canonical));
    expect(canonical.origin).toBe(CUTOVER_HOST);
    const sitemapEntry = (await sitemap()).find((entry) => new URL(entry.url).pathname === "/events");
    expect(sitemapEntry).toBeDefined();
    expect(new URL(sitemapEntry!.url).origin).toBe(canonical.origin);
  });
});
```

The mock shapes above are the real exports, read from `app/sitemap.ts` and each repository: `listPublishedBuildLogs()`, `eventsRepository.listPublic(actor, {status, asOf})`, `listPublishedNews(locale, asOf)`, `showcaseRepository.listPublishedSlugs()`, `companyProfilesRepository.listPublishedSlugs()`. Every one of those calls is already wrapped in `.catch(() => [])` in the sitemap, so an empty return is the natural stub. If a mock name drifts, the test fails on the mock rather than on an assertion — the wrong reason to fail.

- [ ] **Step 2: Run it — and expect it to PASS**

Run: `npx vitest run tests/unit/sitemap-host.test.ts`
Expected: **PASS.** There is no RED for this test and pretending otherwise would be theatre: it pins behaviour that already exists. That is exactly why Step 3 exists.

- [ ] **Step 3: Prove the test can fail (the mutation step)**

A test that has never failed is a claim, not evidence — and this one was written *after* the behaviour. Temporarily break the host and watch it go red:

1. In `lib/urls.ts`, change `absoluteUrl` to return a fixed `"https://wrong.example/" + path`, run the test, and confirm **at least the cut-over case fails**.
2. Revert, re-run, confirm green.
3. Then temporarily make the **pre-cutover** case detectable: set `NEXT_PUBLIC_SITE_URL = PREVIEW_HOST`, change `absoluteUrl` to hardcode `"https://hkwtia.org"`, and confirm the second case fails.
4. Revert both, re-run, and confirm `git diff lib/urls.ts` is empty.

Record both mutations and their exact failure output in your report. **If a mutation does not turn the test red, the assertion is vacuous** — fix the assertion rather than accepting it.

- [ ] **Step 4: Run the gate**

Run: `npx vitest run tests/unit/sitemap-host.test.ts tests/unit/redirects.test.ts && npm run typecheck && npm run lint && npm run build`
Expected: PASS, the existing redirect test unchanged and green, typecheck silent, build green. The build matters here: a test that leaves `NEXT_PUBLIC_SITE_URL` set can be read by a build-time metadata pass, so the restore in `afterEach` is load-bearing.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/sitemap-host.test.ts
git commit -m "test(seo): pin the sitemap and canonicals to the configured host"
```

---

### Task 2: The cutover runbook

> **Correction (2026-09-22):** this task was written as if no cutover runbook existed. One did:
> `docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md`, which predates this slice and is the
> document that governs — it carries the pre-window legacy-redirect and drift checks
> (`scripts/verify-legacy-redirects.mjs`, `scripts/check-legacy-drift.mjs`) that cover the largest real
> risk in the cutover and that this task's draft lacked. Two competing sequences for one operation is a
> hazard, so this task's genuine additions were folded into that earlier runbook, and
> `docs/integration/hkwtia-org-cutover.md` was deleted rather than kept. The paths below are corrected
> to the governing runbook.

**Files:**
- Edit: `docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md` (the governing runbook; the additions are folded in)
- Delete: `docs/integration/hkwtia-org-cutover.md` (the duplicate draft — never the operator's sequence)
- Test: none — this is the document, and Task 1's suite plus the existing redirect test are the code's evidence

**Interfaces:**
- Consumes: the spec's §5.2 table and the existing arming guard in `next.config.ts` (`cutoverDone = (process.env.NEXT_PUBLIC_SITE_URL ?? "").includes("hkwtia.org")`).
- Produces: the operator's sequence. Nothing in code depends on it.

- [ ] **Step 1: Fold the genuine additions into the governing runbook**

The runbook already exists at `docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md` (see the correction above). Fold this task's genuine additions into it, in its own register and without restructuring it. Only these three are genuinely missing from the governing document:

1. **The arming guard's soft edge** — the condition is a substring check
   (`(process.env.NEXT_PUBLIC_SITE_URL ?? "").includes("hkwtia.org")`), so any value that merely
   contains that string arms the 308. Pinned by `tests/unit/redirects.test.ts`; because the check
   cannot tell a real cutover from a lookalike, the pre-flip state is verified by observation rather
   than trusted to the check being clever.
2. **The cutover cannot be rehearsed** — it happens once, against the live domain, and the per-step
   verifications are what stand in for a rehearsal.
3. **A pointer to Task 1's test** — `tests/unit/sitemap-host.test.ts` (committed `794c8522`) pins that
   the sitemap and the page canonicals follow `NEXT_PUBLIC_SITE_URL` in both the cut-over and
   pre-cutover states.

Also genuinely missing from the governing runbook, and added in its own shape rather than by
rewriting its sequence: the preconditions, the rollback's search-visibility residual, and the
external-references step. Then delete the draft, so one document governs:

```bash
git rm docs/integration/hkwtia-org-cutover.md
```

The draft's original seven-section shape, recorded here and then superseded:

1. **What this changes and what it does not** — one paragraph: canonicals, the sitemap's host, and a 308 from `hkwtia.vercel.app`. No application behaviour changes, and no data is touched.
2. **Preconditions** — the domain is available to attach in Vercel, and somebody holds the DNS and Google Search Console accounts.
3. **The sequence**, as a table with an owner and a verification per line:

| # | Step | Owner | Verified by |
|---|---|---|---|
| 1 | Attach `hkwtia.org` in Vercel | WTIA | the domain is attached and TLS issues |
| 2 | Point DNS at Vercel | WTIA | the host resolves in a browser over HTTPS |
| 3 | Confirm the pre-cutover state: `hkwtia.vercel.app` serves 200 and `NEXT_PUBLIC_SITE_URL` does **not** name `hkwtia.org`, so the 308 is inert | developer | the live deployment has no host redirect |
| 4 | Flip `NEXT_PUBLIC_SITE_URL=https://hkwtia.org` and redeploy | developer | `/sitemap.xml` on both hosts emits `https://hkwtia.org/…`, and `hkwtia.vercel.app/*` answers **308** |
| 5 | Create and verify the GSC property, submit the sitemap, request indexing | WTIA | the property is verified and the sitemap reads "Success" |
| 6 | Update external references and printed material | WTIA | — |

4. **Why the order matters**, naming the dangerous state plainly: DNS moved and the variable flipped while the domain does not yet resolve turns the 308 into a site-wide redirect to a host that does not answer. Step 3 exists to make the pre-flip state explicit, and step 4's verification *is* the redirect.
5. **The guard's shape, and its one soft edge:** it is a substring check (`includes("hkwtia.org")`), so a value that merely contains that string arms it. That is pinned by `tests/unit/redirects.test.ts` and is why step 3 asserts the pre-flip state rather than trusting the check to be clever.
6. **Rollback:** revert `NEXT_PUBLIC_SITE_URL` to the preview host and redeploy; the guard disarms the 308 with no code change. **Residual, stated:** canonicals and redirects already cached by crawlers take time to unwind, so a rollback is not instantaneous in search results even though it is instantaneous in behaviour.
7. **What this runbook cannot do:** rehearse. The cutover happens once, against the live domain.

(The draft followed `docs/integration/phase-c-whatsapp-go-live.md`'s register; the additions above are written in the governing runbook's own.)

- [ ] **Step 2: Verify it**

There is no test for prose, so verify by reading it against the spec's §5.2 and the sequence's own logic: every step has an owner, every step has a verification a person could actually perform, the rollback names its residual, and the document does not anywhere imply the cutover has happened. Then run the gate, because the repository audits strings across documents:

Run: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md
git commit -m "docs(integration): fold the D-5 additions into the governing cutover runbook"
git rm docs/integration/hkwtia-org-cutover.md
git commit -m "docs(integration): retire the duplicate hkwtia.org cutover runbook"
```

---

## Verification checklist

Against the spec's §10:

| # | Done when | Task |
|---|---|---|
| 1 | The sitemap's host and the page canonicals are pinned in both the cut-over and pre-cutover states, the alternates agree, and the test has been shown to fail by mutation | 1 |
| 2 | The runbook carries the ordered steps, an owner and a verification per step, and the rollback with its residual | 2 |
| 3 | No production behaviour changed | 1 (the mutation step's revert) |
| 4 | The five gate commands are green | 1, 2 |

Not in scope: any change to `next.config.ts`, the sitemap or `lib/urls.ts`; performing the domain attachment, DNS or GSC steps; asserting the cutover has happened.
