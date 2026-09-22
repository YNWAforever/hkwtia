# hkwtia.org cutover runbook

Spec: `docs/superpowers/specs/2026-09-13-phase-d-public-surface-design.md`.
**Owner-executed.** Nothing here is automated, and nothing here touches the WordPress site,
which stays serveable throughout and is the rollback.

## Preconditions

- `hkwtia.org` is free to attach in Vercel. A domain already claimed by another project cannot be
  issued a certificate, so a claim elsewhere has to be released first.
- The operator holds the `hkwtia.org` DNS zone and the Google Search Console account, or can be
  granted access to them.

## Before the window

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | Legacy destinations answer | `node scripts/verify-legacy-redirects.mjs` | `OK: 576/576` |
| 2 | No drift since capture | `node scripts/check-legacy-drift.mjs` | `OK: every live url …` |
| 3 | Suite green | `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build` | all pass |
| 4 | Production serves the intended commit | `npx vercel inspect https://hkwtia.vercel.app --scope ynwaforevers-projects` | `githubCommitSha` matches `main` |
| 5 | Pre-flip state is inert | `curl -sI https://hkwtia.vercel.app/` | `200` and **no** `location:` header |

Do not start the window unless all five pass. Check 5 is the one that cannot be inferred from the
others: the redirect is armed by a substring check, so the pre-flip state is confirmed by
observation rather than trusted to that check being clever (see "The guard's shape" below).

## The window

1. **Vercel env.** Set `NEXT_PUBLIC_SITE_URL=https://hkwtia.org` for Production. This alone
   changes canonicals, `og:url` and the sitemap host, and arms the `hkwtia.vercel.app` → 308.
   Both the sitemap and the page canonicals follow this variable, in both the cut-over and
   pre-cutover states — pinned by `tests/unit/sitemap-host.test.ts` (committed `794c8522`).
2. **Redeploy and promote.** The env var is read at build time, so a redeploy is required;
   merging alone builds only a Preview in this project. Promote explicitly and confirm with
   `vercel inspect` that the alias carries the intended `githubCommitSha`.
3. **Add the domain in Vercel.** Project → Domains → add `hkwtia.org` and `www.hkwtia.org`.
   Vercel will state the required DNS records.
4. **Cloudflare DNS.** Point the apex and `www` at Vercel as instructed. Keep the previous
   record values written down before changing them — that note is the rollback.
5. **Verify, in this order:**
   - `curl -sI https://hkwtia.org/ | head -1` → `200`
   - `curl -sI https://hkwtia.vercel.app/ | head -1` → `308`, `location: https://hkwtia.org/`
   - `curl -s https://hkwtia.org/sitemap.xml | grep -c "<loc>"` → well over 500
   - `curl -s https://hkwtia.org/ | grep canonical` → `https://hkwtia.org`
   - `node scripts/verify-legacy-redirects.mjs --host https://hkwtia.org` → `OK: 576/576`
6. **Google Search Console.** Add `hkwtia.org` as a property if the existing Site Kit property
   is not reusable, submit `https://hkwtia.org/sitemap.xml`, and use Change of Address only if
   the property is genuinely moving rather than being replaced in place.

## The guard's shape, and its one soft edge

The redirect is armed by a substring check:

```ts
const cutoverDone = (process.env.NEXT_PUBLIC_SITE_URL ?? "").includes("hkwtia.org");
```

It compares strings, not hostnames, so **any value that merely contains `hkwtia.org` arms the
308** — a preview host carrying the domain in a path or query, or a lookalike such as
`https://hkwtia.org.example`, arms it just as the real value does. That is pinned by
`tests/unit/redirects.test.ts`, which drives the real `redirects()` at call time: unset and
`https://staging.example` leave the host rule absent, and `https://hkwtia.org` arms it with
destination `https://hkwtia.org/:path*` and `permanent: true`. Because the guard cannot tell a
real cutover from a string that happens to contain the domain, the pre-flip state is verified by
observation (check 5 above), not by trusting the check to be clever.

The same shape produces the one dangerous state: **a cutover done halfway**, where DNS has moved
and the variable names the domain while the domain does not yet resolve. The destination is
`https://hkwtia.org/:path*`, so arming it against a host that does not answer turns every visit
to `hkwtia.vercel.app` into a redirect to a host that fails to load — a site-wide outage no
application health check shows, because the application is healthy and only the hostname is
unreachable. The domain must resolve and hold a certificate before the variable is allowed to
point at it.

## What this runbook cannot do

It cannot rehearse. The cutover happens once, against the live domain, on the records search
engines will actually see; there is no staging copy of the domain and no second DNS zone in
which to observe the result first. That is why every step carries a verification a person
performs on the live system as it happens — the verifications, not this prose, are what stand in
for the rehearsal and what to follow when the window opens.

## Rollback

Any step failing verification:

1. Restore the Cloudflare DNS records from the note taken in step 4. The WordPress site is
   untouched and resumes serving.
2. Unset `NEXT_PUBLIC_SITE_URL` (or set it back to the vercel.app host) and redeploy. The
   `hkwtia.vercel.app` → 308 is gated on that value and goes inert with it.

Rollback is DNS plus one env var. Nothing in this phase is destructive.

The residual, stated: rollback is instantaneous in behaviour and not in search results.
Canonicals and redirects already crawled or cached — and a `308` is cached aggressively — take
time to unwind, so a rollback fixes what happens next rather than what has already been indexed.

## After

- Walk the external references and printed material — partner sites, directory listings, email
  signatures, printed matter — and update any that still name `hkwtia.vercel.app`; confirm every
  changed link resolves `200` on `hkwtia.org`.
- Re-run `node scripts/check-legacy-drift.mjs --wordpress https://hkwtia.org` once WordPress is
  retired, to confirm no URL was left behind.
- Watch GSC coverage for a crawl cycle. A rise in "crawled, not indexed" on `/about/history/*`
  is expected initially — 45 of those pages are newly published.
