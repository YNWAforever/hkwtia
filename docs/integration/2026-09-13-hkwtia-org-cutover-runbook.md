# hkwtia.org cutover runbook

Spec: `docs/superpowers/specs/2026-09-13-phase-d-public-surface-design.md`.
**Owner-executed.** Nothing here is automated, and nothing here touches the WordPress site,
which stays serveable throughout and is the rollback.

## Before the window

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | Legacy destinations answer | `node scripts/verify-legacy-redirects.mjs` | `OK: 576/576` |
| 2 | No drift since capture | `node scripts/check-legacy-drift.mjs` | `OK: every live url …` |
| 3 | Suite green | `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build` | all pass |
| 4 | Production serves the intended commit | `npx vercel inspect https://hkwtia.vercel.app --scope ynwaforevers-projects` | `githubCommitSha` matches `main` |

Do not start the window unless all four pass.

## The window

1. **Vercel env.** Set `NEXT_PUBLIC_SITE_URL=https://hkwtia.org` for Production. This alone
   changes canonicals, `og:url` and the sitemap host, and arms the `hkwtia.vercel.app` → 308.
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

## Rollback

Any step failing verification:

1. Restore the Cloudflare DNS records from the note taken in step 4. The WordPress site is
   untouched and resumes serving.
2. Unset `NEXT_PUBLIC_SITE_URL` (or set it back to the vercel.app host) and redeploy. The
   `hkwtia.vercel.app` → 308 is gated on that value and goes inert with it.

Rollback is DNS plus one env var. Nothing in this phase is destructive.

## After

- Re-run `node scripts/check-legacy-drift.mjs --wordpress https://hkwtia.org` once WordPress is
  retired, to confirm no URL was left behind.
- Watch GSC coverage for a crawl cycle. A rise in "crawled, not indexed" on `/about/history/*`
  is expected initially — 45 of those pages are newly published.
