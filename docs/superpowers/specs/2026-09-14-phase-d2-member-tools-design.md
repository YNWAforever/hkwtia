# Phase D-2 — the member tools embed

**Date:** 2026-09-14
**Programme:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (D-2, D-5)
**Status:** approved for planning · **Owner:** Willy (product)
**Predecessor:** `docs/superpowers/specs/2026-09-13-phase-d-public-surface-design.md`

---

## 1. Why this slice

Programme D-2: an exclusive member tool is an external application embedded in an `<iframe>`
inside the portal. The platform builds the gated embed, the CSP entry, the tier gate and the
token injection — not the tool itself.

This is the first of the three remaining Phase D sub-projects (D-2 → D-3 → D-4). It is the
smallest, and it settles the portal navigation and page pattern D-3's UI reuses.

Unlike most surfaces in this programme, this one was checked against the real thing before it
was designed. The tool at `https://content-calendar-internal.vercel.app/` returns `200` when
its access token is present and `401` without it; it sends no `X-Frame-Options` and no
`Content-Security-Policy: frame-ancestors`, so it may be framed; and its auth cookie is
`SameSite=None; Partitioned`, the third-party-iframe-compatible form. The embed is viable,
and that is a claim that was verified, not assumed.

## 2. Scope

**In:**

1. A typed tool registry, `config/member-tools.ts`.
2. `/portal/tools` (list) and `/portal/tools/[key]` (embed).
3. Per-tool tier gating, from the registry, pinned to `lib/membership/entitlements.ts`.
4. The tool's access token read from the environment and appended server-side.
5. A `frame-src` allow-list in `next.config.ts`, derived from the registry.
6. Portal navigation, and the strings in both bundles.

**Out, with reasons:**

| Item | Why not |
|---|---|
| Signed hand-off JWT (`?wtia=`) | Deferred. The tool's own token already satisfies "without a second login", and nothing indicates the tool reads a member identity. Reinstate when the tool needs to know which member is viewing — that changes one function (`toolFrameSrc`), not the page or the gate. |
| The tool itself | It exists and is not ours. |
| Per-member identity inside the tool | Consequence of the deferred JWT. |
| Token rotation automation | The token is one env var; rotating it is a Vercel change, not a code change. |
| D-3 AI writers, D-4 ticketing | They get their own specs. |

## 3. Verified facts

| Fact | How it was checked |
|---|---|
| The tool is reachable only with a token | `curl` with and without `?token=` returned `200` and `401`; the 401 body asks for an access token. |
| It may be framed | Its response carries no `X-Frame-Options` and no `frame-ancestors` directive. |
| Its auth survives an iframe | It sets `app_access=…; Secure; HttpOnly; SameSite=None; Partitioned`. |
| The portal already resolves plans | `/portal/billing/page.tsx` calls `requireActor()` then `getDashboard(actor)`. |
| Framing is currently unrestricted on our side | `next.config.ts`'s partial CSP declares no `frame-src` and no `default-src`. |

## 4. Design

### 4.1 Registry — `config/member-tools.ts`

```ts
export type MemberTool = Readonly<{
  key: "content-calendar";
  titleKey: string;                    // Portal bundle
  url: string;                         // origin only — never the token
  tokenParam: string;                  // e.g. "token"
  tokenField: keyof MemberToolsEnv;    // which env field holds the token
  tiers: readonly MembershipPlanCode[];
}>;
```

Frozen. `tokenField` is `satisfies`-checked against the env type, so a typo cannot point at a
field that does not exist. The token is never in this file, in git, or in a client bundle.

The registry is imported by `next.config.ts` for the CSP origins, so it must stay importable
there: relative imports, and `import type` for anything from `lib/config/env.ts`, which begins
with `import "server-only"`. Its `url` values are the single source the CSP reads.

### 4.2 Gate and src builder — `lib/portal/member-tools.ts`

Server-only, pure, and therefore testable:

- `availableTools(plans)` / `isToolAvailable(tool, plans)` — does `tool.tiers` intersect the
  member's plans.
- `toolFrameSrc(tool, token)` — builds the URL with `URLSearchParams`, so the token is encoded
  rather than concatenated.

**One authority for the gate: the registry's `tiers`.** `entitlements.memberTools` stays the
plan-level statement the `/membership` copy mirrors. A unit test pins every tool's `tiers` to
plans whose `entitlementsFor(plan).memberTools === "included"`, so the two vocabularies cannot
drift into disagreement.

### 4.3 Env — `lib/config/env.ts`

A `MemberToolsEnv` (`{contentCalendarToken?: string}`) with `parseMemberToolsEnv`. Optional,
**not** in `serverKeys`, and blank-tolerant: a missing token makes the tool unavailable, it
must not fail the portal's boot. `.env.example` gains the name with no value.

### 4.4 Pages

`/portal/tools` lists every configured tool: available ones link through, locked ones render a
card with an upgrade link to `/membership`. `/portal/tools/[key]` resolves the key, gates it,
reads the token, and renders the embed.

```
layout requireActor()            → /member-login if anonymous
page   requireActor() → getDashboard(actor) → memberships[].planCode
       gate: tool.tiers ∩ planCodes
         empty     → locked state + upgrade link
         non-empty → memberToolsEnv()[tool.tokenField]
            blank → "temporarily unavailable" (fail closed, no iframe, no 500)
            set   → <iframe src={toolFrameSrc(tool, token)} referrerPolicy="no-referrer" />
unknown key  → notFound()
```

`getDashboard` is reused deliberately: it already applies `requireMember` and the
active-membership rules, and a second reader for the same facts is how the two come to
disagree. A member with several memberships passes if **any** of their plans is in `tiers`.

Both pages are `force-dynamic`, like the rest of the portal. The list's availability is
plan-based only; a missing token surfaces on the detail page as "temporarily unavailable".

### 4.5 Navigation

`{id: "tools", href: "/portal/tools"}` in `config/internal-navigation.ts`, its label key added
to `portal-nav.tsx`'s `linkLabelKeys` (compile-checked by `satisfies`), and `Portal.tools.*` in
both bundles.

### 4.6 CSP

`frame-src` joins `contentSecurityPolicy` in `next.config.ts`, populated from the registry's
origins. Today there is no `frame-src` and no `default-src`, so framing is unrestricted; this
closes it. Deriving the value from the registry means a tool cannot be declared without its
host being allowed. Because `next.config.ts` imports the registry for those origins, the
registry must not require a runtime `server-only` import (see §4.1).

### 4.7 Error and edge cases

| Case | Behaviour |
|---|---|
| Unknown key | `notFound()` — a 404. |
| Locked plan | 200 with a locked card and an upgrade link, on the list and on direct access. Direct access is a real member being told, not a leak. |
| Token unset or blank | 200 with a "temporarily unavailable" state; no iframe, no 500. Fail closed. |
| No active membership | `MEMBERSHIP_INACTIVE` from `getDashboard`, exactly as `/portal/billing` already behaves. Not special-cased. |
| Several memberships | Admit if any of the plans is in `tiers`. |

### 4.8 Security

- The token is a secret: environment only, never git. It is still visible in the member's
  devtools — inherent to iframing a third-party tool with a URL token. Recorded, not hidden.
- `frame-src` restricted to the registry's origins; `frame-ancestors 'none'` unchanged.
- `referrerPolicy="no-referrer"` on the iframe, so the token-bearing URL is not leaked as a
  Referer.
- **No `sandbox`, deliberately.** The framed document is cross-origin, so the browser already
  isolates it from our origin and DOM. `sandbox` without `allow-same-origin` gives it an opaque
  origin, which stops it sending its `SameSite=None; Partitioned` cookie and breaks the app;
  with `allow-same-origin` it is all but a no-op for a cross-origin frame. The reasoning lives
  in a comment so a later reader does not "harden" it into a broken embed.
- No `allow` attribute: our `Permissions-Policy` (`camera=(), microphone=(), geolocation=()`)
  already restricts descendants.
- Known limitation: the token is shared, so the tool cannot distinguish members. That is what
  the deferred hand-off JWT would fix.

## 5. Testing

| Piece | Approach |
|---|---|
| Registry | Unit: https only; no query, userinfo or fragment in `url`; unique keys; `tiers` ⊆ entitled plans; `tokenField` resolves. |
| Gate | Unit: locked vs available; multi-membership admits on any match. |
| `toolFrameSrc` | Unit: token encoded through `URLSearchParams`. |
| CSP | Unit: `frame-src` names every configured origin and is derived from the registry. |
| Pages | Component: the list shows locked + upgrade for Community and a link for Startup; the detail renders the iframe src when available, "temporarily unavailable" when the token is blank, the upgrade state when locked, and 404s on an unknown key. |
| Acceptance | Credential-gated Playwright (skips without a member session, as the suite's other gated flows do): sign in, open the tool, assert the frame's src origin and the token's presence. The frame returning 200 from the real tool is an owner acceptance step. |

No unit test makes a network call.

## 6. Risks

| Risk | Mitigation |
|---|---|
| The token is rotated or revoked | The embed fails closed to "temporarily unavailable"; rotating is one Vercel env change, no code. |
| The tool later adds `X-Frame-Options` | The frame stops rendering, but the page still renders, so the failure is visible and contained. Verified absent today. |
| Safari's third-party cookie policy | The token also travels in the URL, so a dropped cookie still authenticates each load. |
| A future tool's host missing from CSP | A tool cannot be declared without its origin joining `frame-src`; a test holds it. |
| Community members surprised by the lock | The locked card names the upgrade path, in both bundles. |

## 7. Definition of done

1. `config/member-tools.ts` holds the one tool, with no token in it.
2. `/portal/tools` lists it; `/portal/tools/content-calendar` renders it for startup, corporate
   and patron, and a locked card for community.
3. The token is read from env and never appears in a client bundle or in git.
4. `frame-src` names the tool origin, derived from the registry.
5. Navigation and both bundles are in parity; `npm run audit:strings`, `npm run lint`,
   `npm run typecheck`, `npm test` and `npm run build` are green.
6. A member opens the tool from the portal without a second login — verified in the gated
   Playwright flow and by the owner against the live tool.

Not in scope and not claimed: the hand-off JWT, the tool's own behaviour, per-member identity
inside it, and D-3/D-4.
