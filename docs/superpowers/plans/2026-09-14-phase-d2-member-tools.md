# Phase D-2 Member Tools Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give entitled members a gated in-portal page that embeds the external Content Calendar tool, with the tool's access token injected from the environment and the tool's origin the only one our CSP permits to be framed.

**Architecture:** A frozen registry (`config/member-tools.ts`) declares each tool — origin, token parameter, which env field holds its token, and the plans that may open it. Pure helpers (`lib/portal/member-tools.ts`) decide availability from the member's plans and build the iframe `src`. Two server components (`/portal/tools`, `/portal/tools/[key]`) render the list and the embed, reusing `getDashboard(actor)` for the member's plans. `next.config.ts` derives its new `frame-src` from the same registry.

**Tech Stack:** Next.js 16 App Router (Webpack), React 19, TypeScript strict, next-intl v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-phase-d2-member-tools-design.md`

## Global Constraints

- Next.js App Router; Server Components are the default. Nothing in this plan adds `'use client'`.
- Every user-visible string lives in `messages/en.json` and `messages/zh-HK.json`, in parity. `npm run audit:strings` must stay clean.
- Never hand-build a locale prefix. `zh-HK` is served at `/zh`; use `localizedPath(locale, path)`. Pinned by `tests/unit/locale-href-boundary.test.ts`.
- **The tool access token is a secret.** It lives only in the environment. It must never appear in a source file, a commit, a log line, or a test fixture. The registry holds the origin, never the token.
- Environment reads go through `lib/config/env.ts` only. A missing token must degrade the page, never fail the portal's boot.
- Files are kebab-case. Conventional commits.
- Run before every hand-off: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`.

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `config/member-tools.ts` | The frozen tool registry, and the origins the CSP reads. No runtime imports, so `next.config.ts` can load it. |
| `lib/portal/member-tools.ts` | Pure: `isToolAvailable(tool, plans)` and `toolFrameSrc(tool, token)`. |
| `app/[locale]/(member)/portal/tools/page.tsx` | Lists every configured tool; available ones link through, locked ones show the upgrade path. |
| `app/[locale]/(member)/portal/tools/[key]/page.tsx` | Resolves the tool, gates it, and renders the embed or a locked/unavailable state. |
| `tests/unit/member-tools-config.test.ts` | Registry shape and the tiers/entitlements pin. |
| `tests/unit/portal-member-tools.test.ts` | Gate and src builder. |
| `tests/unit/member-tools-csp.test.ts` | `frame-src` is present and derived from the registry. |
| `tests/unit/portal-tools-list-page.test.tsx` | List page by plan. |
| `tests/unit/portal-tool-detail-page.test.tsx` | Detail page: embed, locked, unavailable, unknown key. |
| `tests/e2e/phase-d2-member-tools.spec.ts` | Credential-gated acceptance. |

**Modify**

| File | Change |
|---|---|
| `lib/config/env.ts` | Add `MemberToolsEnv`, `parseMemberToolsEnv`, `memberToolsEnv`. Optional; not in `serverKeys`. |
| `.env.example` | Add `MEMBER_TOOL_CONTENT_CALENDAR_TOKEN=` with no value. |
| `next.config.ts` | Add `frame-src`, derived from `memberToolOrigins`. |
| `config/internal-navigation.ts` | Add the `tools` portal link. |
| `components/portal/portal-nav.tsx` | Add its label key. |
| `messages/en.json`, `messages/zh-HK.json` | Add `Portal.tools.*`. |
| `tests/unit/env-contract.test.ts` | The token is optional and absent from the aggregate. |
| `tests/unit/internal-navigation-config.test.ts`, `tests/unit/portal-nav.test.tsx` | Nine links. |

---

### Task 1: The member-tools env contract

**Files:**
- Modify: `lib/config/env.ts`
- Modify: `.env.example`
- Test: `tests/unit/env-contract.test.ts` (append inside the existing `describe`)

**Interfaces:**
- Consumes: nothing.
- Produces: `MemberToolsEnv = Readonly<{contentCalendarToken?: string}>`; `parseMemberToolsEnv(environment?: Environment): MemberToolsEnv`; `memberToolsEnv(): MemberToolsEnv`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/env-contract.test.ts`, add `parseMemberToolsEnv` to the import list from `@/lib/config/env`, then append these cases inside `describe("runtime environment contract", ...)` (before its closing `});`, above the `productionEnvironment` helper):

```ts
  it("reads a blank member-tool token as absent, never as configured", () => {
    expect(parseMemberToolsEnv({})).toEqual({});
    expect(parseMemberToolsEnv({MEMBER_TOOL_CONTENT_CALENDAR_TOKEN: "   "})).toEqual({});
    expect(parseMemberToolsEnv({MEMBER_TOOL_CONTENT_CALENDAR_TOKEN: "  tool-token  "})).toEqual({
      contentCalendarToken: "tool-token",
    });
  });

  // The token is optional by design: a portal page that renders an unconfigured tool is a
  // degradation, and a hard boot requirement here is how a transitive env pull once took
  // /sitemap.xml, /events and /showcase down.
  it("keeps the member-tool token out of the aggregate server contract", () => {
    const values = parseServerEnv({
      ...productionEnvironment(),
      TURNSTILE_SECRET: "turnstile-secret",
      TURNSTILE_SITE_KEY: "turnstile-site-key",
      MEMBER_TOOL_CONTENT_CALENDAR_TOKEN: "tool-token",
    });

    expect(values).not.toHaveProperty("contentCalendarToken");
    expect(() => parseServerEnv({
      ...productionEnvironment(),
      TURNSTILE_SECRET: "turnstile-secret",
      TURNSTILE_SITE_KEY: "turnstile-site-key",
    })).not.toThrow();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/env-contract.test.ts`
Expected: FAIL — `parseMemberToolsEnv is not a function`.

- [ ] **Step 3: Implement the contract**

In `lib/config/env.ts`, add the interface beside `UnsubscribeEnv` (after its closing brace, around line 42):

```ts
export interface MemberToolsEnv {
  /**
   * The access token for the Content Calendar member tool (Phase D-2). Optional and
   * deliberately NOT in `serverKeys`: a missing token makes one portal page degrade to
   * "temporarily unavailable", and a hard boot requirement for a value only that page
   * reads is the boundary-7 coupling that once took /sitemap.xml down.
   */
  contentCalendarToken?: string;
}
```

Then add the parse and accessor beside `unsubscribeEnv` (after its closing brace, around line 406):

```ts
const memberToolsEnvironmentSchema = z.object({
  MEMBER_TOOL_CONTENT_CALENDAR_TOKEN: z.string().optional(),
});

export function parseMemberToolsEnv(environment: Environment = process.env): MemberToolsEnv {
  const parsed = memberToolsEnvironmentSchema.parse(environment);
  const token = parsed.MEMBER_TOOL_CONTENT_CALENDAR_TOKEN?.trim();
  return token ? {contentCalendarToken: token} : {};
}

export function memberToolsEnv(): MemberToolsEnv {
  return parseMemberToolsEnv(process.env);
}
```

In `.env.example`, add near the other optional variables:

```sh
# Member tools (Phase D-2). The Content Calendar tool's access token is a secret and must
# never be committed with a value. Leave blank to render the tool as temporarily unavailable.
MEMBER_TOOL_CONTENT_CALENDAR_TOKEN=
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/env-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config/env.ts .env.example tests/unit/env-contract.test.ts
git commit -m "feat(env): a contract and an owner for the member-tool token"
```

---

### Task 2: The tool registry

**Files:**
- Create: `config/member-tools.ts`
- Test: `tests/unit/member-tools-config.test.ts`

**Interfaces:**
- Consumes: `MemberToolsEnv` (type-only) from Task 1; `MembershipPlanCode` from `lib/membership/constants`.
- Produces: `MemberTool`; `MEMBER_TOOLS: readonly MemberTool[]`; `memberToolOrigins: readonly string[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/member-tools-config.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {MEMBER_TOOLS, memberToolOrigins} from "@/config/member-tools";
import {entitlementsFor} from "@/lib/membership/entitlements";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

describe("member tool registry", () => {
  it("is not empty and declares unique keys", () => {
    expect(MEMBER_TOOLS.length).toBeGreaterThan(0);
    const keys = MEMBER_TOOLS.map(({key}) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(MEMBER_TOOLS)("declares a safe, tokenless origin for $key", (tool) => {
    expect(tool.titleKey).toMatch(/\S/);
    expect(tool.tokenParam).toMatch(/^[a-z][a-z0-9_-]*$/);

    const url = new URL(tool.url);
    // https only, and the URL carries no credential of its own: the token is injected at
    // render time from the environment, never stored beside the origin.
    expect(url.protocol).toBe("https:");
    expect(url.username).toBe("");
    expect(url.password).toBe("");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });

  it.each(MEMBER_TOOLS)("names only entitled plans for $key", (tool) => {
    expect(tool.tiers.length).toBeGreaterThan(0);
    for (const plan of tool.tiers) {
      expect(MEMBERSHIP_PLAN_CODES).toContain(plan);
      // The one place the registry and the entitlements are held together. A tool may only
      // name a plan the entitlements actually grant member tools to.
      expect(entitlementsFor(plan).memberTools).toBe("included");
    }
  });

  it("publishes exactly the origins the tools declare, deduplicated", () => {
    expect(memberToolOrigins).toEqual([...new Set(MEMBER_TOOLS.map(({url}) => new URL(url).origin))]);
    for (const tool of MEMBER_TOOLS) {
      expect(memberToolOrigins).toContain(new URL(tool.url).origin);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(MEMBER_TOOLS)).toBe(true);
    for (const tool of MEMBER_TOOLS) expect(Object.isFrozen(tool)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/member-tools-config.test.ts`
Expected: FAIL — `Failed to resolve import "@/config/member-tools"`.

- [ ] **Step 3: Write the registry**

Create `config/member-tools.ts`:

```ts
import type {MemberToolsEnv} from "../lib/config/env";
import type {MembershipPlanCode} from "../lib/membership/constants";

/**
 * One external member tool, embedded in the portal (programme D-2).
 *
 * `url` is the tool's origin only. The access token is NOT here: it comes from the
 * environment through `tokenField`, and `toolFrameSrc` appends it at render time, so no
 * secret is stored in this file, in git, or in a client bundle.
 */
export type MemberTool = Readonly<{
  key: string;
  titleKey: string;
  url: string;
  tokenParam: string;
  tokenField: keyof MemberToolsEnv;
  tiers: readonly MembershipPlanCode[];
}>;

/**
 * Every tool the portal offers.
 *
 * Imported by `next.config.ts` for the CSP `frame-src` list, so this module must stay
 * importable outside the Next runtime: relative imports only, and type-only imports for
 * anything from `lib/config/env.ts` (which begins with `import "server-only"`).
 */
export const MEMBER_TOOLS: readonly MemberTool[] = Object.freeze([
  Object.freeze({
    key: "content-calendar",
    titleKey: "tools.contentCalendar.title",
    url: "https://content-calendar-internal.vercel.app/",
    tokenParam: "token",
    tokenField: "contentCalendarToken",
    tiers: Object.freeze(["startup", "corporate", "patron"] as const),
  }),
]);

/**
 * The distinct origins of the configured tools, for `next.config.ts`'s `frame-src`.
 *
 * Derived rather than written twice: a tool cannot be declared without its host being
 * allowed to be framed, and removing a tool removes its host in the same edit.
 */
export const memberToolOrigins: readonly string[] = Object.freeze([
  ...new Set(MEMBER_TOOLS.map((tool) => new URL(tool.url).origin)),
]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/member-tools-config.test.ts && npm run typecheck`
Expected: PASS, and typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add config/member-tools.ts tests/unit/member-tools-config.test.ts
git commit -m "feat(portal): one registry for the embedded member tools"
```

---

### Task 3: The gate and the iframe src builder

**Files:**
- Create: `lib/portal/member-tools.ts`
- Test: `tests/unit/portal-member-tools.test.ts`

**Interfaces:**
- Consumes: `MemberTool`, `MEMBER_TOOLS` from Task 2; `MembershipPlanCode`.
- Produces: `isToolAvailable(tool: MemberTool, plans: readonly MembershipPlanCode[]): boolean`; `toolFrameSrc(tool: MemberTool, token: string): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/portal-member-tools.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {MEMBER_TOOLS} from "@/config/member-tools";
import {isToolAvailable, toolFrameSrc} from "@/lib/portal/member-tools";

const tool = MEMBER_TOOLS[0];

describe("member tool availability", () => {
  it("locks a plan the tool does not name", () => {
    expect(isToolAvailable(tool, ["community"])).toBe(false);
  });

  it.each(["startup", "corporate", "patron"] as const)("opens for %s", (plan) => {
    expect(isToolAvailable(tool, [plan])).toBe(true);
  });

  it("admits a member who holds several memberships on any one of them", () => {
    expect(isToolAvailable(tool, ["community", "startup"])).toBe(true);
  });

  it("locks a member with no memberships at all", () => {
    expect(isToolAvailable(tool, [])).toBe(false);
  });
});

describe("toolFrameSrc", () => {
  it("appends the token as an encoded query parameter", () => {
    const src = toolFrameSrc(tool, "a b&c");

    expect(new URL(src).searchParams.get(tool.tokenParam)).toBe("a b&c");
    expect(src).not.toContain("a b&c");
  });

  it("keeps the registry's origin", () => {
    expect(new URL(toolFrameSrc(tool, "t")).origin).toBe(new URL(tool.url).origin);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/portal-member-tools.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/portal/member-tools"`.

- [ ] **Step 3: Write the helpers**

Create `lib/portal/member-tools.ts`:

```ts
import type {MemberTool} from "@/config/member-tools";
import type {MembershipPlanCode} from "@/lib/membership/constants";

/**
 * Whether a member may open a tool.
 *
 * The registry's `tiers` is the single authority. `entitlements.memberTools` remains the
 * plan-level statement `/membership` mirrors, and a unit test holds every tool's tiers to
 * plans whose entitlements say `included`, so the two vocabularies cannot drift apart.
 */
export function isToolAvailable(tool: MemberTool, plans: readonly MembershipPlanCode[]): boolean {
  return tool.tiers.some((tier) => plans.includes(tier));
}

/**
 * The iframe `src`: the tool's origin with its access token appended.
 *
 * `URLSearchParams` does the encoding, so a token containing `&`, spaces or anything else
 * cannot truncate the query or inject a second parameter.
 */
export function toolFrameSrc(tool: MemberTool, token: string): string {
  const url = new URL(tool.url);
  url.searchParams.set(tool.tokenParam, token);
  return url.toString();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/portal-member-tools.test.ts && npm run typecheck`
Expected: PASS, and typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/portal/member-tools.ts tests/unit/portal-member-tools.test.ts
git commit -m "feat(portal): the member-tool gate and the token-bearing src"
```

---

### Task 4: The `frame-src` allow-list

**Files:**
- Modify: `next.config.ts`
- Test: `tests/unit/member-tools-csp.test.ts`

**Interfaces:**
- Consumes: `memberToolOrigins` from Task 2.
- Produces: nothing importable — an added CSP directive.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/member-tools-csp.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import {memberToolOrigins} from "@/config/member-tools";

async function contentSecurityPolicy(): Promise<string> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const header = rules
    .flatMap((rule) => rule.headers)
    .find(({key}) => key === "Content-Security-Policy");
  return header?.value ?? "";
}

function frameSrcDirective(value: string): string | undefined {
  return value.split(";").map((part) => part.trim()).find((part) => part.startsWith("frame-src "));
}

describe("member tools CSP", () => {
  it("permits framing of exactly the configured tool origins", async () => {
    expect(memberToolOrigins.length).toBeGreaterThan(0);
    expect(frameSrcDirective(await contentSecurityPolicy())).toBe(`frame-src ${memberToolOrigins.join(" ")}`);
  });

  it("still refuses to be framed itself", async () => {
    // What stops a contributor "fixing" frame-src by removing frame-ancestors, which is
    // what makes the admin approve/publish forms clickjackable.
    expect(await contentSecurityPolicy()).toContain("frame-ancestors 'none'");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/member-tools-csp.test.ts`
Expected: FAIL — the `frame-src` directive is `undefined`.

- [ ] **Step 3: Add the directive**

In `next.config.ts`, add the import beside the other config imports (line 5-6):

```ts
import {memberToolOrigins} from "./config/member-tools";
```

Then add `frame-src` to `contentSecurityPolicy` (the array at lines 37-43). Change the closing entries so the array reads:

```ts
const contentSecurityPolicy = [
  "img-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  // Phase D-2: the member tools are third-party pages iframed inside the portal, and only
  // their origins may be framed. Derived from config/member-tools.ts, so a tool cannot be
  // declared without its host being allowed. No `default-src` is declared: naming it would
  // make every unnamed directive restrictive at once (see the block comment above).
  `frame-src ${memberToolOrigins.length > 0 ? memberToolOrigins.join(" ") : "'none'"}`,
].join("; ");
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/member-tools-csp.test.ts tests/unit/image-render-policy.test.ts`
Expected: PASS both. (`image-render-policy` pins that no `default-src` is declared; adding `frame-src` must not break it.)

- [ ] **Step 5: Commit**

```bash
git add next.config.ts tests/unit/member-tools-csp.test.ts
git commit -m "feat(security): allow framing of the configured tool origins only"
```

---

### Task 5: Portal navigation and strings

**Files:**
- Modify: `config/internal-navigation.ts`
- Modify: `components/portal/portal-nav.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Modify: `tests/unit/internal-navigation-config.test.ts`, `tests/unit/portal-nav.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: the `tools` nav id and the `Portal.tools.*` message tree the pages read.

- [ ] **Step 1: Add the nav link and its label key**

In `config/internal-navigation.ts`, in `portalNavigationGroups.primary.links`, add the tools link between `documents` and `billing`:

```ts
      {id: "documents", href: "/portal/documents"},
      // Phase D-2: the member tools sit with the account's benefits, before billing.
      {id: "tools", href: "/portal/tools"},
      {id: "billing", href: "/portal/billing"},
```

In `components/portal/portal-nav.tsx`, add the label to `linkLabelKeys`:

```ts
  documents: "documents.title",
  tools: "tools.title",
  billing: "billing.title",
```

- [ ] **Step 2: Add the strings to both bundles**

Inside the existing `"Portal": { … }` object of `messages/en.json`, add:

```json
    "tools": {
      "eyebrow": "Member tools",
      "title": "Your member tools",
      "description": "Tools included with your membership plan.",
      "open": "Open tool",
      "lockedTitle": "Not included in your plan",
      "lockedDescription": "This tool is available on the Startup, Corporate and Patron plans.",
      "upgrade": "View membership plans",
      "unavailableTitle": "Temporarily unavailable",
      "unavailableDescription": "This tool could not be loaded. Please try again shortly.",
      "contentCalendar": {
        "title": "Content calendar"
      }
    },
```

Inside the existing `"Portal": { … }` object of `messages/zh-HK.json`, add:

```json
    "tools": {
      "eyebrow": "會員工具",
      "title": "你的會員工具",
      "description": "包含於你的會籍計劃的工具。",
      "open": "開啟工具",
      "lockedTitle": "你的計劃未包含此工具",
      "lockedDescription": "此工具適用於 Startup、Corporate 及 Patron 會籍。",
      "upgrade": "查看會籍計劃",
      "unavailableTitle": "暫時無法使用",
      "unavailableDescription": "此工具暫時無法載入，請稍後再試。",
      "contentCalendar": {
        "title": "內容日曆"
      }
    },
```

- [ ] **Step 3: Update the two tests that pin the portal nav**

In `tests/unit/internal-navigation-config.test.ts`, change the first test's title and expected hrefs:

```ts
  it("defines exactly the Portal's 9 primary nav links, Dashboard first, no seats item", () => {
    const links = portalGroups.flatMap((group) => group.links);
    expect(links.map((link) => link.href)).toEqual([
      "/portal",
      "/portal/profile",
      "/portal/company",
      "/portal/company/listing",
      "/portal/directory",
      "/portal/events",
      "/portal/documents",
      "/portal/tools",
      "/portal/billing",
    ]);
    expect(links.some((link) => link.href.includes("seats"))).toBe(false);
  });
```

In `tests/unit/portal-nav.test.tsx`, change the third test's title and expected array:

```ts
  it("renders every one of the Portal's 9 primary nav links plus a brand link", () => {
    render(<PortalNav locale="en" />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/portal",
        "/portal/profile",
        "/portal/company",
        "/portal/company/listing",
        "/portal/directory",
        "/portal/events",
        "/portal/documents",
        "/portal/tools",
        "/portal/billing",
      ]),
    );
  });
```

- [ ] **Step 4: Run the tests and the string audit**

Run: `npx vitest run tests/unit/internal-navigation-config.test.ts tests/unit/portal-nav.test.tsx && npm run audit:strings`
Expected: PASS both; `Visible-string audit passed`.

- [ ] **Step 5: Commit**

```bash
git add config/internal-navigation.ts components/portal/portal-nav.tsx messages/en.json messages/zh-HK.json tests/unit/internal-navigation-config.test.ts tests/unit/portal-nav.test.tsx
git commit -m "feat(portal): a Member tools nav entry, in both locales"
```

---

### Task 6: The tools list page

**Files:**
- Create: `app/[locale]/(member)/portal/tools/page.tsx`
- Test: `tests/unit/portal-tools-list-page.test.tsx`

**Interfaces:**
- Consumes: `MEMBER_TOOLS` (Task 2), `isToolAvailable` (Task 3), the `Portal.tools.*` strings (Task 5), `requireActor` from `@/lib/auth/actor`, `getDashboard` from `@/lib/portal/queries`.
- Produces: the `/portal/tools` route.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/portal-tools-list-page.test.tsx`:

```tsx
import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({plans: ["community"] as string[]}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/auth/actor", () => ({
  requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})),
}));
vi.mock("@/lib/portal/queries", () => ({
  getDashboard: vi.fn(async () => ({
    memberships: state.plans.map((planCode, index) => ({id: `m${index}`, planCode})),
    companies: [],
  })),
}));

import PortalToolsPage from "@/app/[locale]/(member)/portal/tools/page";

describe("/portal/tools", () => {
  beforeEach(() => {
    state.plans = ["community"];
  });

  it("renders the tools heading", async () => {
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: "tools.title"})).toBeVisible();
  });

  it("shows a locked card and the upgrade path for a Community member", async () => {
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByText("tools.lockedTitle")).toBeVisible();
    expect(screen.queryByRole("link", {name: "tools.open"})).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: "tools.upgrade"})).toHaveAttribute("href", "/membership");
  });

  it("links an entitled member through to the tool", async () => {
    state.plans = ["startup"];
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("link", {name: "tools.open"})).toHaveAttribute("href", "/portal/tools/content-calendar");
    expect(screen.queryByText("tools.lockedTitle")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/portal-tools-list-page.test.tsx`
Expected: FAIL — `Failed to resolve import ".../portal/tools/page"`.

- [ ] **Step 3: Write the page**

Create `app/[locale]/(member)/portal/tools/page.tsx`:

```tsx
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MEMBER_TOOLS} from "@/config/member-tools";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {isToolAvailable} from "@/lib/portal/member-tools";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function PortalToolsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const [dashboard, t] = await Promise.all([
    getDashboard(actor),
    getTranslations({locale, namespace: "Portal"}),
  ]);
  const plans = dashboard.memberships.map((membership) => membership.planCode);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("tools.eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("tools.title")}</h1>
        <p className="text-lg text-muted-foreground">{t("tools.description")}</p>
      </header>
      <ul className="grid gap-4 md:grid-cols-2">
        {MEMBER_TOOLS.map((tool) => {
          const available = isToolAvailable(tool, plans);
          return (
            <li className="glass-card flex flex-col gap-3 p-5" key={tool.key}>
              <h2 className="font-serif text-2xl font-semibold">{t(tool.titleKey)}</h2>
              {available ? (
                <Link className="inline-flex min-h-11 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href={localizedPath(locale, `/portal/tools/${tool.key}`)}>
                  {t("tools.open")}
                </Link>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium">{t("tools.lockedTitle")}</p>
                  <p className="text-sm text-muted-foreground">{t("tools.lockedDescription")}</p>
                  <Link className="text-link" href={localizedPath(locale, "/membership")}>{t("tools.upgrade")}</Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/portal-tools-list-page.test.tsx && npm run typecheck`
Expected: PASS, and typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(member)/portal/tools/page.tsx" tests/unit/portal-tools-list-page.test.tsx
git commit -m "feat(portal): list the member tools each plan may open"
```

---

### Task 7: The tool embed page

**Files:**
- Create: `app/[locale]/(member)/portal/tools/[key]/page.tsx`
- Test: `tests/unit/portal-tool-detail-page.test.tsx`

**Interfaces:**
- Consumes: `MEMBER_TOOLS` (Task 2), `isToolAvailable`, `toolFrameSrc` (Task 3), `memberToolsEnv` (Task 1), the `Portal.tools.*` strings (Task 5).
- Produces: the `/portal/tools/[key]` route.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/portal-tool-detail-page.test.tsx`:

```tsx
import {render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({plans: ["startup"] as string[], notFound: vi.fn()}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { state.notFound(); throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/auth/actor", () => ({
  requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})),
}));
vi.mock("@/lib/portal/queries", () => ({
  getDashboard: vi.fn(async () => ({
    memberships: state.plans.map((planCode, index) => ({id: `m${index}`, planCode})),
    companies: [],
  })),
}));

import PortalToolPage from "@/app/[locale]/(member)/portal/tools/[key]/page";

const params = (key: string) => Promise.resolve({locale: "en", key});

describe("/portal/tools/[key]", () => {
  beforeEach(() => {
    state.plans = ["startup"];
    state.notFound.mockClear();
    process.env.MEMBER_TOOL_CONTENT_CALENDAR_TOKEN = "fixture-token";
  });

  afterEach(() => {
    delete process.env.MEMBER_TOOL_CONTENT_CALENDAR_TOKEN;
  });

  it("frames the tool with the token from the environment", async () => {
    const {container} = render(await PortalToolPage({params: params("content-calendar")}));
    const frame = container.querySelector("iframe");

    expect(frame).not.toBeNull();
    expect(frame!.getAttribute("title")).toBe("tools.contentCalendar.title");
    expect(frame!.getAttribute("referrerpolicy")).toBe("no-referrer");
    const src = new URL(frame!.getAttribute("src") ?? "");
    expect(src.origin).toBe("https://content-calendar-internal.vercel.app");
    expect(src.searchParams.get("token")).toBe("fixture-token");
  });

  it("shows the upgrade path for a plan the tool does not name, and frames nothing", async () => {
    state.plans = ["community"];
    const {container} = render(await PortalToolPage({params: params("content-calendar")}));

    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("tools.lockedTitle")).toBeVisible();
    expect(screen.getByRole("link", {name: "tools.upgrade"})).toHaveAttribute("href", "/membership");
  });

  it("fails closed when the token is not configured", async () => {
    delete process.env.MEMBER_TOOL_CONTENT_CALENDAR_TOKEN;
    const {container} = render(await PortalToolPage({params: params("content-calendar")}));

    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("tools.unavailableTitle")).toBeVisible();
  });

  it("404s an unknown tool key", async () => {
    await expect(PortalToolPage({params: params("not-a-tool")})).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.notFound).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/portal-tool-detail-page.test.tsx`
Expected: FAIL — `Failed to resolve import ".../portal/tools/[key]/page"`.

- [ ] **Step 3: Write the page**

Create `app/[locale]/(member)/portal/tools/[key]/page.tsx`:

```tsx
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {MEMBER_TOOLS} from "@/config/member-tools";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {memberToolsEnv} from "@/lib/config/env";
import {isToolAvailable, toolFrameSrc} from "@/lib/portal/member-tools";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string; key: string}>}>;

export default async function PortalToolPage({params}: Props) {
  const {locale: localeValue, key} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const tool = MEMBER_TOOLS.find((candidate) => candidate.key === key);
  if (!tool) notFound();
  const [dashboard, t] = await Promise.all([
    getDashboard(actor),
    getTranslations({locale, namespace: "Portal"}),
  ]);
  const available = isToolAvailable(tool, dashboard.memberships.map((membership) => membership.planCode));

  if (!available) {
    return (
      <section className="glass-card max-w-2xl space-y-3 p-6">
        <h1 className="font-serif text-3xl font-semibold">{t(tool.titleKey)}</h1>
        <p className="font-medium">{t("tools.lockedTitle")}</p>
        <p className="text-muted-foreground">{t("tools.lockedDescription")}</p>
        <Link className="text-link" href={localizedPath(locale, "/membership")}>{t("tools.upgrade")}</Link>
      </section>
    );
  }

  // Fail closed rather than embed a tool we cannot authenticate: a frame that loads the
  // tool's 401 is worse than saying so, and a missing token must not 500 the portal.
  const token = memberToolsEnv()[tool.tokenField];
  if (!token) {
    return (
      <section className="glass-card max-w-2xl space-y-3 p-6">
        <h1 className="font-serif text-3xl font-semibold">{t(tool.titleKey)}</h1>
        <p className="font-medium">{t("tools.unavailableTitle")}</p>
        <p className="text-muted-foreground">{t("tools.unavailableDescription")}</p>
      </section>
    );
  }

  // No `sandbox`: the framed document is cross-origin, so the browser already isolates it
  // from our origin and DOM. A sandbox without `allow-same-origin` would give it an opaque
  // origin and stop it sending its SameSite=None; Partitioned auth cookie, and with it the
  // attribute is all but a no-op for a cross-origin frame. `referrerPolicy="no-referrer"`
  // keeps the token-bearing URL out of the Referer.
  return (
    <iframe
      className="h-[calc(100dvh-8rem)] w-full rounded-lg border border-border"
      referrerPolicy="no-referrer"
      src={toolFrameSrc(tool, token)}
      title={t(tool.titleKey)}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/portal-tool-detail-page.test.tsx && npm run typecheck`
Expected: PASS, and typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(member)/portal/tools/[key]/page.tsx" tests/unit/portal-tool-detail-page.test.tsx
git commit -m "feat(portal): embed the member tool behind the plan gate"
```

---

### Task 8: The gated acceptance walk and the full gate

**Files:**
- Create: `tests/e2e/phase-d2-member-tools.spec.ts`

**Interfaces:**
- Consumes: the two pages (Tasks 6-7), the registry (Task 2), the strings (Task 5).
- Produces: nothing importable.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/phase-d2-member-tools.spec.ts`. It mirrors `tests/e2e/phase-b2-member-directory.spec.ts`: it signs in through `signInForM2`, reads the heading from the bundle rather than hard-coding copy, and skips when the isolated M2 environment is not configured.

```ts
import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Portal: Readonly<{tools: Readonly<{title: string; lockedTitle: string}>}>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const locales = [
  {locale: "en" as const, prefix: ""},
  {locale: "zh-HK" as const, prefix: "/zh"},
];

const missing = missingM2LiveEnvironment();

/**
 * Phase D-2 exit: a member opens the embedded tool from the portal without a second login.
 * The frame's src is built from `config/member-tools.ts`; the token comes from the
 * environment and is never printed, only asserted for presence. A member fixture that is
 * Community-only will fail the frame assertion — that is a fixture problem, not a product
 * one, and the same stance phase-b2 takes on its publish control.
 */
for (const {locale, prefix} of locales) {
  const copy = bundle(locale);

  test(`${locale}: the member tools list renders`, async ({page}) => {
    test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);
    await signInForM2(page, "member");
    await page.goto(`${prefix}/portal/tools`);
    await expect(page.getByRole("heading", {level: 1, name: copy.Portal.tools.title})).toBeVisible();
  });

  test(`${locale}: an entitled member gets the tool embedded, not a second login`, async ({page}) => {
    test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);
    await signInForM2(page, "member");
    const response = await page.goto(`${prefix}/portal/tools/content-calendar`);
    expect(response?.status()).toBe(200);
    const frame = page.locator("iframe");
    await expect(frame).toHaveCount(1);
    const src = (await frame.getAttribute("src")) ?? "";
    const url = new URL(src);
    expect(url.origin).toBe("https://content-calendar-internal.vercel.app");
    expect(url.searchParams.get("token")).not.toBeNull();
  });
}
```

- [ ] **Step 2: Run the focused suite and the gate**

Run: `npm run audit:strings && npm run lint && npm run typecheck && npx vitest run tests/unit/member-tools-config.test.ts tests/unit/portal-member-tools.test.ts tests/unit/member-tools-csp.test.ts tests/unit/portal-tools-list-page.test.tsx tests/unit/portal-tool-detail-page.test.tsx tests/unit/env-contract.test.ts tests/unit/internal-navigation-config.test.ts tests/unit/portal-nav.test.tsx`
Expected: all PASS.

- [ ] **Step 3: Run the whole gate**

Run: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green. Note the build time; a bad `next.config.ts` import (a runtime pull from `lib/config/env.ts`) fails here with a `server-only` error, which is the signal to make the registry's imports relative and type-only.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/phase-d2-member-tools.spec.ts
git commit -m "test(e2e): a member opens the embedded tool with no second login"
```

---

## Verification checklist

Against the spec's §7 Definition of done:

| # | Done when | Task |
|---|---|---|
| 1 | `config/member-tools.ts` holds the one tool, with no token in it | 2 |
| 2 | `/portal/tools` lists it; the detail embeds it for startup/corporate/patron and locks community | 6, 7 |
| 3 | The token is read from env and never appears in git | 1, 7 |
| 4 | `frame-src` names the tool origin, derived from the registry | 4 |
| 5 | Navigation and both bundles are in parity; the five gate commands are green | 5, 8 |
| 6 | A member opens the tool without a second login | 8 |

Not in scope, not claimed: the hand-off JWT, the tool's own behaviour, per-member identity
inside it, and D-3/D-4.
