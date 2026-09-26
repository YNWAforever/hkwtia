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
| 4 | Production serves the intended commit | `git rev-parse origin/main`; in Vercel Project → Deployments, open the deployment behind `hkwtia.vercel.app` and read **Source → Commit** | the full Source SHA matches `origin/main`; stop if the SHA cannot be read |
| 5 | Pre-flip state is inert | `curl -sI https://hkwtia.vercel.app/` | `200` and **no** `location:` header |

Do not start the window unless all five pass. Check 5 is the one that cannot be inferred from the
others: the redirect is armed by a substring check, so the pre-flip state is confirmed by
observation rather than trusted to that check being clever (see "The guard's shape" below).

## The window

1. **Add the domain in Vercel.** Project → Domains → add `hkwtia.org` and `www.hkwtia.org`.
   Vercel will state the required DNS records. Leave `NEXT_PUBLIC_SITE_URL` unchanged.
2. **Cloudflare DNS.** Write down the existing apex and `www` records, then point both at
   Vercel as instructed. The recorded values are needed for rollback.
3. **Verify the domain before arming the redirect.** Confirm Vercel reports the domain and
   certificate ready; `https://hkwtia.org/` must serve the intended app with `200`, and
   `https://hkwtia.org/sitemap.xml` must answer. Confirm `hkwtia.vercel.app` still answers
   `200` with no `location:` header. Stop and restore DNS if any check fails. During this
   interval, canonicals still name the pre-cutover host; complete the next steps promptly.
4. **Vercel env, redeploy and promote.** Set `NEXT_PUBLIC_SITE_URL=https://hkwtia.org` for
   Production, redeploy, then promote explicitly — merging alone builds only a Preview in
   this project. Reopen the production deployment behind `hkwtia.vercel.app` in Vercel
   Project → Deployments and compare **Source → Commit** with `git rev-parse origin/main`;
   `vercel inspect --json` does not expose the required commit SHA in the current CLI output.
   The deployed value changes canonicals, `og:url` and the sitemap host,
   and arms the `hkwtia.vercel.app` → 308. The sitemap and page canonicals follow the value
   in both states, pinned by `tests/unit/sitemap-host.test.ts`.
5. **Verify the deployed cutover, in this order:**
   - `curl -sI https://hkwtia.org/ | head -1` → `200`
   - `curl -sI https://hkwtia.vercel.app/ | head -1` → `308`, `location: https://hkwtia.org/`
   - `node scripts/verify-cutover-sitemap.mjs --host https://hkwtia.org --canonical https://hkwtia.org` → nonempty sitemap, both locales, and every `<loc>` and alternate on the canonical host
   - `node scripts/verify-cutover-sitemap.mjs --host https://hkwtia.vercel.app --canonical https://hkwtia.org --expect-redirect` → 308 to the canonical sitemap, then the same host checks
   - `curl -s https://hkwtia.org/ | grep canonical` → `https://hkwtia.org`
   - `node scripts/verify-legacy-redirects.mjs --host https://hkwtia.org` → `OK: 576/576`
6. **Google Search Console.** Add `hkwtia.org` as a property if the existing Site Kit property
   is not reusable, and confirm Search Console marks the property **Verified**. Submit
   `https://hkwtia.org/sitemap.xml`; confirm the submission appears in Sitemaps and later
   reaches **Success**. Record a pending processing state and follow it until Success. Use
   Change of Address only if the property is genuinely moving rather than being replaced in place.

## The guard's shape, and its one soft edge

The redirect is armed by a substring check:

```ts
const cutoverDone = (process.env.NEXT_PUBLIC_SITE_URL ?? "").includes("hkwtia.org");
```

It compares strings, not hostnames, so **any value that merely contains `hkwtia.org` arms the
308** — a preview host carrying the domain in a path or query, or a lookalike such as
`https://hkwtia.org.example`, arms it just as the real value does. The substring behaviour
follows from `next.config.ts`; `tests/unit/redirects.test.ts` tests the ordinary on/off cases
by driving the real `redirects()` at call time: unset and
`https://staging.example` leave the host rule absent, and `https://hkwtia.org` arms it with
destination `https://hkwtia.org/:path*` and `permanent: true`. Because the guard cannot tell a
real cutover from a string that happens to contain the domain, the pre-flip state is verified by
observation (check 5 above), not by trusting the check to be clever.

The same shape produces the one dangerous state: **a cutover done halfway**, where the variable
names the domain before the domain resolves. The destination is
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

1. If step 4 deployed the new value, unset `NEXT_PUBLIC_SITE_URL` (or set it back to the
   vercel.app host), redeploy and confirm `hkwtia.vercel.app` answers `200` with no
   `location:` header. The 308 is gated on that value and goes inert with it.
2. Restore the Cloudflare DNS records from the note taken in step 2. The WordPress site is
   untouched and resumes serving. If the variable was never flipped, start here.

Rollback is DNS plus one env var. Nothing in this phase is destructive.

The residual, stated: DNS changes and a redeploy take time to reach visitors. Canonicals and
redirects already crawled or cached — and a `308` is cached aggressively — can persist after
the rollback, so search results and some client paths take longer to unwind.

## After

- Walk the external references and printed material — partner sites, directory listings, email
  signatures, printed matter — and update any that still name `hkwtia.vercel.app`; confirm every
  changed link resolves `200` on `hkwtia.org`.
- Preserve the final successful pre-window `check-legacy-drift.mjs` output. Re-run the drift
  checker only against a separately reachable WordPress origin while it remains available;
  after DNS moves, `https://hkwtia.org` serves the new app and is not a WordPress source.
- Watch GSC coverage for a crawl cycle. A rise in "crawled, not indexed" on `/about/history/*`
  is expected initially — 45 of those pages are newly published.

## Weekly production Lighthouse

The `Weekly production Lighthouse` GitHub Actions workflow runs each Monday at 02:30 UTC
and can also be dispatched manually. It reads the production alias sitemap: a verified 200
keeps the audit on `hkwtia.vercel.app`; an exact 308 to the verified
`hkwtia.org/sitemap.xml` switches the audit to `hkwtia.org`. Any other response
fails the job. The existing `lighthouserc.js` tests ten routes across both locales
and applies its performance, accessibility, and SEO thresholds. Inspect the workflow
status and the `production-lighthouse` artifact (retained for 14 days); after the
cutover, confirm the resolver step prints `https://hkwtia.org`.

This job measures the public site only. Search Console coverage, top queries, and
crawled-but-not-indexed URLs still require the owner's GSC property access or an
export; Lighthouse results cannot substitute for that cross-reference.
