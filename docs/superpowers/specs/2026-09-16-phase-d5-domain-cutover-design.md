# Phase D-5 — The `hkwtia.org` cutover

**Date:** 2026-09-16
**Programme:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (D-5, and the D-14 gate)
**Status:** approved for planning · **Owner:** Willy (product)
**Predecessor:** `docs/superpowers/specs/2026-09-16-phase-d4d-event-cancellation-design.md`

---

## 1. Why this slice

D-14 records the cutover as a Phase D gate: `NEXT_PUBLIC_SITE_URL` flipped to `https://hkwtia.org`, a
sitemap-host unit test, and a 308 from `hkwtia.vercel.app`. The programme's risk table names the state
this guards against — *"canonicals still on vercel.app when GEO work lands"* — because D-1's structured
data and canonical work is only correct once it points at the real domain.

**Most of it is already built.** `next.config.ts` arms the 308 only when `NEXT_PUBLIC_SITE_URL` names
`hkwtia.org`, and `tests/unit/redirects.test.ts` already pins that gating, including that a typo must not
arm it. The sitemap derives its host from the same variable through `absoluteUrl`.

So this slice is not a feature. It is the **one missing verification** — nothing currently asserts the
sitemap publishes the configured host — and the **runbook** for an operation that cannot be rehearsed,
because the cutover needs the domain, DNS and Google Search Console, all of which belong to WTIA.

## 2. Scope

**In:**

- A **sitemap-host unit test** asserting the sitemap and the page canonicals both follow
  `NEXT_PUBLIC_SITE_URL`, in both the cut-over and pre-cutover states.
- A **cutover runbook** with an owner and a verification per step, and a rollback.

**Out, deliberately:**

- **Any new code.** The guard, the redirect and the variable's plumbing already exist; this slice adds no
  behaviour, and if an implementation finds itself changing `next.config.ts` it has misread the slice.
- The **operations themselves**: attaching the domain, DNS, and Google Search Console. They need
  credentials and the domain, and they are the owner's to perform — this slice documents them.
- Approving or claiming the cutover has happened. Nothing here asserts the domain is live.
- Rehearsing the cutover, which is not possible. The ordered steps with a verification each are the
  mitigation, and the spec says so rather than implying a tested path.

## 3. Verified facts this design rests on

| Fact | Where it was verified |
|---|---|
| The 308 is **already implemented** and gated on the variable naming `hkwtia.org` | `next.config.ts` (`cutoverDone`, `hostRedirects`) |
| Its gating is **already pinned**, including that a non-matching value leaves it inert | `tests/unit/redirects.test.ts` |
| `NEXT_PUBLIC_SITE_URL` reaches the app as `publicEnv().siteUrl`, defaulting to localhost | `lib/config/env.ts` |
| The sitemap builds every `<loc>` through `absoluteUrl`, so it follows the same variable | `app/sitemap.ts` |
| **No test asserts the sitemap's host** | tree search for `sitemap` in `tests/` finds only an unrelated AI-Ops route case |
| The house precedent for a go-live runbook is `docs/integration/` | `docs/integration/phase-c-whatsapp-go-live.md` |

## 4. Decisions

### 4.1 What the slice delivers

**Decided:** the sitemap-host test and the runbook.

**Rejected — the runbook alone.** The redirect's gating is pinned, but the *sitemap's* host is not, and it
is the artifact GEO depends on. A cutover that moved DNS and flipped the variable while the sitemap kept
its old host would look successful and quietly mislead crawlers.

**Rejected — treating D-5 as entirely ops.** It would leave the one code-shaped gap unclosed and produce
no record of the sequence, so the operator would reconstruct it under time pressure.

### 4.2 How the sitemap test avoids becoming a database test

**Decided:** stub the repositories the sitemap reads, the way existing route tests do, and assert the
host properties rather than the full entry list.

**Rejected — a live-database sitemap test.** It would need the isolated database for every run and would
prove row contents, which is not what this slice is about. If a read cannot be stubbed cleanly, the test
says what it could not cover rather than asserting something weaker and looking complete.

### 4.3 Where the runbook lives

**Decided:** `docs/integration/hkwtia-org-cutover.md`, beside the C-9 go-live runbook, because that is
where this repository already keeps ordered, owner-bearing activation sequences.

## 5. Design

### 5.1 The sitemap-host test

`tests/unit/sitemap-host.test.ts`, asserting against the configured host:

- **Cut over** (`NEXT_PUBLIC_SITE_URL=https://hkwtia.org`): every `<loc>` begins `https://hkwtia.org/`,
  and **none** contains `vercel.app` or `localhost`.
- **Pre-cutover** (a preview host): **no** entry contains `hkwtia.org`. This is the assertion that stops a
  half-done cutover publishing canonicals for a domain that is not serving yet, and it is the counterpart
  of the redirect test's "a typo must not arm it".
- **Alternates agree:** the `en`, `zh-HK` and `x-default` entries for a route share one host, so hreflang
  cannot point at a different host than the page it annotates.
- **Canonicals agree with the sitemap:** `buildPageMetadata`'s canonical for a known route resolves to the
  same configured host. Both read `NEXT_PUBLIC_SITE_URL` today, and nothing pins that they agree.

### 5.2 The runbook

`docs/integration/hkwtia-org-cutover.md`, an ordered sequence with an owner and a verification per line:

| # | Step | Owner | Verified by |
|---|---|---|---|
| 1 | Attach `hkwtia.org` in Vercel | WTIA | the domain is attached and TLS issues |
| 2 | Point DNS at Vercel | WTIA | the host resolves in a browser over HTTPS |
| 3 | **Confirm the pre-cutover state**: `hkwtia.vercel.app` serves 200 and the variable does **not** name `hkwtia.org`, so the 308 is inert | developer | the live deployment has no host redirect |
| 4 | Flip `NEXT_PUBLIC_SITE_URL=https://hkwtia.org` and redeploy | developer | `/sitemap.xml` on both hosts emits `https://hkwtia.org/…`, and `hkwtia.vercel.app/*` answers **308** |
| 5 | Create and verify the GSC property, submit the sitemap, request indexing | WTIA | the property is verified and the sitemap reads "Success" |
| 6 | Update external references and printed material | WTIA | — |

**Rollback:** revert `NEXT_PUBLIC_SITE_URL` to the preview host and redeploy. Because the guard is
`includes("hkwtia.org")`, that **disarms the 308** and restores the previous behaviour with no code
change. The residual, stated rather than hidden: canonicals and redirects already cached by crawlers take
time to unwind.

**Step 3 is the one that matters**, because the dangerous state is a cutover done halfway — DNS moved and
the variable flipped while the domain does not yet resolve, which the 308 would turn into a site-wide
outage. The sequence cannot be rehearsed, so the verification per step is what stands in for one.

## 6. Error and edge cases

| Case | Behaviour |
|---|---|
| The variable names a host that is not `hkwtia.org` | The 308 stays inert, by design; the runbook's step 3 asserts this before the flip. |
| The variable contains `hkwtia.org` as a substring of another host | It arms the redirect — the guard is a substring check, pinned by the existing redirect test, and the runbook's step 3 makes the pre-flip state explicit rather than relying on the check being clever. |
| The variable is unset | `publicEnv().siteUrl` falls back to localhost, so a production deploy without it would emit localhost canonicals; the sitemap test's pre-cutover case covers the fallback's shape without asserting a production value. |
| DNS moved but the variable not flipped | Canonicals still point at the preview host; the runbook's ordering puts the flip after the domain is verified, and the rollback is the variable. |
| The variable flipped before DNS resolves | The 308 turns every visit into a redirect to a host that does not answer — which is exactly why step 3 is verified before step 4. |

## 7. Security and privacy

Nothing in this slice touches authentication, payments or personal data. The one security-shaped property
is that the redirect's arming condition stays a reviewed substring check on a public variable, and its
test stays in place.

## 8. Testing

- **The sitemap-host test** as §5.1, in both states, with the repositories stubbed.
- **The full gate**: `npm run audit:strings`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build` — the last of which matters here, because a test that mutates
  `process.env.NEXT_PUBLIC_SITE_URL` can leak into a build-time read if it is not restored.
- **The existing redirect test must stay green and unchanged**; if the new test needs a shared helper, it
  goes in the test, not in the config.

## 9. Risks

| Risk | Mitigation |
|---|---|
| The cutover is done halfway and the site 308s to a host that does not resolve | The runbook's step 3 verifies the pre-flip state, and step 4's verification is the 308 itself |
| Canonicals point at the preview host after the cutover, quietly harming GEO | The sitemap-host test's cut-over case, and the canonical-agreement assertion |
| A test that mutates the site URL leaks into another test or the build | The test restores the variable, and the build is part of the gate |
| Someone re-runs the cutover steps out of order under pressure | Numbered steps, each with an owner and a verification, and a rollback at the end |
| The slice quietly grows into changing the redirect | §2 says explicitly that any change to `next.config.ts` means the slice has been misread |

## 10. Definition of done

1. A test asserts the sitemap's host follows `NEXT_PUBLIC_SITE_URL` in both the cut-over and pre-cutover
   states, that no entry mentions the wrong host, that the locale alternates agree, and that the page
   canonicals agree with the sitemap.
2. `docs/integration/hkwtia-org-cutover.md` carries the ordered steps, an owner and a verification per
   step, and the rollback with its residual.
3. No production behaviour changed: the redirect, the guard and the sitemap are as they were.
4. The five gate commands are green.

## 11. Hand-off

- The cutover itself is an owner action with a runbook; nothing in this slice can be completed by a
  developer alone, and the spec says so rather than implying otherwise.
- The residual after a rollback — cached canonicals and redirects — is a search-visibility cost with a
  time constant, not a code state, and is recorded in the runbook.
