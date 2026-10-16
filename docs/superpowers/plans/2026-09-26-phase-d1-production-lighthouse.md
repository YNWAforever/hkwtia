# Phase D-1 Production Lighthouse Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing bilingual Lighthouse gate weekly against the production canonical host, before and after the domain cutover.

**Architecture:** A small resolver observes the production alias sitemap without following redirects, accepts only the documented pre-cutover 200 or exact post-cutover 308, verifies the sitemap on the selected canonical host, and emits the base URL. A scheduled GitHub Actions workflow uses that URL with the existing `lighthouserc.js` gate and preserves reports as artifacts. It never changes DNS, Vercel, or Search Console.

**Tech Stack:** Node.js 22, Vitest, Lighthouse CI, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` §7 D-1. The narrower public-surface spec explicitly deferred weekly LHCI; this plan is the follow-on source slice requested after D-5.

## Global Constraints

- Use only `https://hkwtia.vercel.app` before cutover and `https://hkwtia.org` after a verified exact 308; reject every other redirect.
- Do not use a Vercel session cookie or a Preview host in the scheduled workflow.
- A failed or partial sitemap must fail the monitor rather than pick a fallback host.
- The existing `lighthouserc.js` thresholds and bilingual route list remain authoritative.
- Search Console cross-reference remains an owner-data gate: no property export or API access is available in this checkout.
- Run focused tests, full unit suite, string audit, lint, typecheck, and build before handoff. No live production mutation.

---

### Task 1: Resolve the production canonical target

**Files:**
- Create: `scripts/resolve-production-lhci-target.mjs` and `scripts/resolve-production-lhci-target.d.mts`
- Create: `tests/unit/production-lhci-target.test.ts`

**Interfaces:**
- Consumes: `fetch(url, {redirect: "manual"})`, production alias `/sitemap.xml`, `GITHUB_OUTPUT`.
- Produces: `resolveProductionLhciTarget(fetchImpl): Promise<"https://hkwtia.vercel.app" | "https://hkwtia.org">`; CLI writes `base_url=<origin>` to `GITHUB_OUTPUT` and prints only the origin.

- [x] **Step 1:** Write tests with an injected fetch stub for an alias 200 sitemap, an exact 308 to the canonical sitemap, and hostile/partial cases: lookalike redirect, 302, empty sitemap, mixed origins, a missing locale root.
- [x] **Step 2:** Run `npm.cmd test -- tests/unit/production-lhci-target.test.ts`; confirm failures name the missing resolver behavior.
- [x] **Step 3:** Implement the resolver and CLI. Validate HTTP status, exact redirect target, every `<loc>` and alternate origin, and the `/` and `/zh` roots. Write `GITHUB_OUTPUT` only after all validation succeeds.
- [x] **Step 4:** Run the focused test and verify it passes. Run the CLI without live network only through its injected tests.

### Task 2: Schedule and retain the production gate

**Files:**
- Create: `.github/workflows/weekly-lighthouse.yml`
- Modify: `docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md`

**Interfaces:**
- Consumes: `base_url` from Task 1; `npm run test:lighthouse`.
- Produces: weekly and manual GitHub Actions workflow with a failing status on Lighthouse thresholds and a retained report artifact.

- [x] **Step 1:** Add a Monday UTC schedule and manual dispatch. Use Node 22, `npm ci`, target resolver, `LHCI_BASE_URL`, and the existing Lighthouse command. Give the job read-only repository permissions. Upload `.lighthouseci` reports even when the audit fails.
- [x] **Step 2:** Add a short runbook note for where to inspect the weekly status and that GSC cross-reference still needs the owner's property data.
- [x] **Step 3:** Parse the workflow as YAML, run the resolver tests, then run the repository gates. Review `git diff --check` and commit only explicit paths.



## Verification recorded 2026-09-26

- Target resolver: 9/9 tests passed after a behavior-red stub.
- Workflow YAML parsed; Node syntax check and `git diff --check` passed.
- `npm.cmd run audit:strings`: passed (268 TSX files).
- `npm.cmd run lint`: passed with 0 errors and 57 existing warnings.
- `npm.cmd run typecheck` and `npm.cmd run build`: passed.
- `npm.cmd test`: 623 files / 5,567 tests passed; 25 files / 65 tests skipped behind existing environment gates.
- Scheduled run, production Lighthouse scores, and GSC cross-reference are not local verification results; they require the workflow on the default branch and owner data.
