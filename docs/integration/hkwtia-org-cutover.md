# hkwtia.org cutover — activation runbook

Programme: spec `docs/superpowers/specs/2026-09-16-phase-d5-domain-cutover-design.md` §5.2, work
package **D-5**. Plan: `docs/superpowers/plans/2026-09-16-phase-d5-domain-cutover.md`. The code this
sequence activates already exists and is already pinned: the permanent redirect in `next.config.ts`,
its arming guard, `tests/unit/redirects.test.ts` proving the guard is inert until the variable names
the domain, and `tests/unit/sitemap-host.test.ts` proving the sitemap and the page canonicals follow
the same variable. **Nothing here changes code**, and nothing here is automated: the domain, the DNS
zone and Google Search Console belong to WTIA.

This is a **living document**, not prose: one row per step, in the order they must be done, each naming
the thing that proves it. The verification column is the only field that changes; rows are never
deleted, so the file stays the record of what "we cut over safely" meant. The verification is what
stands in for a rehearsal, because the cutover itself cannot be rehearsed.

## What this changes and what it does not

Flipping `NEXT_PUBLIC_SITE_URL` from the preview host to `https://hkwtia.org` changes three things and
nothing else: the host the page canonicals are published on, the host every sitemap `<loc>` uses, and —
because the guard in `next.config.ts` reads the same variable — a permanent (308) redirect from
`hkwtia.vercel.app/*` to `https://hkwtia.org/*`. No application behaviour changes: no route, job,
integration or query behaves differently, the legacy redirect rules for the retired URLs are already
shipped and untouched, and no data is read, written or migrated. The change is one environment variable
and a redeploy.

## Preconditions

- **The domain is available to attach in Vercel.** `hkwtia.org` is owned by WTIA and is not already
  attached to another Vercel project. If it is attached elsewhere, that attachment has to be removed
  before step 1, because Vercel will not issue a certificate for a domain already claimed.
- **Somebody holds the DNS account for the `hkwtia.org` zone** and can add or change the records Vercel
  specifies. The previous record values must be written down before step 2 changes them; that note is
  the DNS half of the rollback.
- **Somebody holds the Google Search Console account** that will own the `hkwtia.org` property, or can
  be granted access to it.

## The sequence

| # | Step | Owner | Verified by |
|---|---|---|---|
| 1 | Attach `hkwtia.org` in Vercel | WTIA | The project's Domains list shows `hkwtia.org` attached and its certificate issued, not "Pending". |
| 2 | Point DNS at Vercel | WTIA | A `curl -sI https://hkwtia.org/` response shows the host is served by Vercel, and loading `https://hkwtia.org/` in a browser completes over HTTPS with no certificate warning. |
| 3 | **Confirm the pre-cutover state**: `hkwtia.vercel.app` serves 200 and `NEXT_PUBLIC_SITE_URL` does **not** name `hkwtia.org`, so the 308 is inert | developer | A `curl -sI https://hkwtia.vercel.app/` response answers `200` and carries **no** `location:` header — the redirect is observably absent, not merely believed absent. |
| 4 | Flip `NEXT_PUBLIC_SITE_URL=https://hkwtia.org` and redeploy | developer | `/sitemap.xml` on both `https://hkwtia.org` and `https://hkwtia.vercel.app` emits `https://hkwtia.org/…`; a page's `<link rel="canonical">` reads `https://hkwtia.org/…`; and a `curl -sI https://hkwtia.vercel.app/` response answers **308** with `location: https://hkwtia.org/`. |
| 5 | Create and verify the GSC property, submit the sitemap, request indexing | WTIA | Search Console reports the property as verified and the submitted `https://hkwtia.org/sitemap.xml` reads "Success". |
| 6 | Update external references and printed material | WTIA | A written list of the external references (partner sites, directory listings, email signatures, printed material) is walked, none still names `hkwtia.vercel.app`, and every link that was changed resolves `200` on `hkwtia.org`. |

## Why the order matters

The dangerous state is a cutover done halfway: **DNS moved and the variable flipped while the domain
does not yet resolve.** Because the redirect's destination is `https://hkwtia.org/:path*`, arming it
against a host that does not answer turns every visit to `hkwtia.vercel.app` into a redirect to a host
that fails to load — a site-wide outage no application health check will show, because the application
itself is healthy and only the hostname is unreachable. Steps 1 and 2 come first for the same reason in
reverse: the domain has to resolve and hold a certificate before the variable may be allowed to point
at it. Step 3 exists to make the pre-flip state **explicit**, at the last moment the redirect is still
inert and can be seen to be inert. Step 4's verification *is* the redirect — the cutover is not inferred
from a deploy succeeding, it is read from the `308` and its `location`. Step 4 precedes step 5 so the
sitemap Search Console is asked to fetch is the one carrying the new host.

## The guard's shape, and its one soft edge

The arming condition is a substring check:

```ts
const cutoverDone = (process.env.NEXT_PUBLIC_SITE_URL ?? "").includes("hkwtia.org");
```

It compares strings, not hostnames, so **any value that merely contains `hkwtia.org` arms it** — a
preview host carrying the domain in a path or query, or a lookalike such as `https://hkwtia.org.example`,
would arm the 308 just as the real value does. That is pinned by `tests/unit/redirects.test.ts`, which
drives the real `redirects()` at call time: unset and `https://staging.example` leave the host rule
absent, and `https://hkwtia.org` arms it with destination `https://hkwtia.org/:path*` and
`permanent: true`. The soft edge is exactly why step 3 asserts the pre-flip state by observation rather
than trusting the check to be clever: the guard cannot tell a real cutover from a string that happens to
contain the domain, so the sequence verifies the state, not the check.

## Rollback

Revert `NEXT_PUBLIC_SITE_URL` to the preview host (or unset it) and redeploy. The variable is read when
the deployment is built, so reverting it disarms the 308 **with no code change** on the next redeploy:
`hkwtia.vercel.app` serves again, and the canonicals and the sitemap return to the preview host. If the
domain itself is the problem, restore the previous DNS records from the note taken before step 2.

**The residual, stated:** a rollback is instantaneous in behaviour and not instantaneous in search
results. Canonicals and redirects already crawled or cached by search engines take time to unwind, and
a `308` that has been fetched is cached aggressively, so a rollback fixes what happens next rather than
what has already been indexed. The behaviour is reversible with one variable; the search-visibility cost
is not reversible with one redeploy.

## What this runbook cannot do

It cannot rehearse. The cutover happens once, against the live domain, on the records search engines
will actually see; there is no staging copy of the domain and no second DNS zone in which to observe
the result before committing to it. That is why every step carries a verification a person can perform
on the live system as it happens, and why the verification column — not this prose — is the thing to
follow when the window opens.
