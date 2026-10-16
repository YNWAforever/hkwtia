# Phase D-1 Search Console Cross-reference Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Compare the canonical sitemap with owner-exported Search Console indexing examples, top queries, and internal-link counts without claiming complete index coverage.

**Architecture:** A local-only TypeScript script reads four files and emits a Markdown report. Its pure report function validates the sitemap host and CSV headers, intersects URL samples with exact sitemap URLs, and labels absent Search Console rows as unknown. No Google credential or live site write is needed.

**Tech Stack:** Node.js 22, TypeScript, tsx, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` §7 D-1. [Google documents](https://support.google.com/webmasters/answer/7440203?hl=en) that the Page Indexing examples table is a sample capped at 1,000 URLs; this report cannot infer the status of URLs absent from that export.

## Global Constraints

- Accept local files only; never store credentials or exports in the repository.
- Require `https://hkwtia.org` for all sitemap `<loc>` values. This is a post-cutover report.
- Treat missing or malformed input as an error, never as zero coverage.
- Label Page Indexing and Links export results as samples. A missing URL is unknown, not indexed or unlinked.
- Run focused tests, the full unit suite, string audit, lint, typecheck, and build before handoff.

---

### Task 1: Pure cross-reference

**Files:**
- Create: `scripts/gsc-cross-reference.ts`
- Test: `tests/unit/gsc-cross-reference.test.ts`

**Interfaces:**
- Consumes: sitemap XML and three CSV texts (`coverage`, `queries`, `links`).
- Produces: `crossReferenceGsc(input)` with sitemap count, sampled crawled-not-indexed URL matches, top query rows, and sampled internal-link counts.

- [x] **Step 1:** Write a failing test with a two-locale sitemap, one crawled-not-indexed sitemap URL, one off-sitemap URL, a top query, and one link-count row. Assert exact matches, counts, and the `unknown` interpretation for absent rows.
- [x] **Step 2:** Run `npm.cmd test -- tests/unit/gsc-cross-reference.test.ts` and read the failure; it must name the missing sitemap-join behavior.
- [x] **Step 3:** Add strict CSV parsing, sitemap validation, URL intersection, and deterministic sorting in `scripts/gsc-cross-reference.ts`.
- [x] **Step 4:** Add and run hostile cases for pre-cutover/mixed-host sitemap, missing CSV headers, quoted CSV fields, and invalid link counts.
- [x] **Step 5:** Run the focused suite and review the report schema for misleading coverage claims.

### Task 2: Local CLI and operator instructions

**Files:**
- Modify: `scripts/gsc-cross-reference.ts`
- Modify: `docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md`
- Test: `tests/unit/gsc-cross-reference.test.ts`

**Interfaces:**
- Consumes: `--sitemap`, `--coverage`, `--queries`, `--links` local file paths.
- Produces: Markdown on stdout; nonzero exit on unreadable or malformed input.

- [x] **Step 1:** Write a failing CLI test using temporary fixtures and verify the intended output and error status.
- [x] **Step 2:** Add strict argument parsing and file reads. Print a concise Markdown report with sample-size caveats.
- [x] **Step 3:** Document the four required exports and command in the governing cutover runbook; state that it runs only after cutover and cannot certify all URLs indexed.
- [x] **Step 4:** Run focused tests, `npm.cmd run audit:strings`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build`. Review the diff and stage explicit paths.

## Acceptance

- The report identifies exported crawled-not-indexed URLs that appear in the canonical sitemap.
- It includes top queries and internal-link counts from supplied exports, with sample limits stated.
- It fails closed on absent files, headers, invalid counts, or a pre-cutover/mixed-host sitemap.
- No live Search Console result is claimed until the owner provides exports and runs the command.

## Verification recorded 2026-09-26

- Focused test: 6/6 passed after behavior-red checks for the sitemap join, full link sample, CLI output, malformed grouped counts, and multiline query formatting.
- Visible-string audit: 268 TSX files passed.
- Full unit suite: 626 test files / 5,583 tests passed; 26 files / 70 tests skipped behind existing environment gates.
- Lint: 0 errors, 59 existing warnings. Typecheck and production build passed; build generated 249 static pages.
- Real Search Console exports are unavailable in this checkout. The report has fixture evidence only; live crawl coverage and the Phase D owner gate remain unverified.
