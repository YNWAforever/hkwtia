# Phase A — Foundation & Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every recruitment CTA land somewhere useful, capture WhatsApp consent with provenance for members and prospects, turn inbound interest (form and WhatsApp) into `contacts`, and give staff a read-only inbox and task list — without rebuilding anything that already works.

**Architecture:** Additive Drizzle changes (`profiles` consent columns, new `contacts` table) generated with drizzle-kit; every write goes through an actor-taking repository (`lib/db/repos/*`) with `"use server"` wrappers kept thin (CLAUDE.md boundary #3); public writers use dedicated capability actors like the existing `unsubscribeActor()`; every user-visible string lands in both message bundles; each task ends green on `npm test` (targeted), `npm run lint`, `npm run typecheck`.

**Tech Stack:** Next.js 16 App Router (webpack) · React 19 · TypeScript strict · Drizzle ORM on Neon · next-intl v4 (`en`, `zh-HK` at `/zh`) · Zod · Vitest (jsdom) · Playwright · Tailwind v3.

**Programme context:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (decisions D-1…D-14). Findings referenced as F-numbers come from `docs/wtia-platform-audit-2026-09-08.md`.

**Working rules for every task**
- Run the focused test first and read its failure before writing code (AGENTS.md).
- Never hand-build a locale prefix; use `localizedPath` (`tests/unit/locale-href-boundary.test.ts` enforces it).
- Never export an actor-taking function from a `"use server"` module (`tests/unit/server-action-actor-boundary.test.ts` enforces it).
- `npm run audit:strings` must stay green: all visible JSX text comes from `messages/en.json` + `messages/zh-HK.json`.
- Commit after every task with a conventional message.

---

## File map

| Path | Task | Responsibility |
|---|---|---|
| `lib/membership/entitlements.ts` (C) | 1 | Per-plan entitlement map (D-5) |
| `app/[locale]/(public)/membership/page.tsx` (M) | 1 | Distinct benefits and CTA per tier |
| `lib/membership/join-plan-chooser.ts` (C) | 2 | Pure list of plan chooser items |
| `app/[locale]/(join)/join/page.tsx` (M) | 2 | Bare `/join` renders the chooser |
| `lib/db/schema-core.ts` (M) | 3 | `profiles` consent columns, `contacts` table, enums |
| `drizzle/0025_phase_a_contacts_consent.sql` (generated) | 3 | Migration |
| `lib/whatsapp/number.ts` (C), `lib/whatsapp/consent.ts` (C) | 4 | Pure number normaliser and consent provenance |
| `lib/channels/woztell.ts` (M) | 4 | Re-export normaliser from `lib/whatsapp/number.ts` |
| `lib/membership/join-schema.ts`, `lib/db/repos/profiles.ts`, `app/[locale]/(join)/join/actions.ts`, `app/[locale]/(join)/join/profile/page.tsx` (M) | 4 | Join consent capture |
| `lib/portal/command-core.ts`, `lib/portal/commands.ts`, `lib/portal/queries.ts`, `app/[locale]/(member)/portal/profile/page.tsx` (M) | 5 | Portal consent editing |
| `lib/db/repos/contacts.ts` (C) | 6 | Contacts repository with capability actors |
| `lib/growth/interest-service.ts` (C), `lib/growth/interest-action.ts` (C), `components/marketing/interest-form.tsx` (C) | 7 | Interest form service/action/UI |
| `app/[locale]/(public)/events/page.tsx`, `components/home/open-now.tsx` (M) | 7 | Wire the form; unloop the CTA (F7) |
| `lib/ai/woztell-webhook.ts`, `lib/ai/woztell-production.ts`, `lib/db/repos/suppressions.ts` (M) | 8 | Unknown sender → contact; STOP → suppression (F3, F12) |
| `lib/api/unsubscribe-route.ts`, `app/[locale]/(public)/unsubscribe/page.tsx` (M) | 9 | `channel` parameter |
| `config/site.ts` (M), `lib/whatsapp/click-to-chat.ts` (C), `components/marketing/whatsapp-link.tsx` (C), header/footer/contact (M) | 10 | Click-to-chat (F4) |
| `lib/db/repos/inbox.ts` (C), `lib/db/repos/staff-tasks.ts` (M), `lib/admin/inbox.ts` (C), `lib/admin/task-action-core.ts` (C), `lib/admin/task-actions.ts` (C), admin pages + components (C), `config/internal-navigation.ts`, `components/admin/admin-nav.tsx`, `app/[locale]/(admin)/admin/page.tsx` (M) | 11 | Inbox v0 + staff tasks (F2) |
| `lib/admin/segment-schema.ts`, `lib/db/repos/segments.ts`, `components/admin/segment-builder.tsx` (M) | 12 | `whatsappOptIn` filter (F11) |
| `lib/programs/programme-header.ts`, `tests/unit/programme-header.test.ts`, `app/[locale]/(member)/portal/page.tsx`, `scripts/archive-demo-content.ts` (C), `messages/*` Privacy section | 13 | Hygiene (F20, F21, F14, D-6) |

---

### Task 1: Entitlement map and honest tier benefits (F9, D-5)

**Files:**
- Create: `lib/membership/entitlements.ts`
- Modify: `app/[locale]/(public)/membership/page.tsx:50-58`
- Modify: `messages/en.json`, `messages/zh-HK.json` (`Membership.tierBenefits`)
- Modify: `tests/unit/wt-pages/membership-page.test.tsx:82`
- Test: `tests/unit/membership-entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/membership-entitlements.test.ts
import {describe, expect, it} from "vitest";

import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";
import {canPublishEvents, entitlementsFor, ENTITLEMENTS} from "@/lib/membership/entitlements";

describe("membership entitlements (programme D-5)", () => {
  it("defines an entry for every plan code", () => {
    for (const code of MEMBERSHIP_PLAN_CODES) expect(ENTITLEMENTS[code]).toBeDefined();
  });

  it("keeps community members off event publishing and gives corporate unlimited", () => {
    expect(entitlementsFor("community").publishEventsPerQuarter).toBe(0);
    expect(entitlementsFor("startup").publishEventsPerQuarter).toBe(2);
    expect(entitlementsFor("corporate").publishEventsPerQuarter).toBe(Number.POSITIVE_INFINITY);
    expect(canPublishEvents("community")).toBe(false);
    expect(canPublishEvents("startup")).toBe(true);
  });

  it("orders WhatsApp support by tier", () => {
    expect(entitlementsFor("community").whatsappSupport).toBe("none");
    expect(entitlementsFor("startup").whatsappSupport).toBe("standard");
    expect(entitlementsFor("corporate").whatsappSupport).toBe("priority");
    expect(entitlementsFor("patron").whatsappSupport).toBe("dedicated");
  });

  it("rejects an unknown plan code", () => {
    expect(() => entitlementsFor("gold" as never)).toThrow("INVALID_PLAN_CODE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/membership-entitlements.test.ts --reporter=dot`
Expected: FAIL — `Cannot find module '@/lib/membership/entitlements'`

- [ ] **Step 3: Write the entitlement map**

```ts
// lib/membership/entitlements.ts
import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode} from "@/lib/membership/constants";

export type DirectoryListing = "none" | "card" | "profile" | "featured";
export type WhatsAppSupport = "none" | "standard" | "priority" | "dedicated";

export type Entitlements = Readonly<{
  directoryListing: DirectoryListing;
  /** Member-submitted events accepted for review per calendar quarter; Infinity = unlimited. */
  publishEventsPerQuarter: number;
  showcaseListings: number;
  whatsappSupport: WhatsAppSupport;
  memberTools: "trial" | "included";
  coBrandedEvents: boolean;
}>;

/**
 * Programme decision D-5 (2026-09-08). Pages and repositories read this map;
 * WTIA changes a benefit here, never in a page. Keep the keys aligned with
 * `Membership.tierBenefits.<plan>` in the message bundles, which is the copy
 * shown on /membership for the same facts.
 */
export const ENTITLEMENTS: Readonly<Record<MembershipPlanCode, Entitlements>> = Object.freeze({
  community: Object.freeze({directoryListing: "card", publishEventsPerQuarter: 0, showcaseListings: 0, whatsappSupport: "none", memberTools: "trial", coBrandedEvents: false}),
  startup: Object.freeze({directoryListing: "profile", publishEventsPerQuarter: 2, showcaseListings: 1, whatsappSupport: "standard", memberTools: "included", coBrandedEvents: false}),
  corporate: Object.freeze({directoryListing: "featured", publishEventsPerQuarter: Number.POSITIVE_INFINITY, showcaseListings: 3, whatsappSupport: "priority", memberTools: "included", coBrandedEvents: false}),
  patron: Object.freeze({directoryListing: "featured", publishEventsPerQuarter: Number.POSITIVE_INFINITY, showcaseListings: 3, whatsappSupport: "dedicated", memberTools: "included", coBrandedEvents: true}),
});

export function entitlementsFor(plan: MembershipPlanCode): Entitlements {
  if (!(MEMBERSHIP_PLAN_CODES as readonly string[]).includes(plan)) throw new Error("INVALID_PLAN_CODE");
  return ENTITLEMENTS[plan];
}

export function canPublishEvents(plan: MembershipPlanCode): boolean {
  return entitlementsFor(plan).publishEventsPerQuarter > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/membership-entitlements.test.ts --reporter=dot`
Expected: PASS (4 tests)

- [ ] **Step 5: Add per-tier benefit copy to both bundles**

In `messages/en.json`, inside `"Membership"`, add a sibling of `"benefits"`:

```json
"tierBenefits": {
  "community": ["Directory card on /members", "RSVP to public WTIA events", "Activity updates by email or WhatsApp"],
  "startup": ["Full member profile page with logo", "Submit up to 2 events per quarter for WTIA review", "1 showcase listing", "WhatsApp updates and standard support"],
  "corporate": ["Featured member profile and logo wall", "Unlimited reviewed event publishing", "3 showcase listings", "Priority WhatsApp support lane", "Member tools included"],
  "patron": ["Everything in Corporate", "Featured placement on the homepage", "Co-branded WTIA events", "Dedicated WhatsApp support"]
}
```

In `messages/zh-HK.json`, inside `"Membership"`:

```json
"tierBenefits": {
  "community": ["於 /members 顯示會員名片", "報名參加 WTIA 公開活動", "以電郵或 WhatsApp 接收活動更新"],
  "startup": ["完整會員專頁（含商標）", "每季可提交最多 2 個活動供 WTIA 審核", "1 個方案展示頁", "WhatsApp 更新及標準支援"],
  "corporate": ["精選會員專頁及商標牆", "無限次提交活動（經審核）", "3 個方案展示頁", "WhatsApp 優先支援通道", "包含會員工具"],
  "patron": ["包含企業會員所有權益", "首頁精選位置", "與 WTIA 聯合品牌活動", "專屬 WhatsApp 支援"]
}
```

- [ ] **Step 6: Render the per-tier benefits and the right CTA on /membership**

In `app/[locale]/(public)/membership/page.tsx` replace lines 50–58 (from `const benefits = [...]` through the closing `}));`) with:

```tsx
  const tiers: PlanGridTier[] = publicTiers.map((tier) => ({
    code: tier.code,
    name: t(`tiers.${tier.code}.name`),
    description: t(`tiers.${tier.code}.description`),
    priceLines: priceLines(tier.price, labels),
    // Programme D-5: the copy for each tier's real entitlements lives in the
    // bundle beside lib/membership/entitlements.ts; the old shared triple
    // said the same thing about every tier, which sells nothing.
    benefits: (t.raw(`tierBenefits.${tier.code}`) as string[]),
    action: tier.cta.kind === "join" ? t("actions.join") : t("actions.contact"),
    href: tier.cta.href,
  }));
```

- [ ] **Step 7: Update the page test that pinned the old CTA**

In `tests/unit/wt-pages/membership-page.test.tsx` line 82 change

```ts
    expect(html).toContain(bundles.en.Membership.actions.discuss);
```

to

```ts
    expect(html).toContain(bundles.en.Membership.actions.join);
    expect(html).toContain(bundles.en.Membership.actions.contact);
    expect(html).toContain(bundles.en.Membership.tierBenefits.corporate[1]);
```

The test file's `getTranslations` mock returns a plain function; extend it so `t.raw` exists. In the same file replace the `getTranslations` mock body with:

```ts
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) => {
    const t = (key: string) => String(messageAt(locale, namespace, key));
    (t as unknown as {raw: (key: string) => unknown}).raw = (key: string) => messageAt(locale, namespace, key);
    return t;
  }),
```

- [ ] **Step 8: Run the page tests, string audit, typecheck**

Run: `npx vitest run tests/unit/wt-pages/membership-page.test.tsx tests/unit/membership-page-catalog.test.tsx --reporter=dot && npm run audit:strings && npm run typecheck`
Expected: all PASS, audit exits 0

- [ ] **Step 9: Commit**

```bash
git add lib/membership/entitlements.ts tests/unit/membership-entitlements.test.ts "app/[locale]/(public)/membership/page.tsx" messages/en.json messages/zh-HK.json tests/unit/wt-pages/membership-page.test.tsx
git commit -m "feat(membership): entitlement map and per-tier benefits with join CTAs (D-5, F9)"
```

---

### Task 2: Bare `/join` renders a plan chooser (F8)

**Files:**
- Create: `lib/membership/join-plan-chooser.ts`
- Modify: `app/[locale]/(join)/join/page.tsx:47-53`
- Modify: `messages/en.json`, `messages/zh-HK.json` (`Join.choosePlan*`)
- Test: `tests/unit/join-plan-chooser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/join-plan-chooser.test.ts
import {describe, expect, it} from "vitest";

import {planChooserItems} from "@/lib/membership/join-plan-chooser";

describe("planChooserItems", () => {
  it("links self-serve plans to /join?plan= and patron to /contact, locale-prefixed", () => {
    const en = planChooserItems("en");
    expect(en.map((item) => item.code)).toEqual(["community", "startup", "corporate", "patron"]);
    expect(en.find((item) => item.code === "startup")?.href).toBe("/join?plan=startup");
    expect(en.find((item) => item.code === "patron")).toMatchObject({href: "/contact", kind: "contact"});

    const zh = planChooserItems("zh-HK");
    expect(zh.find((item) => item.code === "community")?.href).toBe("/zh/join?plan=community");
    expect(zh.find((item) => item.code === "patron")?.href).toBe("/zh/contact");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/join-plan-chooser.test.ts --reporter=dot`
Expected: FAIL — `Cannot find module '@/lib/membership/join-plan-chooser'`

- [ ] **Step 3: Write the pure helper**

```ts
// lib/membership/join-plan-chooser.ts
import type {AppLocale} from "@/i18n/routing";
import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode} from "@/lib/membership/constants";
import {localizedPath} from "@/lib/urls";

export type PlanChooserItem = Readonly<{code: MembershipPlanCode; href: string; kind: "join" | "contact"}>;

/**
 * Bare /join used to render "This membership plan is unavailable" (audit F8)
 * because every header, footer and homepage CTA links to it without ?plan=.
 * Patron is review-only (lib/membership/plans.ts billingBehavior "review"),
 * so it routes to /contact exactly as the /membership catalog does.
 */
export function planChooserItems(locale: AppLocale): readonly PlanChooserItem[] {
  return MEMBERSHIP_PLAN_CODES.map((code) => code === "patron"
    ? {code, href: localizedPath(locale, "/contact"), kind: "contact"}
    : {code, href: `${localizedPath(locale, "/join")}?plan=${code}`, kind: "join"});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/join-plan-chooser.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: Add the chooser copy to both bundles**

`messages/en.json` → inside `"Join"` add:

```json
"choosePlanTitle": "Choose a membership plan",
"choosePlanDescription": "Pick the plan that fits how your organisation participates. You can compare fees and benefits on the membership page first.",
"choosePlanCompare": "Compare plans and fees",
"choosePlan": {
  "community": "Free. Stay connected, RSVP to public events, receive updates.",
  "startup": "For early-stage technology teams: profile page, 2 reviewed events a quarter, 1 showcase listing.",
  "corporate": "For established organisations: featured profile, unlimited reviewed events, priority WhatsApp support.",
  "patron": "Strategic supporters of WTIA's mission — talk to the team."
},
"choosePlanAction": "Continue with {plan}",
"choosePlanContact": "Contact WTIA"
```

`messages/zh-HK.json` → inside `"Join"` add:

```json
"choosePlanTitle": "選擇會員計劃",
"choosePlanDescription": "選擇最適合貴機構參與方式的計劃。你可先在會員計劃頁比較費用及權益。",
"choosePlanCompare": "比較計劃及費用",
"choosePlan": {
  "community": "免費。保持聯繫、報名公開活動、接收更新。",
  "startup": "適合初創科技團隊：會員專頁、每季 2 個經審核活動、1 個方案展示頁。",
  "corporate": "適合成熟機構：精選專頁、無限次經審核活動、WhatsApp 優先支援。",
  "patron": "WTIA 使命的策略支持者 — 請與團隊聯絡。"
},
"choosePlanAction": "以{plan}繼續",
"choosePlanContact": "聯絡 WTIA"
```

- [ ] **Step 6: Render the chooser when no plan and no continuation**

In `app/[locale]/(join)/join/page.tsx` add the import after the `localizedPath` import:

```ts
import {planChooserItems} from "@/lib/membership/join-plan-chooser";
```

Replace the block at lines 47–53 (`if (!plan && !continuation) return (...)`) with:

```tsx
  if (!plan && !continuation) {
    // A malformed ?plan= still gets the old "unavailable" message; a bare /join
    // gets the chooser, because that is where every "Join WiseTech" CTA lands.
    if (queryValue(query.plan) !== undefined) return (
      <section className="glass-card p-6 sm:p-10">
        <h1 className="font-serif text-4xl font-semibold">{t("invalidPlanTitle")}</h1>
        <p className="mt-4 text-muted-foreground">{t("invalidPlanDescription")}</p>
        <Link className="mt-6 inline-flex text-primary underline" href={localizedPath(locale, "/membership")}>{t("backToMembership")}</Link>
      </section>
    );
    return (
      <section className="glass-card p-6 sm:p-10">
        <JoinProgress active="plan" labels={labels} showCompany={false}/>
        <h1 className="mt-3 font-serif text-4xl font-semibold">{t("choosePlanTitle")}</h1>
        <p className="mt-4 text-muted-foreground">{t("choosePlanDescription")}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {planChooserItems(locale).map((item) => (
            <li className="rounded-lg border border-border p-5" key={item.code}>
              <h2 className="font-serif text-2xl font-semibold">{t(`plans.${item.code}`)}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t(`choosePlan.${item.code}`)}</p>
              <Link className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href={item.href}>
                {item.kind === "join" ? t("choosePlanAction", {plan: t(`plans.${item.code}`)}) : t("choosePlanContact")}
              </Link>
            </li>
          ))}
        </ul>
        <Link className="mt-6 inline-flex text-primary underline" href={localizedPath(locale, "/membership")}>{t("choosePlanCompare")}</Link>
      </section>
    );
  }
```

`JoinProgress` already accepts `active: "plan"` (`components/join/progress.tsx:3` — `JoinProgressStep = "plan" | "auth" | "profile" | "company"`).

- [ ] **Step 7: Run the join page tests, string audit, typecheck**

Run: `npx vitest run tests/unit/join-page.test.tsx tests/unit/join-navigation.test.ts --reporter=dot && npm run audit:strings && npm run typecheck`
Expected: PASS; if `join-page.test.tsx` asserted the old "unavailable" text for bare `/join`, change that assertion to expect `bundles.en.Join.choosePlanTitle`.

- [ ] **Step 8: Commit**

```bash
git add lib/membership/join-plan-chooser.ts tests/unit/join-plan-chooser.test.ts "app/[locale]/(join)/join/page.tsx" messages/en.json messages/zh-HK.json tests/unit/join-page.test.tsx
git commit -m "feat(join): render a plan chooser on bare /join instead of an error (F8)"
```

---

### Task 3: Schema — consent provenance on `profiles`, new `contacts` table (D-6, D-7)

**Files:**
- Modify: `lib/db/schema-core.ts` (enums after line 93; `profiles` after line 119; new table after `leads`, before `acceptanceSentinel`; types at the end)
- Generate: `drizzle/0025_phase_a_contacts_consent.sql` + `drizzle/meta/*`
- Modify: `tests/unit/schema-contract.test.ts`

- [ ] **Step 1: Write the failing schema-contract test**

Append to `tests/unit/schema-contract.test.ts` (add `contacts` to the import list from `@/lib/db/server-schema`):

```ts
describe("phase A contacts and consent contract", () => {
  it("records WhatsApp consent provenance on profiles", () => {
    expect(profiles.whatsappConsentAt).toBeDefined();
    expect(profiles.whatsappConsentSource).toBeDefined();
    expect(profiles.whatsappConsentTextVersion).toBeDefined();
    expect(profiles.marketingConsentAt).toBeDefined();
  });

  it("defines contacts with one row per phone and one per Woztell member id", () => {
    const config = getTableConfig(contacts);
    expect(config.name).toBe("contacts");
    const indexNames = config.indexes.map((index) => index.config.name);
    expect(indexNames).toContain("contacts_phone_unique");
    expect(indexNames).toContain("contacts_whatsapp_member_unique");
    expect(indexNames).toContain("contacts_profile_unique");
    expect(contacts.source).toBeDefined();
    expect(contacts.stage).toBeDefined();
    expect(contacts.whatsappOptedOutAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/schema-contract.test.ts --reporter=dot`
Expected: FAIL — `contacts` is not exported / `whatsappConsentAt` undefined

- [ ] **Step 3: Add the enums, columns and table to `lib/db/schema-core.ts`**

After `partnerCategoryEnum` (line 93) add:

```ts
export const contactSourceEnum = pgEnum("contact_source", [
  "whatsapp", "event_guest", "showcase_intro", "join_abandoned", "interest_form", "import",
]);
export const contactStageEnum = pgEnum("contact_stage", [
  "new", "contacted", "qualified", "applied", "member", "closed",
]);
```

Inside `profiles` after `whatsappNumber: text("whatsapp_number"),` (line 119) add:

```ts
  // Programme D-7: consent is only useful if it can be shown. Source values:
  // join | portal | rsvp | interest_form | whatsapp_inbound. Text version pins
  // the wording the person agreed to (lib/whatsapp/consent.ts).
  whatsappConsentAt: timestamp("whatsapp_consent_at", {withTimezone: true}),
  whatsappConsentSource: text("whatsapp_consent_source"),
  whatsappConsentTextVersion: text("whatsapp_consent_text_version"),
  marketingConsentAt: timestamp("marketing_consent_at", {withTimezone: true}),
```

After the `leads` table (line 1015) and before `acceptanceSentinel` add:

```ts
/**
 * The funnel spine (programme D-6). A contact is anyone WTIA may need to
 * reach who is not, or not yet, a profile: a WhatsApp sender we do not
 * recognise, an interest-form submitter, an event guest, an abandoned join.
 * When a contact later signs in, `profile_id` links the two; nothing is
 * merged away. Numbers are stored to reply; marketing consent is separate
 * and off by default.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: text("profile_id").references(() => profiles.id, {onDelete: "set null"}),
    companyId: uuid("company_id").references(() => companies.id, {onDelete: "set null"}),
    displayName: text("display_name"),
    email: text("email"),
    phoneE164: text("phone_e164"),
    whatsappMemberId: text("whatsapp_member_id"),
    source: contactSourceEnum("source").notNull(),
    stage: contactStageEnum("stage").default("new").notNull(),
    ownerProfileId: text("owner_profile_id").references(() => profiles.id, {onDelete: "set null"}),
    tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
    locale: varchar("locale", {length: 10}).default("en").notNull(),
    whatsappOptIn: boolean("whatsapp_opt_in").default(false).notNull(),
    whatsappConsentAt: timestamp("whatsapp_consent_at", {withTimezone: true}),
    whatsappConsentSource: text("whatsapp_consent_source"),
    whatsappConsentTextVersion: text("whatsapp_consent_text_version"),
    whatsappOptedOutAt: timestamp("whatsapp_opted_out_at", {withTimezone: true}),
    lastInboundAt: timestamp("last_inbound_at", {withTimezone: true}),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("contacts_phone_unique").on(table.phoneE164).where(sql`${table.phoneE164} IS NOT NULL`),
    uniqueIndex("contacts_whatsapp_member_unique").on(table.whatsappMemberId).where(sql`${table.whatsappMemberId} IS NOT NULL`),
    uniqueIndex("contacts_profile_unique").on(table.profileId).where(sql`${table.profileId} IS NOT NULL`),
    index("contacts_stage_owner_idx").on(table.stage, table.ownerProfileId),
    index("contacts_email_idx").on(table.email),
    check("contacts_identity_check", sql`${table.email} IS NOT NULL OR ${table.phoneE164} IS NOT NULL OR ${table.whatsappMemberId} IS NOT NULL`),
  ],
);
```

At the end of the file, beside the other type exports add:

```ts
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
```

- [ ] **Step 4: Generate the migration (never hand-edit SQL or meta)**

Run: `npx drizzle-kit generate --config=drizzle.config.ts --name phase_a_contacts_consent`
Expected: `drizzle/0025_phase_a_contacts_consent.sql` created containing `CREATE TYPE "public"."contact_source"`, `CREATE TYPE "public"."contact_stage"`, `CREATE TABLE "contacts"`, four `ALTER TABLE "profiles" ADD COLUMN` lines, and `drizzle/meta/0025_snapshot.json` + `_journal.json` updated with idx 25.

- [ ] **Step 5: Run the schema tests**

Run: `npx vitest run tests/unit/schema-contract.test.ts --reporter=dot && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Apply to the isolated test database and run the migration/seed contract**

Run (with `DATABASE_URL` pointing at the isolated Neon branch from AGENTS.md "Task 11 database setup"): `npm run db:migrate`
Expected: exits 0, applying `0025_phase_a_contacts_consent`.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema-core.ts drizzle/0025_phase_a_contacts_consent.sql drizzle/meta tests/unit/schema-contract.test.ts
git commit -m "feat(db): contacts table and WhatsApp consent provenance on profiles (D-6, D-7)"
```

---

### Task 4: WhatsApp number + consent helpers; capture consent in the join profile step (F1)

**Files:**
- Create: `lib/whatsapp/number.ts`, `lib/whatsapp/consent.ts`
- Modify: `lib/channels/woztell.ts:213-217`
- Modify: `lib/membership/join-schema.ts:20-26`
- Modify: `lib/db/repos/profiles.ts:9-10`
- Modify: `app/[locale]/(join)/join/actions.ts` (`saveProfile`)
- Modify: `app/[locale]/(join)/join/profile/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json` (`Join.fields.whatsappNumber`, `Join.whatsapp.*`, `Join.errors.whatsappNumber`)
- Test: `tests/unit/whatsapp-number.test.ts`, `tests/unit/whatsapp-consent.test.ts`, extend `tests/unit/join-schema.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/whatsapp-number.test.ts
import {describe, expect, it} from "vitest";

import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";
import {normalizeWhatsAppNumber as viaAdapter} from "@/lib/channels/woztell";

describe("normalizeWhatsAppNumber", () => {
  it("keeps digits only and prefixes +", () => {
    expect(normalizeWhatsAppNumber("+852 9123 4567")).toBe("+85291234567");
    expect(normalizeWhatsAppNumber("(852) 9123-4567")).toBe("+85291234567");
  });
  it("rejects too short or too long input", () => {
    expect(normalizeWhatsAppNumber("1234567")).toBeNull();
    expect(normalizeWhatsAppNumber("1234567890123456")).toBeNull();
  });
  it("is the same function the Woztell adapter exports", () => {
    expect(viaAdapter).toBe(normalizeWhatsAppNumber);
  });
});
```

```ts
// tests/unit/whatsapp-consent.test.ts
import {describe, expect, it} from "vitest";

import {WHATSAPP_CONSENT_TEXT_VERSION, whatsappConsentFields} from "@/lib/whatsapp/consent";

describe("whatsappConsentFields", () => {
  const at = new Date("2026-09-08T10:00:00.000Z");
  it("stamps provenance when opting in", () => {
    expect(whatsappConsentFields({optIn: true, source: "join", now: () => at})).toEqual({
      whatsappOptIn: true,
      whatsappConsentAt: at,
      whatsappConsentSource: "join",
      whatsappConsentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
    });
  });
  it("clears opt-in and provenance when opting out", () => {
    expect(whatsappConsentFields({optIn: false, source: "portal", now: () => at})).toEqual({
      whatsappOptIn: false,
      whatsappConsentAt: null,
      whatsappConsentSource: null,
      whatsappConsentTextVersion: null,
    });
  });
});
```

Append to `tests/unit/join-schema.test.ts` inside the existing `describe` (add `profileSchema` to the import from `@/lib/membership/join-schema`):

```ts
  it("normalises a WhatsApp number and refuses opt-in without a number", () => {
    expect(profileSchema.parse({displayName: "Ada", whatsappNumber: "+852 9123 4567", whatsappOptIn: true})).toMatchObject({whatsappNumber: "+85291234567", whatsappOptIn: true});
    expect(profileSchema.safeParse({displayName: "Ada", whatsappNumber: "12", whatsappOptIn: false}).success).toBe(false);
    expect(profileSchema.safeParse({displayName: "Ada", whatsappOptIn: true}).success).toBe(false);
    expect(profileSchema.parse({displayName: "Ada"})).toMatchObject({whatsappNumber: null, whatsappOptIn: false});
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/whatsapp-number.test.ts tests/unit/whatsapp-consent.test.ts tests/unit/join-schema.test.ts --reporter=dot`
Expected: FAIL — modules not found; the schema test fails on `whatsappNumber` being `undefined` rather than `null`

- [ ] **Step 3: Write the pure helpers and re-export from the adapter**

```ts
// lib/whatsapp/number.ts
/** E.164-ish normaliser shared by the Woztell adapter, join and portal forms. */
export function normalizeWhatsAppNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}
```

```ts
// lib/whatsapp/consent.ts
export const WHATSAPP_CONSENT_TEXT_VERSION = "2026-09-v1";

export type WhatsAppConsentSource = "join" | "portal" | "rsvp" | "interest_form" | "whatsapp_inbound";

export type WhatsAppConsentFields = Readonly<{
  whatsappOptIn: boolean;
  whatsappConsentAt: Date | null;
  whatsappConsentSource: WhatsAppConsentSource | null;
  whatsappConsentTextVersion: string | null;
}>;

/** Programme D-7: every opt-in carries when, where and which wording. */
export function whatsappConsentFields(input: Readonly<{optIn: boolean; source: WhatsAppConsentSource; now?: () => Date}>): WhatsAppConsentFields {
  if (!input.optIn) return {whatsappOptIn: false, whatsappConsentAt: null, whatsappConsentSource: null, whatsappConsentTextVersion: null};
  return {
    whatsappOptIn: true,
    whatsappConsentAt: (input.now ?? (() => new Date()))(),
    whatsappConsentSource: input.source,
    whatsappConsentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
  };
}
```

In `lib/channels/woztell.ts` delete the local `normalizeWhatsAppNumber` function (lines 213–217) and add near the other imports:

```ts
import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";
export {normalizeWhatsAppNumber};
```

(The import keeps the name available to any future internal use; the re-export keeps `lib/ai/woztell-webhook.ts:10` and the existing tests working unchanged.)

- [ ] **Step 4: Extend the join profile schema and the profiles repository types**

In `lib/membership/join-schema.ts` add the import:

```ts
import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";
```

Replace `profileSchema` (lines 20–26) with:

```ts
export const profileSchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  displayName: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(64).optional().nullable(),
  jobTitle: z.string().trim().max(160).optional().nullable(),
  locale: z.string().trim().max(10).optional(),
  whatsappNumber: z.string().trim().max(32).optional().nullable()
    .transform((value, context) => {
      if (!value) return null;
      const normalized = normalizeWhatsAppNumber(value);
      if (!normalized) context.addIssue({code: z.ZodIssueCode.custom, message: "INVALID_WHATSAPP_NUMBER"});
      return normalized;
    }),
  whatsappOptIn: z.boolean().optional().default(false),
}).superRefine((profile, context) => {
  if (profile.whatsappOptIn && !profile.whatsappNumber) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["whatsappNumber"], message: "WHATSAPP_NUMBER_REQUIRED"});
  }
});
```

In `lib/db/repos/profiles.ts` replace lines 9–10 with:

```ts
type ProfileConsentColumns = "whatsappNumber" | "whatsappOptIn" | "whatsappConsentAt" | "whatsappConsentSource" | "whatsappConsentTextVersion" | "marketingConsentAt";
export type ProfileInput = Pick<Profile, "id" | "displayName"> & Partial<Pick<Profile, "phone" | "jobTitle" | "locale" | "onboardingState" | "directoryVisible" | ProfileConsentColumns>>;
export type ProfileUpdate = Partial<Pick<Profile, "displayName" | "phone" | "jobTitle" | "locale" | "onboardingState" | "directoryVisible" | ProfileConsentColumns>>;
```

- [ ] **Step 5: Read the new fields in `saveProfile` and stamp provenance**

In `app/[locale]/(join)/join/actions.ts` add the import:

```ts
import {whatsappConsentFields} from "@/lib/whatsapp/consent";
```

In `saveProfile`, replace the `profileSchema.safeParse({...})` call and its failure branch with:

```ts
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone") || null,
    jobTitle: formData.get("jobTitle") || null,
    locale,
    whatsappNumber: formData.get("whatsappNumber") || null,
    whatsappOptIn: formData.get("whatsappOptIn") === "on",
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]?.toString() ?? "displayName";
    return formError(locale, field, field === "whatsappNumber" ? "errors.whatsappNumber" : "errors.required");
  }
```

and replace the two repository writes with:

```ts
    const consent = whatsappConsentFields({optIn: parsed.data.whatsappOptIn, source: "join"});
    const profileWrite = {...parsed.data, ...consent, onboardingState: "profile" as const};
    if (existing) {
      await profilesRepository.update(actor, actor.profileId, profileWrite);
    } else {
      await profilesRepository.ensure(actor, {id: actor.profileId, ...profileWrite});
    }
```

`completeApplication` still receives `profile: parsed.data`; `ensureProfile` in `lib/membership/onboarding.ts` only forwards id/displayName/phone/jobTitle/locale, which is correct — the write above is the one that persists the consent columns.

- [ ] **Step 6: Add the fields and consent text to the profile step**

`messages/en.json` → `"Join"`: merge `"whatsappNumber": "WhatsApp number (optional)"` into the existing `fields` object, merge `"whatsappNumber": "Enter a valid WhatsApp number with country code"` into `errors`, and add a sibling object:

```json
"whatsapp": {
  "optIn": "Send me WTIA activity updates and reminders on WhatsApp",
  "consent": "By ticking this box you agree that WTIA may message this number about events, programmes and membership. Reply STOP at any time to opt out. See our privacy statement.",
  "textVersion": "Consent wording 2026-09-v1"
}
```

`messages/zh-HK.json` → `"Join"`: `"whatsappNumber": "WhatsApp 號碼（選填）"` into `fields`, `"whatsappNumber": "請輸入包含國家代碼的有效 WhatsApp 號碼"` into `errors`, and:

```json
"whatsapp": {
  "optIn": "透過 WhatsApp 向我發送 WTIA 活動更新及提醒",
  "consent": "剔選即表示你同意 WTIA 可就活動、計劃及會籍事宜向此號碼發送訊息。你可隨時回覆「取消」以停止接收。詳見私隱聲明。",
  "textVersion": "同意書版本 2026-09-v1"
}
```

In `app/[locale]/(join)/join/profile/page.tsx` change `fieldNames={["displayName", "phone", "jobTitle"]}` to `fieldNames={["displayName", "phone", "jobTitle", "whatsappNumber"]}` and add after the `jobTitle` `Field`:

```tsx
          <Field autoComplete="tel" error="whatsappNumber-error" label={t("fields.whatsappNumber")} name="whatsappNumber" type="tel"/>
          <div className="rounded-md border border-border p-4 text-sm">
            <label className="flex items-start gap-3 font-medium" htmlFor="whatsappOptIn">
              <input className="mt-1" id="whatsappOptIn" name="whatsappOptIn" type="checkbox"/>
              <span>{t("whatsapp.optIn")}</span>
            </label>
            <p className="mt-2 text-muted-foreground">{t("whatsapp.consent")} <span className="sr-only">{t("whatsapp.textVersion")}</span></p>
          </div>
```

- [ ] **Step 7: Run tests, audit, typecheck**

Run: `npx vitest run tests/unit/whatsapp-number.test.ts tests/unit/whatsapp-consent.test.ts tests/unit/join-schema.test.ts tests/unit/join-actions.test.ts tests/unit/woztell-adapter.test.ts --reporter=dot && npm run audit:strings && npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add lib/whatsapp lib/channels/woztell.ts lib/membership/join-schema.ts lib/db/repos/profiles.ts "app/[locale]/(join)/join/actions.ts" "app/[locale]/(join)/join/profile/page.tsx" messages tests/unit/whatsapp-number.test.ts tests/unit/whatsapp-consent.test.ts tests/unit/join-schema.test.ts
git commit -m "feat(join): capture WhatsApp number and consent with provenance (F1, D-7)"
```

---

### Task 5: Portal profile edits WhatsApp number and opt-in (F1, F16)

**Files:**
- Modify: `lib/portal/command-core.ts:19-25, 84-103`
- Modify: `lib/portal/commands.ts:17-26`
- Modify: `lib/portal/queries.ts:36-45, 59, 141-149`
- Modify: `app/[locale]/(member)/portal/profile/page.tsx`
- Modify: `messages/*` (`Portal.fields.whatsappNumber`, `Portal.whatsapp.*`)
- Test: `tests/unit/portal-profile-whatsapp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/portal-profile-whatsapp.test.ts
import {describe, expect, it, vi} from "vitest";

import {updateProfile} from "@/lib/portal/command-core";
import {WHATSAPP_CONSENT_TEXT_VERSION} from "@/lib/whatsapp/consent";

const actor = {kind: "member" as const, userId: "auth-1", profileId: "profile-1"};

function deps() {
  const update = vi.fn(async (_actor: unknown, _id: string, input: Record<string, unknown>) => ({id: "profile-1", ...input}));
  return {
    update,
    dependencies: {
      profiles: {update},
      companies: {getById: vi.fn(), update: vi.fn()},
      memberships: {list: vi.fn(async () => [{id: "m1", status: "active", companyId: null}])},
    },
  };
}

describe("portal updateProfile WhatsApp consent", () => {
  it("normalises the number and stamps portal provenance on opt-in", async () => {
    const {update, dependencies} = deps();
    await updateProfile(actor, {displayName: "Ada", whatsappNumber: "+852 9123 4567", whatsappOptIn: true}, dependencies as never);
    expect(update).toHaveBeenCalledWith(actor, "profile-1", expect.objectContaining({
      whatsappNumber: "+85291234567",
      whatsappOptIn: true,
      whatsappConsentSource: "portal",
      whatsappConsentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
      onboardingState: "complete",
    }));
  });

  it("refuses opt-in without a number", async () => {
    const {dependencies} = deps();
    await expect(updateProfile(actor, {displayName: "Ada", whatsappOptIn: true}, dependencies as never)).rejects.toThrow();
  });

  it("clears provenance on opt-out", async () => {
    const {update, dependencies} = deps();
    await updateProfile(actor, {displayName: "Ada", whatsappNumber: "+85291234567", whatsappOptIn: false}, dependencies as never);
    expect(update).toHaveBeenCalledWith(actor, "profile-1", expect.objectContaining({whatsappOptIn: false, whatsappConsentAt: null}));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/portal-profile-whatsapp.test.ts --reporter=dot`
Expected: FAIL — the update is called without `whatsappNumber`/consent fields (Zod strips unknown keys)

- [ ] **Step 3: Extend the command core**

In `lib/portal/command-core.ts` add imports:

```ts
import {whatsappConsentFields} from "@/lib/whatsapp/consent";
import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";
```

Replace `profileUpdateSchema` (lines 19–25) with:

```ts
const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  locale: z.enum(["en", "zh-HK"]).optional(),
  directoryVisible: z.boolean().optional(),
  whatsappNumber: z.string().trim().max(32).nullable().optional()
    .transform((value, context) => {
      if (!value) return null;
      const normalized = normalizeWhatsAppNumber(value);
      if (!normalized) context.addIssue({code: z.ZodIssueCode.custom, message: "INVALID_WHATSAPP_NUMBER"});
      return normalized;
    }),
  whatsappOptIn: z.boolean().optional().default(false),
}).superRefine((input, context) => {
  if (input.whatsappOptIn && !input.whatsappNumber) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["whatsappNumber"], message: "WHATSAPP_NUMBER_REQUIRED"});
  }
});
```

Replace the body of `updateProfile` from `const result = await deps.profiles.update(` through the closing `});` with:

```ts
  const {whatsappOptIn, ...profileInput} = input;
  const result = await deps.profiles.update(actor, actor.profileId, {
    ...profileInput,
    ...whatsappConsentFields({optIn: whatsappOptIn, source: "portal"}),
    // Profile completion is derived by the portal from this explicit state;
    // callers cannot set an arbitrary onboarding percentage.
    onboardingState: "complete",
  });
```

- [ ] **Step 4: Map the form fields in the action, the projection and the page**

In `lib/portal/commands.ts` `updateProfileAction`, add inside the `updateProfile(actor, {...})` object after `directoryVisible`:

```ts
    whatsappNumber: String(formData.get("whatsappNumber") ?? "").trim() || null,
    whatsappOptIn: formData.get("whatsappOptIn") === "on",
```

In `lib/portal/queries.ts` add `| "whatsappNumber" | "whatsappOptIn"` to both the `DashboardViewModel.profile` Pick (after `"directoryVisible"`) and `PortalProfile` (line 59), and add to the returned projection (after `directoryVisible: profile.directoryVisible,`):

```ts
      whatsappNumber: profile.whatsappNumber,
      whatsappOptIn: profile.whatsappOptIn,
```

`messages/en.json` → `"Portal"`: merge `"whatsappNumber": "WhatsApp number"` into `fields`, and add:

```json
"whatsapp": {
  "optIn": "Send me WTIA activity updates and reminders on WhatsApp",
  "consent": "WTIA may message this number about events, programmes and membership. Reply STOP at any time to opt out.",
  "status": {"on": "WhatsApp updates: on", "off": "WhatsApp updates: off"}
}
```

`messages/zh-HK.json` → `"Portal"`: `"whatsappNumber": "WhatsApp 號碼"` into `fields`, and:

```json
"whatsapp": {
  "optIn": "透過 WhatsApp 向我發送 WTIA 活動更新及提醒",
  "consent": "WTIA 可就活動、計劃及會籍事宜向此號碼發送訊息。你可隨時回覆「取消」以停止接收。",
  "status": {"on": "WhatsApp 更新：已開啟", "off": "WhatsApp 更新：已關閉"}
}
```

In `app/[locale]/(member)/portal/profile/page.tsx` add after the `jobTitle` label:

```tsx
        <label className="space-y-2 text-sm font-medium">
          <span>{t("fields.whatsappNumber")}</span>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={profile.whatsappNumber ?? ""} name="whatsappNumber" type="tel" />
        </label>
        <div className="rounded-md border border-border p-4 text-sm sm:col-span-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">{profile.whatsappOptIn ? t("whatsapp.status.on") : t("whatsapp.status.off")}</p>
          <label className="flex items-start gap-3 font-medium">
            <input className="mt-1" defaultChecked={profile.whatsappOptIn} name="whatsappOptIn" type="checkbox" />
            <span>{t("whatsapp.optIn")}</span>
          </label>
          <p className="mt-2 text-muted-foreground">{t("whatsapp.consent")}</p>
        </div>
```

- [ ] **Step 5: Run tests, audit, typecheck**

Run: `npx vitest run tests/unit/portal-profile-whatsapp.test.ts tests/unit/portal-presentational.test.tsx tests/unit/portal-content-scope.test.ts --reporter=dot && npm run audit:strings && npm run typecheck`
Expected: PASS. If `portal-presentational.test.tsx` builds a `profile` fixture without the two new keys, add `whatsappNumber: null, whatsappOptIn: false` to that fixture.

- [ ] **Step 6: Commit**

```bash
git add lib/portal "app/[locale]/(member)/portal/profile/page.tsx" messages tests/unit/portal-profile-whatsapp.test.ts tests/unit/portal-presentational.test.tsx
git commit -m "feat(portal): edit WhatsApp number and opt-in with consent provenance (F1, F16)"
```

---

### Task 6: Contacts repository with capability actors (D-6)

**Files:**
- Create: `lib/db/repos/contacts.ts`
- Modify: `lib/db/repos/index.ts` (export)
- Test: `tests/unit/contacts-repository.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/contacts-repository.test.ts
import {describe, expect, it, vi} from "vitest";

import {contactWriterActor, createContactsRepository} from "@/lib/db/repos/contacts";

function fakeDatabase(rows: Record<string, unknown>[] = []) {
  const execute = vi.fn(async () => rows);
  return {execute, database: {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})}};
}

const interestInput = {email: "a@b.hk", locale: "en" as const, whatsappOptIn: false, whatsappNumber: null, displayName: null};

describe("contactsRepository", () => {
  it("refuses a member or anonymous actor", async () => {
    const {database} = fakeDatabase();
    const repository = createContactsRepository(async () => database as never);
    await expect(repository.upsertFromInterestForm({kind: "anonymous", userId: null}, interestInput)).rejects.toThrow("FORBIDDEN");
    await expect(repository.upsertFromInterestForm({kind: "member", userId: "u", profileId: "p"}, interestInput)).rejects.toThrow("FORBIDDEN");
  });

  it("upserts an interest-form contact and returns the row id", async () => {
    const {database, execute} = fakeDatabase([{id: "c-1"}]);
    const repository = createContactsRepository(async () => database as never);
    const result = await repository.upsertFromInterestForm(contactWriterActor("interest_form"), {
      email: "ADA@example.hk", locale: "zh-HK", whatsappOptIn: true, whatsappNumber: "+85291234567", displayName: "Ada",
    });
    expect(result).toEqual({id: "c-1", disposition: "upserted"});
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("records an unknown WhatsApp sender by phone", async () => {
    const {database} = fakeDatabase([{id: "c-2"}]);
    const repository = createContactsRepository(async () => database as never);
    const result = await repository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
      phoneE164: "+85291234567", locale: "en", receivedAt: new Date("2026-09-08T00:00:00Z"),
    });
    expect(result).toEqual({id: "c-2", disposition: "upserted"});
  });

  it("marks a phone opted out", async () => {
    const {database, execute} = fakeDatabase([{id: "c-2"}]);
    const repository = createContactsRepository(async () => database as never);
    await repository.markWhatsAppOptedOut(contactWriterActor("whatsapp"), "+85291234567");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/contacts-repository.test.ts --reporter=dot`
Expected: FAIL — `Cannot find module '@/lib/db/repos/contacts'`

- [ ] **Step 3: Write the repository**

```ts
// lib/db/repos/contacts.ts
import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {contacts} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";
import {WHATSAPP_CONSENT_TEXT_VERSION} from "@/lib/whatsapp/consent";

/**
 * Public writers (interest form, Woztell webhook, guest RSVP in Phase B) never
 * hold a member/staff Actor. Like `unsubscribeActor()` they carry a capability
 * that only server code can mint, so a forged actor from a `"use server"`
 * boundary cannot reach this repository (programme rule §9).
 */
const contactWriterCapability: unique symbol = Symbol("contact-writer-capability");
export type ContactWriterSource = "interest_form" | "whatsapp" | "event_guest" | "showcase_intro" | "join_abandoned" | "import";
export type ContactWriterActor = Readonly<{kind: "contact-writer"; userId: null; source: ContactWriterSource; [contactWriterCapability]: true}>;

export function contactWriterActor(source: ContactWriterSource): ContactWriterActor {
  return Object.freeze({kind: "contact-writer", userId: null, source, [contactWriterCapability]: true as const});
}

function requireContactWriter(actor: unknown): asserts actor is ContactWriterActor {
  const candidate = actor as Partial<ContactWriterActor> | null;
  if (!candidate || candidate.kind !== "contact-writer" || candidate[contactWriterCapability] !== true) {
    throw new Error("FORBIDDEN");
  }
}

const interestInputSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().max(200).nullable(),
  locale: z.enum(["en", "zh-HK"]),
  whatsappNumber: z.string().regex(/^\+\d{8,15}$/).nullable(),
  whatsappOptIn: z.boolean(),
}).strict();

const whatsappInputSchema = z.object({
  phoneE164: z.string().regex(/^\+\d{8,15}$/),
  locale: z.enum(["en", "zh-HK"]),
  receivedAt: z.coerce.date(),
  whatsappMemberId: z.string().trim().min(1).max(200).nullable().optional().default(null),
}).strict();

export type ContactWriteResult = Readonly<{id: string; disposition: "upserted"}>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createContactsRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    /** Interest form: a repeat submission with the same number refreshes consent; never duplicates a phone. */
    async upsertFromInterestForm(actor: unknown, input: unknown): Promise<ContactWriteResult> {
      requireContactWriter(actor);
      const parsed = interestInputSchema.parse(input);
      const consentAt = parsed.whatsappOptIn ? new Date() : null;
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        INSERT INTO ${contacts}
          (email, display_name, locale, source, phone_e164, whatsapp_opt_in, whatsapp_consent_at, whatsapp_consent_source, whatsapp_consent_text_version)
        VALUES (
          ${parsed.email}, ${parsed.displayName}, ${parsed.locale}, ${actor.source},
          ${parsed.whatsappNumber}, ${parsed.whatsappOptIn}, ${consentAt},
          ${parsed.whatsappOptIn ? "interest_form" : null}, ${parsed.whatsappOptIn ? WHATSAPP_CONSENT_TEXT_VERSION : null}
        )
        ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE SET
          email = COALESCE(${contacts.email}, EXCLUDED.email),
          display_name = COALESCE(EXCLUDED.display_name, ${contacts.displayName}),
          whatsapp_opt_in = EXCLUDED.whatsapp_opt_in OR ${contacts.whatsappOptIn},
          whatsapp_consent_at = COALESCE(EXCLUDED.whatsapp_consent_at, ${contacts.whatsappConsentAt}),
          whatsapp_consent_source = COALESCE(EXCLUDED.whatsapp_consent_source, ${contacts.whatsappConsentSource}),
          whatsapp_consent_text_version = COALESCE(EXCLUDED.whatsapp_consent_text_version, ${contacts.whatsappConsentTextVersion}),
          updated_at = now()
        RETURNING ${contacts.id} AS id
      `))[0];
      if (!row) throw new Error("CONTACT_UPSERT_FAILED");
      return {id: String(row.id), disposition: "upserted"};
    },

    /** Unknown WhatsApp sender: stored to reply (D-6); marketing opt-in stays false. */
    async upsertFromWhatsApp(actor: unknown, input: unknown): Promise<ContactWriteResult> {
      requireContactWriter(actor);
      const parsed = whatsappInputSchema.parse(input);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        INSERT INTO ${contacts}
          (phone_e164, whatsapp_member_id, locale, source, last_inbound_at)
        VALUES (${parsed.phoneE164}, ${parsed.whatsappMemberId}, ${parsed.locale}, 'whatsapp', ${parsed.receivedAt})
        ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE SET
          whatsapp_member_id = COALESCE(${contacts.whatsappMemberId}, EXCLUDED.whatsapp_member_id),
          last_inbound_at = GREATEST(COALESCE(${contacts.lastInboundAt}, EXCLUDED.last_inbound_at), EXCLUDED.last_inbound_at),
          updated_at = now()
        RETURNING ${contacts.id} AS id
      `))[0];
      if (!row) throw new Error("CONTACT_UPSERT_FAILED");
      return {id: String(row.id), disposition: "upserted"};
    },

    async markWhatsAppOptedOut(actor: unknown, phoneE164: string): Promise<void> {
      requireContactWriter(actor);
      const phone = z.string().regex(/^\+\d{8,15}$/).parse(phoneE164);
      const database = await loadDatabase();
      await database.execute(sql`
        UPDATE ${contacts}
        SET whatsapp_opt_in = false, whatsapp_opted_out_at = now(), updated_at = now()
        WHERE ${contacts.phoneE164} = ${phone}
      `);
    },
  };
}

export type ContactsRepository = ReturnType<typeof createContactsRepository>;
export const contactsRepository = createContactsRepository();
```

Note on the `ON CONFLICT` target: Postgres requires the partial index predicate to be repeated verbatim, which the `WHERE phone_e164 IS NOT NULL` clauses do. An interest-form contact with no number has no conflict target on email by design (email is not unique — one person may register interest twice); the Phase C contacts pipeline groups by email in the UI.

In `lib/db/repos/index.ts` add `export {contactsRepository} from "@/lib/db/repos/contacts";` beside the other repository exports.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/contacts-repository.test.ts tests/unit/campaign-repository-boundary.test.ts --reporter=dot && npm run lint`
Expected: PASS; lint clean (the DB-import boundary rule ignores `lib/db/repos/**`).

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/contacts.ts lib/db/repos/index.ts tests/unit/contacts-repository.test.ts
git commit -m "feat(db): contacts repository with capability actors for public writers (D-6)"
```

---

### Task 7: Interest form replaces the circular "Get activity updates" CTA (F7)

**Files:**
- Create: `lib/growth/interest-service.ts`, `lib/growth/interest-action.ts`, `components/marketing/interest-form.tsx`
- Modify: `app/[locale]/(public)/events/page.tsx:123-129`
- Modify: `components/home/open-now.tsx:46`
- Modify: `messages/*` (new `Interest` namespace)
- Modify: `tests/unit/wt-pages/events-page.test.tsx:65`
- Test: `tests/unit/interest-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/interest-service.test.ts
import {describe, expect, it, vi} from "vitest";

import {createInterestService} from "@/lib/growth/interest-service";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";

function form(overrides: Record<string, string> = {}): FormData {
  const value = new FormData();
  value.set("email", "ADA@example.hk");
  value.set("displayName", "Ada");
  value.set("locale", "en");
  value.set("whatsappNumber", "+852 9123 4567");
  value.set("whatsappOptIn", "on");
  for (const [key, item] of Object.entries(overrides)) value.set(key, item);
  return value;
}

function service() {
  const upsert = vi.fn(async () => ({id: "c-1", disposition: "upserted" as const}));
  return {
    upsert,
    service: createInterestService({
      contacts: {upsertFromInterestForm: upsert},
      limiter: createInMemoryRateLimiter({limit: 1, windowMs: 60_000, now: () => 10_000}),
      resolveClientIp: async () => "203.0.113.10",
    }),
  };
}

describe("interest service", () => {
  it("stores a normalised contact with WhatsApp consent", async () => {
    const {service: subject, upsert} = service();
    await expect(subject.submit(form())).resolves.toEqual({ok: true});
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({kind: "contact-writer", source: "interest_form"}), {
      email: "ADA@example.hk", displayName: "Ada", locale: "en", whatsappNumber: "+85291234567", whatsappOptIn: true,
    });
  });

  it("silently accepts honeypot submissions without writing", async () => {
    const {service: subject, upsert} = service();
    await expect(subject.submit(form({website: "http://spam"}))).resolves.toEqual({ok: true});
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects opt-in without a number and rate-limits by ip", async () => {
    const {service: subject} = service();
    await expect(subject.submit(form({whatsappNumber: ""}))).resolves.toEqual({ok: false, code: "invalid"});
    await expect(subject.submit(form())).resolves.toEqual({ok: true});
    await expect(subject.submit(form())).resolves.toEqual({ok: false, code: "rate_limited"});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/interest-service.test.ts --reporter=dot`
Expected: FAIL — `Cannot find module '@/lib/growth/interest-service'`

- [ ] **Step 3: Write the service (server-only, dependency-injected like `lib/showcase/lead-actions.ts`)**

```ts
// lib/growth/interest-service.ts
import "server-only";

import {z} from "zod";

import {contactWriterActor, type ContactsRepository} from "@/lib/db/repos/contacts";
import type {RateLimiter} from "@/lib/security/rate-limit";
import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";

const interestInputSchema = z.object({
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().max(200),
  locale: z.enum(["en", "zh-HK"]),
  whatsappNumber: z.string().trim().max(32),
  whatsappOptIn: z.boolean(),
  website: z.string().trim(),
});

export type InterestResult = Readonly<{ok: true} | {ok: false; code: "invalid" | "rate_limited"}>;

export type InterestServiceDependencies = Readonly<{
  contacts: Pick<ContactsRepository, "upsertFromInterestForm">;
  limiter: RateLimiter;
  /** Injected so the service stays testable outside a request scope. */
  resolveClientIp: () => Promise<string | null>;
}>;

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function createInterestService(dependencies: InterestServiceDependencies) {
  return Object.freeze({
    async submit(formData: FormData): Promise<InterestResult> {
      // Honeypot first, exactly as the showcase lead form: bots fill every field.
      if (textValue(formData, "website").trim().length > 0) return {ok: true};
      const parsed = interestInputSchema.safeParse({
        email: textValue(formData, "email"),
        displayName: textValue(formData, "displayName"),
        locale: textValue(formData, "locale"),
        whatsappNumber: textValue(formData, "whatsappNumber"),
        whatsappOptIn: formData.get("whatsappOptIn") === "on",
        website: textValue(formData, "website"),
      });
      if (!parsed.success) return {ok: false, code: "invalid"};

      const whatsappNumber = parsed.data.whatsappNumber ? normalizeWhatsAppNumber(parsed.data.whatsappNumber) : null;
      if (parsed.data.whatsappNumber && !whatsappNumber) return {ok: false, code: "invalid"};
      if (parsed.data.whatsappOptIn && !whatsappNumber) return {ok: false, code: "invalid"};

      // Keyed on the client, not the email: the email is attacker-chosen.
      const clientIp = await dependencies.resolveClientIp();
      const limiterKey = clientIp ? `interest:ip:${clientIp}` : `interest:email:${parsed.data.email.toLowerCase()}`;
      if (!dependencies.limiter.check(limiterKey).allowed) return {ok: false, code: "rate_limited"};

      await dependencies.contacts.upsertFromInterestForm(contactWriterActor("interest_form"), {
        email: parsed.data.email,
        displayName: parsed.data.displayName || null,
        locale: parsed.data.locale,
        whatsappNumber,
        whatsappOptIn: parsed.data.whatsappOptIn,
      });
      return {ok: true};
    },
  });
}

export type InterestService = ReturnType<typeof createInterestService>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/interest-service.test.ts --reporter=dot`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the `"use server"` wrapper and the client form**

```ts
// lib/growth/interest-action.ts
"use server";

import {headers} from "next/headers";

import {contactsRepository} from "@/lib/db/repos/contacts";
import {createInterestService, type InterestResult} from "@/lib/growth/interest-service";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";

// Process-local, mirroring lib/showcase/lead-request-action.ts.
const interestRateLimiter = createInMemoryRateLimiter({limit: 3, windowMs: 15 * 60_000});

/** Only the formData wrapper is exported; it accepts nothing actor-shaped from the caller. */
export async function submitInterestAction(formData: FormData): Promise<InterestResult> {
  const service = createInterestService({
    contacts: contactsRepository,
    limiter: interestRateLimiter,
    resolveClientIp: async () => clientIpFromHeaders(await headers()),
  });
  return service.submit(formData);
}
```

```tsx
// components/marketing/interest-form.tsx
"use client";

import {useActionState} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {InterestResult} from "@/lib/growth/interest-service";

export type InterestFormLabels = Readonly<{
  email: string; displayName: string; whatsappNumber: string; whatsappOptIn: string; consent: string;
  website: string; submit: string; submitting: string; success: string; invalid: string; rateLimited: string;
}>;

type FormState = Readonly<{status: "idle" | "success" | "invalid" | "rate_limited"}>;
const initialState: FormState = {status: "idle"};

export function InterestForm({action, locale, labels, id = "interest"}: Readonly<{
  action: (formData: FormData) => Promise<InterestResult>;
  locale: AppLocale;
  labels: InterestFormLabels;
  id?: string;
}>) {
  const [state, formAction, pending] = useActionState(
    async (_previous: FormState, formData: FormData): Promise<FormState> => {
      const result = await action(formData);
      return result.ok ? {status: "success"} : {status: result.code};
    },
    initialState,
  );
  const statusMessage = state.status === "success" ? labels.success
    : state.status === "invalid" ? labels.invalid
      : state.status === "rate_limited" ? labels.rateLimited : "";

  return <form action={formAction} className="partner-form" noValidate>
    <input name="locale" type="hidden" value={locale} />
    <div className="form-grid">
      <label htmlFor={`${id}-email`}><span>{labels.email}</span><input aria-describedby={`${id}-status`} autoComplete="email" id={`${id}-email`} name="email" required type="email" /></label>
      <label htmlFor={`${id}-name`}><span>{labels.displayName}</span><input aria-describedby={`${id}-status`} autoComplete="name" id={`${id}-name`} name="displayName" type="text" /></label>
      <label htmlFor={`${id}-whatsapp`}><span>{labels.whatsappNumber}</span><input aria-describedby={`${id}-status`} autoComplete="tel" id={`${id}-whatsapp`} name="whatsappNumber" type="tel" /></label>
    </div>
    <label className="flex items-start gap-3" htmlFor={`${id}-opt-in`}>
      <input className="mt-1" id={`${id}-opt-in`} name="whatsappOptIn" type="checkbox" />
      <span>{labels.whatsappOptIn}</span>
    </label>
    <p className="text-sm text-muted-foreground">{labels.consent}</p>
    <label className="sr-only" htmlFor={`${id}-website`}>{labels.website}<input autoComplete="off" id={`${id}-website`} name="website" tabIndex={-1} type="text" /></label>
    <button className="button" disabled={pending} type="submit">{pending ? labels.submitting : labels.submit}</button>
    <p aria-live="polite" className={state.status === "invalid" || state.status === "rate_limited" ? "form-error" : undefined} id={`${id}-status`}>{statusMessage}</p>
  </form>;
}
```

- [ ] **Step 6: Add the `Interest` namespace to both bundles**

`messages/en.json` (top level):

```json
"Interest": {
  "email": "Email address",
  "displayName": "Name (optional)",
  "whatsappNumber": "WhatsApp number (optional)",
  "whatsappOptIn": "Also send me updates on WhatsApp",
  "consent": "WTIA will use these details to tell you when an activity opens. Reply STOP on WhatsApp or use the unsubscribe link in any email to opt out.",
  "website": "Leave this field empty",
  "submit": "Get activity updates",
  "submitting": "Saving…",
  "success": "Thanks — we will let you know as soon as the next activity opens.",
  "invalid": "Check the email address and WhatsApp number, then try again.",
  "rateLimited": "Too many attempts from this connection. Try again in a few minutes."
}
```

`messages/zh-HK.json`:

```json
"Interest": {
  "email": "電郵地址",
  "displayName": "姓名（選填）",
  "whatsappNumber": "WhatsApp 號碼（選填）",
  "whatsappOptIn": "同時透過 WhatsApp 向我發送更新",
  "consent": "WTIA 會使用這些資料通知你活動開放報名。你可於 WhatsApp 回覆「取消」或使用電郵內的取消訂閱連結以停止接收。",
  "website": "請留空此欄",
  "submit": "接收活動更新",
  "submitting": "儲存中…",
  "success": "多謝 — 下一個活動開放時我們會通知你。",
  "invalid": "請檢查電郵地址及 WhatsApp 號碼，然後再試一次。",
  "rateLimited": "此連線嘗試次數過多，請稍後再試。"
}
```

- [ ] **Step 7: Wire the form into `/events` and point the home band at it**

In `app/[locale]/(public)/events/page.tsx` add imports:

```ts
import {InterestForm} from "@/components/marketing/interest-form";
import {submitInterestAction} from "@/lib/growth/interest-action";
```

Inside the page component, after `const t = await getTranslations({locale, namespace: "Events"});` add:

```ts
  const tInterest = await getTranslations({locale, namespace: "Interest"});
  const interestLabels = {
    email: tInterest("email"), displayName: tInterest("displayName"), whatsappNumber: tInterest("whatsappNumber"),
    whatsappOptIn: tInterest("whatsappOptIn"), consent: tInterest("consent"), website: tInterest("website"),
    submit: tInterest("submit"), submitting: tInterest("submitting"), success: tInterest("success"),
    invalid: tInterest("invalid"), rateLimited: tInterest("rateLimited"),
  };
```

Replace the `<InterestBand … action={<ActionLink href="/events?status=open" …>} />` block (lines 123–129) with:

```tsx
      <InterestBand
        action={<InterestForm action={submitInterestAction} id="events-interest-form" labels={interestLabels} locale={appLocale} />}
        copy={t("interest.copy")}
        eyebrow={t("interest.eyebrow")}
        id="events-interest"
        title={t("interest.title")}
      />
```

(`appLocale` is already defined at line 44 of that page.)

In `components/home/open-now.tsx` line 46 change `href: '/events?status=open'` on the `updatesAction` entry to `href: '/events#events-interest'` — the home band deep-links to the form instead of the empty list.

In `tests/unit/wt-pages/events-page.test.tsx` line 65 replace the link assertion with:

```ts
    expect(screen.getByRole("button", {name: bundles.en.Interest.submit})).toBeInTheDocument();
```

and add to that test file's mocks `vi.mock("@/lib/growth/interest-action", () => ({submitInterestAction: vi.fn()}));`.

- [ ] **Step 8: Run tests, audit, typecheck, lint**

Run: `npx vitest run tests/unit/interest-service.test.ts tests/unit/wt-pages/events-page.test.tsx tests/unit/home-events-journey.test.tsx tests/unit/server-action-actor-boundary.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npm run lint`
Expected: PASS. If `home-events-journey.test.tsx` pins `/events?status=open` for the updates action, change it to `/events#events-interest`.

- [ ] **Step 9: Commit**

```bash
git add lib/growth components/marketing/interest-form.tsx "app/[locale]/(public)/events/page.tsx" components/home/open-now.tsx messages tests/unit/interest-service.test.ts tests/unit/wt-pages/events-page.test.tsx tests/unit/home-events-journey.test.tsx
git commit -m "feat(growth): interest form with WhatsApp opt-in replaces the circular activity-updates CTA (F7)"
```

---

### Task 8: Webhook records unknown senders as contacts and STOP as a suppression (F3, F12)

**Files:**
- Modify: `lib/ai/woztell-webhook.ts:104-139, 205-235`
- Modify: `lib/ai/woztell-production.ts:117-141`
- Modify: `lib/db/repos/suppressions.ts` (add `optOutWhatsApp`)
- Test: `tests/unit/woztell-contact-capture.test.ts`, `tests/unit/suppressions-whatsapp.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/woztell-contact-capture.test.ts
import {describe, expect, it, vi} from "vitest";

import {createWoztellWebhookProcessor, type WoztellWebhookProcessorDependencies} from "@/lib/ai/woztell-webhook";

const RECEIVED_AT = new Date("2026-09-08T01:00:00.000Z");

function dependencies(text: string, profile: null | {id: string; displayName: string; locale: "en"; whatsappOptIn: boolean}) {
  const recordContact = vi.fn(async () => undefined);
  const recordOptOut = vi.fn(async () => undefined);
  const setWhatsappOptIn = vi.fn(async () => undefined);
  const deps: WoztellWebhookProcessorDependencies = {
    channel: {
      normalizeInbound: () => ({kind: "message", sender: "+852 9123 4567", text, intent: text === "STOP" ? "opt_out" : null, providerMessageId: `wamid.${text}`, receivedAt: RECEIVED_AT}),
      verifyWebhook: () => true,
      sendSessionMessage: vi.fn(async () => ({status: "sent" as const, providerId: "p1"})),
      sendTemplateMessage: vi.fn(async () => ({status: "sent" as const, providerId: "p2"})),
    },
    resolveProfile: vi.fn(async () => profile),
    claimInbound: vi.fn(async (input) => ({status: "accepted" as const, conversationId: "11111111-1111-4111-8111-111111111111", owner: input.owner, profileId: input.profileId, locale: input.locale, memberName: input.memberName, whatsappOptIn: input.whatsappOptIn})),
    recordContact,
    recordOptOut,
    setWhatsappOptIn,
    markCompleted: vi.fn(async () => undefined),
    concierge: {startTurn: vi.fn(async () => ({conversationId: "c", runId: "r", events: (async function* () { yield {event: "done", data: {}}; })(), cancel: async () => undefined}))},
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: () => "hash",
    approvedTemplateKeys: new Set(),
    supportUrl: "https://hkwtia.example/en/contact",
  };
  return {deps, recordContact, recordOptOut, setWhatsappOptIn};
}

describe("WOZTELL contact capture (programme D-6)", () => {
  it("records an unknown sender as a contact before the concierge runs", async () => {
    const {deps, recordContact} = dependencies("Hello", null);
    await createWoztellWebhookProcessor(deps).process({});
    expect(recordContact).toHaveBeenCalledWith({phoneE164: "+85291234567", locale: "en", receivedAt: RECEIVED_AT});
  });

  it("does not create a contact for a recognised member", async () => {
    const {deps, recordContact} = dependencies("Hello", {id: "p1", displayName: "Ada", locale: "en", whatsappOptIn: true});
    await createWoztellWebhookProcessor(deps).process({});
    expect(recordContact).not.toHaveBeenCalled();
  });

  it("writes a suppression for STOP from a member and from a prospect", async () => {
    const member = dependencies("STOP", {id: "p1", displayName: "Ada", locale: "en", whatsappOptIn: true});
    await createWoztellWebhookProcessor(member.deps).process({});
    expect(member.setWhatsappOptIn).toHaveBeenCalledWith("p1", false);
    expect(member.recordOptOut).toHaveBeenCalledWith({profileId: "p1", phoneE164: "+85291234567"});

    const prospect = dependencies("STOP", null);
    await createWoztellWebhookProcessor(prospect.deps).process({});
    expect(prospect.recordOptOut).toHaveBeenCalledWith({profileId: null, phoneE164: "+85291234567"});
  });
});
```

```ts
// tests/unit/suppressions-whatsapp.test.ts
import {describe, expect, it, vi} from "vitest";

import {createSuppressionsRepository, unsubscribeActor} from "@/lib/db/repos/suppressions";

describe("suppressionsRepository.optOutWhatsApp", () => {
  it("clears the profile flag, inserts the whatsapp suppression and an audit row in one transaction", async () => {
    const execute = vi.fn(async () => [{id: "row"}]);
    const database = {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})};
    const repository = createSuppressionsRepository(async () => database as never);
    await expect(repository.optOutWhatsApp(unsubscribeActor(), "profile-1", "whatsapp_stop")).resolves.toBe("created");
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("refuses a member actor", async () => {
    const repository = createSuppressionsRepository(async () => ({execute: vi.fn(), transaction: vi.fn()}) as never);
    await expect(repository.optOutWhatsApp({kind: "member", userId: "u", profileId: "p"} as never, "p", "x")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/woztell-contact-capture.test.ts tests/unit/suppressions-whatsapp.test.ts --reporter=dot`
Expected: FAIL — `recordContact` is not a known dependency (type error) / `optOutWhatsApp is not a function`

- [ ] **Step 3: Add the suppression method**

In `lib/db/repos/suppressions.ts` add `auditEvents` to the `@/lib/db/server-schema` import and add this method inside the returned object after `unsubscribeEmailMarketing`:

```ts
    /**
     * STOP / 取消 on WhatsApp, or channel=whatsapp on /api/unsubscribe. Writes
     * the suppression, clears the profile flag and audits it in one transaction
     * (programme D-7). A prospect with no profile is handled by
     * contactsRepository.markWhatsAppOptedOut instead.
     */
    async optOutWhatsApp(
      actor: Actor | UnsubscribeActor,
      profileId: string,
      reasonCode: string,
    ): Promise<"created" | "existing"> {
      requireSuppressionActor(actor);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const profile = rowsFrom(await transaction.execute(sql`
          UPDATE ${profiles}
          SET whatsapp_opt_in = false, updated_at = now()
          WHERE id = ${profileId}
          RETURNING id
        `))[0];
        if (!profile) throw new Error("PROFILE_NOT_FOUND");
        const suppression = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${messageSuppressions}
            (profile_id, channel, classification, reason_code)
          VALUES (${profileId}, 'whatsapp', 'marketing', ${reasonCode})
          ON CONFLICT DO NOTHING
          RETURNING id
        `))[0];
        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (NULL, ${actor.kind}, 'consent.whatsapp.revoked', 'profile', ${profileId}, ${JSON.stringify({reasonCode})}::jsonb)
        `);
        return suppression ? "created" : "existing";
      });
    },
```

- [ ] **Step 4: Extend the webhook processor dependencies and flow**

In `lib/ai/woztell-webhook.ts` add to `WoztellWebhookProcessorDependencies` (after `setWhatsappOptIn`):

```ts
    /** Unknown sender → contacts row (programme D-6). Optional so existing tests keep passing. */
    recordContact?: (input: Readonly<{phoneE164: string; locale: "en" | "zh-HK"; receivedAt: Date}>) => Promise<void>;
    /** STOP/取消 → message_suppressions + contact opt-out (D-7). */
    recordOptOut?: (input: Readonly<{profileId: string | null; phoneE164: string}>) => Promise<void>;
```

In `process()`, after `const owner = ownerFor(profile, sender, dependencies);` add:

```ts
      if (!profile) {
        await dependencies.recordContact?.({phoneE164: sender, locale, receivedAt: normalized.receivedAt});
      }
```

Replace the opt-out block (`if (normalized.intent === "opt_out") { … }`) with:

```ts
      if (normalized.intent === "opt_out") {
        if (claim.profileId) {
          await dependencies.setWhatsappOptIn(claim.profileId, false);
        }
        await dependencies.recordOptOut?.({profileId: claim.profileId, phoneE164: sender});
        await dependencies.markCompleted?.(normalized.providerMessageId);
        return {status: "opted_out"};
      }
```

- [ ] **Step 5: Wire production dependencies**

In `lib/ai/woztell-production.ts` add imports:

```ts
import {contactsRepository, contactWriterActor} from "@/lib/db/repos/contacts";
import {suppressionsRepository, unsubscribeActor} from "@/lib/db/repos/suppressions";
```

and inside the returned object of `createProductionWoztellProcessorDependencies`, after `approvedTemplateKeys: approvedTemplateKeys(),` add:

```ts
    async recordContact(input) {
      await contactsRepository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
        phoneE164: input.phoneE164, locale: input.locale, receivedAt: input.receivedAt,
      });
    },
    async recordOptOut(input) {
      if (input.profileId) {
        await suppressionsRepository.optOutWhatsApp(unsubscribeActor(), input.profileId, "whatsapp_stop");
      }
      await contactsRepository.markWhatsAppOptedOut(contactWriterActor("whatsapp"), input.phoneE164);
    },
```

- [ ] **Step 6: Run the Woztell suite**

Run: `npx vitest run tests/unit/woztell-contact-capture.test.ts tests/unit/suppressions-whatsapp.test.ts tests/unit/woztell-concierge.test.ts tests/unit/woztell-opted-out-profile.test.ts tests/unit/woztell-review-gaps.test.ts tests/unit/woztell-terminal-outcome.test.ts --reporter=dot && npm run typecheck`
Expected: PASS (existing tests unaffected because both new dependencies are optional)

- [ ] **Step 7: Commit**

```bash
git add lib/ai/woztell-webhook.ts lib/ai/woztell-production.ts lib/db/repos/suppressions.ts tests/unit/woztell-contact-capture.test.ts tests/unit/suppressions-whatsapp.test.ts
git commit -m "feat(whatsapp): record unknown senders as contacts and STOP as a suppression (F3, F12)"
```

---

### Task 9: `/api/unsubscribe` and the preference page understand channels (F12)

**Files:**
- Modify: `lib/api/unsubscribe-route.ts`
- Modify: `app/[locale]/(public)/unsubscribe/page.tsx`
- Modify: `messages/*` (`Unsubscribe.channel.*`)
- Test: extend `tests/unit/unsubscribe.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/unsubscribe.test.ts`, reusing that file's existing secret constant and token helper (it already signs a token with `createUnsubscribeToken` and calls `createUnsubscribePost`; use the same names the file already uses for the secret and the signed token):

```ts
describe("unsubscribe channels", () => {
  it("routes channel=whatsapp to the WhatsApp opt-out and channel=all to both", async () => {
    const unsubscribeEmailMarketing = vi.fn(async () => "created" as const);
    const optOutWhatsApp = vi.fn(async () => "created" as const);
    const post = createUnsubscribePost({secrets: [SECRET], appUrl: "https://hkwtia.example", unsubscribeEmailMarketing, optOutWhatsApp});
    const token = signedToken();

    const whatsapp = await post(new Request(`https://hkwtia.example/api/unsubscribe?token=${token}&channel=whatsapp`, {method: "POST"}));
    expect(whatsapp.status).toBe(200);
    expect(optOutWhatsApp).toHaveBeenCalledTimes(1);
    expect(unsubscribeEmailMarketing).not.toHaveBeenCalled();

    const all = await post(new Request(`https://hkwtia.example/api/unsubscribe?token=${token}&channel=all`, {method: "POST"}));
    expect(all.status).toBe(200);
    expect(unsubscribeEmailMarketing).toHaveBeenCalledTimes(1);
    expect(optOutWhatsApp).toHaveBeenCalledTimes(2);
  });

  it("defaults to email and rejects an unknown channel", async () => {
    const unsubscribeEmailMarketing = vi.fn(async () => "created" as const);
    const optOutWhatsApp = vi.fn(async () => "created" as const);
    const post = createUnsubscribePost({secrets: [SECRET], appUrl: "https://hkwtia.example", unsubscribeEmailMarketing, optOutWhatsApp});
    const token = signedToken();
    expect((await post(new Request(`https://hkwtia.example/api/unsubscribe?token=${token}`, {method: "POST"}))).status).toBe(200);
    expect(unsubscribeEmailMarketing).toHaveBeenCalledTimes(1);
    expect((await post(new Request(`https://hkwtia.example/api/unsubscribe?token=${token}&channel=fax`, {method: "POST"}))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/unsubscribe.test.ts --reporter=dot`
Expected: FAIL — `optOutWhatsApp` is not a known dependency; channel ignored

- [ ] **Step 3: Extend the route**

In `lib/api/unsubscribe-route.ts`:

Add after `type UnsubscribeResult`:

```ts
const CHANNELS = ["email", "whatsapp", "all"] as const;
type UnsubscribeChannel = (typeof CHANNELS)[number];
function channelFrom(value: string | null): UnsubscribeChannel | null {
  if (value === null || value === "") return "email";
  return (CHANNELS as readonly string[]).includes(value) ? value as UnsubscribeChannel : null;
}
```

Extend `Dependencies` with:

```ts
  optOutWhatsApp(profileId: string): Promise<UnsubscribeResult>;
```

Change `formValues` to also return `channel`: widen its return type with `channel: string | null;`; in the query branch `return {token: queryToken, redirect: false, channel: url.searchParams.get("channel")};`; in the JSON branch add `channel: typeof value.channel === "string" ? value.channel : null,` (and `channel?: unknown` to the parsed type); in the form branch add `channel: form.get("channel"),`.

In `post`, after the payload check and before the `try`, add:

```ts
    const channel = channelFrom(input.channel);
    if (!channel) return Response.json({error: "INVALID_UNSUBSCRIBE_CHANNEL"}, {status: 400});
```

and replace `await dependencies.unsubscribeEmailMarketing(payload.profileId);` with:

```ts
      if (channel === "email" || channel === "all") await dependencies.unsubscribeEmailMarketing(payload.profileId);
      if (channel === "whatsapp" || channel === "all") await dependencies.optOutWhatsApp(payload.profileId);
```

In `successLocation`, carry the channel: change the signature to `(appUrl: string, locale: "en" | "zh-HK", channel: UnsubscribeChannel)` and build the path with `?status=success&channel=${channel}`; pass `channel` at the call site.

In the exported `POST` dependencies add:

```ts
  optOutWhatsApp(profileId) {
    return suppressionsRepository.optOutWhatsApp(unsubscribeActor(), profileId, "member_unsubscribe");
  },
```

- [ ] **Step 4: Preference page shows both channels**

`messages/en.json` → `"Unsubscribe"` add:

```json
"channel": {
  "email": "Marketing email",
  "whatsapp": "WhatsApp updates",
  "all": "Both marketing email and WhatsApp",
  "choose": "What would you like to stop?",
  "successWhatsapp": "WhatsApp updates stopped",
  "successAll": "Marketing email and WhatsApp updates stopped"
}
```

`messages/zh-HK.json` → `"Unsubscribe"` add:

```json
"channel": {
  "email": "推廣電郵",
  "whatsapp": "WhatsApp 更新",
  "all": "推廣電郵及 WhatsApp 更新",
  "choose": "你想停止接收甚麼？",
  "successWhatsapp": "已停止 WhatsApp 更新",
  "successAll": "已停止推廣電郵及 WhatsApp 更新"
}
```

In `app/[locale]/(public)/unsubscribe/page.tsx`: widen `searchParams` to `Promise<{token?: string; status?: string; channel?: string}>`; in the success branch pick the title by channel:

```tsx
        <h1 className="mt-3 text-4xl font-semibold">{query.channel === "whatsapp" ? t("channel.successWhatsapp") : query.channel === "all" ? t("channel.successAll") : t("successTitle")}</h1>
```

and in the confirmation form add, before the submit button:

```tsx
        <fieldset className="mt-6 space-y-2 text-sm">
          <legend className="font-medium">{t("channel.choose")}</legend>
          {(["email", "whatsapp", "all"] as const).map((channel) => (
            <label className="flex items-center gap-3" key={channel}>
              <input defaultChecked={channel === "email"} name="channel" type="radio" value={channel} />
              <span>{t(`channel.${channel}`)}</span>
            </label>
          ))}
        </fieldset>
```

The form already posts `token` and `redirect=1` to `/api/unsubscribe`; the radio adds `channel`.

- [ ] **Step 5: Run tests, audit, typecheck**

Run: `npx vitest run tests/unit/unsubscribe.test.ts tests/unit/unsubscribe-one-click.test.ts tests/unit/unsubscribe-secret-rotation.test.ts --reporter=dot && npm run audit:strings && npm run typecheck`
Expected: PASS (`unsubscribe-one-click` sends no channel → email, unchanged). `unsubscribe-secret-rotation` starts failing by design on 2026-09-10 — complete the sunset in CLAUDE.md "Known deadline" as its own commit on or after that date.

- [ ] **Step 6: Commit**

```bash
git add lib/api/unsubscribe-route.ts "app/[locale]/(public)/unsubscribe/page.tsx" messages tests/unit/unsubscribe.test.ts
git commit -m "feat(unsubscribe): channel parameter for email, WhatsApp or both (F12)"
```

---

### Task 10: Click-to-chat entry points (F4)

**Files:**
- Modify: `config/site.ts:28-38`
- Create: `lib/whatsapp/click-to-chat.ts`, `components/marketing/whatsapp-link.tsx`
- Modify: `components/layout/site-header.tsx:59-79`, `components/layout/site-footer.tsx:139-146`, `app/[locale]/(public)/contact/page.tsx:63-68`, `app/[locale]/(public)/membership/page.tsx` (closing section), `app/[locale]/(public)/events/page.tsx` (closing band)
- Modify: `messages/*` (`WhatsApp` namespace)
- Test: `tests/unit/click-to-chat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/click-to-chat.test.ts
import {describe, expect, it} from "vitest";

import {clickToChatUrl} from "@/lib/whatsapp/click-to-chat";

describe("clickToChatUrl", () => {
  it("builds a wa.me link with digits only and an encoded prefilled message", () => {
    const url = clickToChatUrl({number: "+852 9123 4567", text: "Hi WTIA, I'd like to know more about membership. [web:contact:en]"});
    expect(url).toBe("https://wa.me/85291234567?text=Hi%20WTIA%2C%20I'd%20like%20to%20know%20more%20about%20membership.%20%5Bweb%3Acontact%3Aen%5D");
  });
  it("returns null when no number is configured", () => {
    expect(clickToChatUrl({number: undefined, text: "x"})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/click-to-chat.test.ts --reporter=dot`
Expected: FAIL — module not found

- [ ] **Step 3: Write the builder, the component and the config field**

```ts
// lib/whatsapp/click-to-chat.ts
/**
 * wa.me deep link. The bracketed marker at the end of `text` (e.g.
 * "[web:contact:en]") survives into the first inbound message, so the Phase C
 * inbox can attribute the lead to the page that produced it without any
 * tracking script.
 */
export function clickToChatUrl(input: Readonly<{number: string | undefined; text: string}>): string | null {
  if (!input.number) return null;
  const digits = input.number.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(input.text)}`;
}
```

```tsx
// components/marketing/whatsapp-link.tsx
import type {AppLocale} from "@/i18n/routing";
import {siteConfig} from "@/config/site";
import {clickToChatUrl} from "@/lib/whatsapp/click-to-chat";

type Props = Readonly<{
  locale: AppLocale;
  /** Page marker for lead attribution, e.g. "contact", "membership", "events". */
  source: string;
  label: string;
  prefill: string;
  className?: string;
}>;

/** Renders nothing until config/site.ts carries a WhatsApp number (programme D-4). */
export function WhatsAppLink({locale, source, label, prefill, className}: Props) {
  const href = clickToChatUrl({number: siteConfig.contact.whatsapp, text: `${prefill} [web:${source}:${locale}]`});
  if (!href) return null;
  return <a className={className} href={href} rel="noopener noreferrer" target="_blank">{label}</a>;
}
```

In `config/site.ts` add `whatsapp?: string;` to the `SiteContact` type and inside `siteContact` add, with a comment in the file's style:

```ts
  // WhatsApp Business number for click-to-chat (programme §8). Unset until the
  // Woztell channel is provisioned; every WhatsAppLink renders nothing until then.
  whatsapp: undefined,
```

(When the number exists, set it as `'+852 XXXX XXXX'`; `clickToChatUrl` strips formatting.)

- [ ] **Step 4: Add the strings and place the links**

`messages/en.json` (top level):

```json
"WhatsApp": {
  "chat": "Chat on WhatsApp",
  "prefill": {
    "header": "Hi WTIA, I have a question.",
    "contact": "Hi WTIA, I'd like to get in touch.",
    "membership": "Hi WTIA, I'd like to know more about membership.",
    "events": "Hi WTIA, please tell me about upcoming activities.",
    "footer": "Hi WTIA."
  }
}
```

`messages/zh-HK.json`:

```json
"WhatsApp": {
  "chat": "WhatsApp 對話",
  "prefill": {
    "header": "你好 WTIA，我有一個問題。",
    "contact": "你好 WTIA，我想聯絡你們。",
    "membership": "你好 WTIA，我想了解會籍詳情。",
    "events": "你好 WTIA，請告訴我即將舉行的活動。",
    "footer": "你好 WTIA。"
  }
}
```

`components/layout/site-header.tsx` is an async server component (`export async function SiteHeader`, line 22) that already calls `getTranslations`; add `const tWhatsApp = await getTranslations({locale, namespace: "WhatsApp"});` beside the existing `t`, import `WhatsAppLink`, and inside `<div className="header-actions">` before the `signin-link` add:

```tsx
          <WhatsAppLink className="signin-link" label={tWhatsApp("chat")} locale={locale} prefill={tWhatsApp("prefill.header")} source="header" />
```

`components/layout/site-footer.tsx`: after the `tel:` anchor block (line 146) add:

```tsx
          <WhatsAppLink className={footerTargetClassName} label={tWhatsApp("chat")} locale={locale} prefill={tWhatsApp("prefill.footer")} source="footer" />
```

with the same `tWhatsApp` resolution.

`app/[locale]/(public)/contact/page.tsx`: after the `tel:` anchor (line 67) add:

```tsx
            <WhatsAppLink className="block font-medium text-foreground underline-offset-4 hover:underline" label={tWhatsApp("chat")} locale={locale} prefill={tWhatsApp("prefill.contact")} source="contact" />
```

`app/[locale]/(public)/membership/page.tsx`: in the closing section's action list add a `WhatsAppLink` with `source="membership"` and `prefill={tWhatsApp("prefill.membership")}` beside the mailto link. `app/[locale]/(public)/events/page.tsx`: directly after the `ClosingBand` add a `WhatsAppLink` with `source="events"` and `prefill={tWhatsApp("prefill.events")}`, both resolving `tWhatsApp` the same way.

- [ ] **Step 5: Run tests, audit, typecheck, shell boundary**

Run: `npx vitest run tests/unit/click-to-chat.test.ts tests/unit/site-footer.test.tsx tests/unit/wisetech-shell-boundary.test.ts tests/unit/wt-pages/contact-page.test.tsx --reporter=dot && npm run audit:strings && npm run typecheck`
Expected: PASS — with `whatsapp: undefined` the component renders nothing, so no existing snapshot changes; once a number is configured, re-run these tests and update any snapshot that now contains the link.

- [ ] **Step 6: Commit**

```bash
git add config/site.ts lib/whatsapp/click-to-chat.ts components/marketing/whatsapp-link.tsx components/layout/site-header.tsx components/layout/site-footer.tsx "app/[locale]/(public)/contact/page.tsx" "app/[locale]/(public)/membership/page.tsx" "app/[locale]/(public)/events/page.tsx" messages tests/unit/click-to-chat.test.ts
git commit -m "feat(whatsapp): click-to-chat entry points with lead-source markers (F4)"
```

---

### Task 11: Admin inbox v0 (read-only) and staff task queue (F2)

**Files:**
- Create: `lib/db/repos/inbox.ts`, `lib/admin/inbox.ts`
- Modify: `lib/db/repos/staff-tasks.ts` (add `listOpen`, `resolve`)
- Create: `lib/admin/task-action-core.ts`, `lib/admin/task-actions.ts`
- Create: `app/[locale]/(admin)/admin/inbox/page.tsx`, `app/[locale]/(admin)/admin/inbox/[id]/page.tsx`, `app/[locale]/(admin)/admin/tasks/page.tsx`
- Create: `components/admin/inbox-list.tsx`, `components/admin/inbox-thread.tsx`, `components/admin/task-table.tsx`
- Modify: `config/internal-navigation.ts:23-32`, `components/admin/admin-nav.tsx:15-32`, `app/[locale]/(admin)/admin/page.tsx`
- Modify: `messages/*` (`Admin.navigation.inbox/tasks`, `Admin.inbox`, `Admin.tasks`, `Admin.dashboard.openTasks`)
- Test: `tests/unit/inbox-repository.test.ts`, `tests/unit/staff-tasks-admin.test.ts`, `tests/unit/task-action-core.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/inbox-repository.test.ts
import {describe, expect, it, vi} from "vitest";

import {createInboxRepository} from "@/lib/db/repos/inbox";

const admin = {kind: "staff" as const, userId: "u", profileId: "staff-1"};
const member = {kind: "member" as const, userId: "u2", profileId: "member-1"};

function database(rows: Record<string, unknown>[]) {
  return {execute: vi.fn(async () => rows), transaction: vi.fn()};
}

describe("inboxRepository", () => {
  it("refuses non-admin actors", async () => {
    const repository = createInboxRepository(async () => database([]) as never);
    await expect(repository.listConversations(member, {channel: "all", limit: 50})).rejects.toThrow();
    await expect(repository.getTranscript(member, "11111111-1111-4111-8111-111111111111")).rejects.toThrow();
  });

  it("maps conversation summaries with channel, owner label and escalation flag", async () => {
    const repository = createInboxRepository(async () => database([{
      id: "11111111-1111-4111-8111-111111111111", agent_kind: "concierge", locale: "en", status: "active",
      last_message_at: new Date("2026-09-08T00:00:00Z"), profile_id: null, display_name: null,
      channel: "whatsapp", last_message: "Hello", message_count: 2, open_task_count: 1,
    }]) as never);
    const rows = await repository.listConversations(admin, {channel: "whatsapp", limit: 50});
    expect(rows).toEqual([expect.objectContaining({id: "11111111-1111-4111-8111-111111111111", channel: "whatsapp", ownerLabel: null, lastMessage: "Hello", messageCount: 2, escalated: true})]);
  });
});
```

```ts
// tests/unit/staff-tasks-admin.test.ts
import {describe, expect, it, vi} from "vitest";

import {createStaffTasksRepository} from "@/lib/db/repos/staff-tasks";

const admin = {kind: "staff" as const, userId: "u", profileId: "staff-1"};
const TASK_ID = "22222222-2222-4222-8222-222222222222";

describe("staffTasksRepository admin reads and resolve", () => {
  it("lists open tasks newest first for an admin and refuses a member", async () => {
    const execute = vi.fn(async () => [{id: TASK_ID, profile_id: null, journey_state_id: null, kind: "concierge_escalation", dedupe_key: "k", summary_code: "provider_handoff", context: {conversationId: "c1", reasonCode: "provider_handoff", locale: "en"}, status: "open", resolved_at: null, resolved_by_profile_id: null, created_at: new Date(), updated_at: new Date()}]);
    const repository = createStaffTasksRepository(async () => ({execute, transaction: vi.fn()}) as never);
    const tasks = await repository.listOpen(admin);
    expect(tasks[0]).toMatchObject({id: TASK_ID, kind: "concierge_escalation", summaryCode: "provider_handoff", status: "open"});
    await expect(repository.listOpen({kind: "member", userId: "u", profileId: "p"} as never)).rejects.toThrow();
  });

  it("resolves a task and records who did it", async () => {
    const execute = vi.fn(async () => [{id: TASK_ID}]);
    const repository = createStaffTasksRepository(async () => ({execute, transaction: vi.fn()}) as never);
    await expect(repository.resolve(admin, TASK_ID)).resolves.toEqual({id: TASK_ID, disposition: "resolved"});
  });
});
```

```ts
// tests/unit/task-action-core.test.ts
import {describe, expect, it, vi} from "vitest";

import {resolveStaffTask} from "@/lib/admin/task-action-core";

const TASK_ID = "22222222-2222-4222-8222-222222222222";

describe("resolveStaffTask", () => {
  it("requires an admin actor and a uuid id", async () => {
    const resolve = vi.fn(async () => ({id: TASK_ID, disposition: "resolved" as const}));
    await expect(resolveStaffTask({kind: "member", userId: "u", profileId: "p"}, TASK_ID, {resolve})).rejects.toThrow();
    await expect(resolveStaffTask({kind: "staff", userId: "u", profileId: "s"}, "nope", {resolve})).rejects.toThrow();
    await expect(resolveStaffTask({kind: "staff", userId: "u", profileId: "s"}, TASK_ID, {resolve})).resolves.toEqual({id: TASK_ID, disposition: "resolved"});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/inbox-repository.test.ts tests/unit/staff-tasks-admin.test.ts tests/unit/task-action-core.test.ts --reporter=dot`
Expected: FAIL — modules/methods missing

- [ ] **Step 3: Write the inbox repository**

```ts
// lib/db/repos/inbox.ts
import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {conversations, messages, profiles, staffTasks} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

export type InboxChannelFilter = "all" | "whatsapp" | "web";

export type InboxConversationSummary = Readonly<{
  id: string;
  channel: "whatsapp" | "web";
  locale: string;
  status: string;
  ownerLabel: string | null;   // member display name; null for an anonymous/prospect owner
  profileId: string | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  messageCount: number;
  escalated: boolean;
}>;

export type InboxMessage = Readonly<{
  id: string;
  role: "user" | "assistant" | "tool";
  channel: "whatsapp" | "web";
  content: string;
  createdAt: Date;
}>;

export type InboxTranscript = Readonly<{conversation: InboxConversationSummary; messages: readonly InboxMessage[]}>;

const listOptionsSchema = z.object({
  channel: z.enum(["all", "whatsapp", "web"]).default("all"),
  limit: z.number().int().min(1).max(200).default(50),
}).strict();

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function dateFrom(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function summaryFrom(row: Record<string, unknown>): InboxConversationSummary {
  return {
    id: String(row.id),
    channel: row.channel === "whatsapp" ? "whatsapp" : "web",
    locale: String(row.locale ?? "en"),
    status: String(row.status ?? "active"),
    ownerLabel: typeof row.display_name === "string" ? row.display_name : null,
    profileId: typeof row.profile_id === "string" ? row.profile_id : null,
    lastMessage: typeof row.last_message === "string" ? row.last_message : null,
    lastMessageAt: dateFrom(row.last_message_at),
    messageCount: Number(row.message_count ?? 0),
    escalated: Number(row.open_task_count ?? 0) > 0,
  };
}

/**
 * Staff read model over conversations + messages + staff_tasks. Read-only in
 * Phase A (audit F2): the human reply lane is Phase C. The channel of a
 * conversation is the channel of its latest message, because the
 * conversations table carries no channel column until Phase C.
 */
export function createInboxRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    async listConversations(actor: Actor, options: unknown): Promise<readonly InboxConversationSummary[]> {
      requireAdmin(actor);
      const parsed = listOptionsSchema.parse(options);
      const database = await loadDatabase();
      const channelFilter = parsed.channel === "all" ? sql`TRUE` : sql`latest.channel = ${parsed.channel}`;
      const rows = rowsFrom(await database.execute(sql`
        WITH latest AS (
          SELECT DISTINCT ON (m.conversation_id)
            m.conversation_id, m.channel, m.content AS last_message, m.created_at
          FROM ${messages} m
          ORDER BY m.conversation_id, m.created_at DESC
        ),
        counts AS (
          SELECT conversation_id, count(*)::int AS message_count FROM ${messages} GROUP BY conversation_id
        ),
        tasks AS (
          SELECT (context->>'conversationId') AS conversation_id, count(*)::int AS open_task_count
          FROM ${staffTasks} WHERE status = 'open' GROUP BY context->>'conversationId'
        )
        SELECT c.id, c.agent_kind, c.locale, c.status, c.last_message_at, c.profile_id,
               p.display_name, latest.channel, latest.last_message,
               COALESCE(counts.message_count, 0) AS message_count,
               COALESCE(tasks.open_task_count, 0) AS open_task_count
        FROM ${conversations} c
        LEFT JOIN ${profiles} p ON p.id = c.profile_id
        LEFT JOIN latest ON latest.conversation_id = c.id
        LEFT JOIN counts ON counts.conversation_id = c.id
        LEFT JOIN tasks ON tasks.conversation_id = c.id::text
        WHERE c.agent_kind = 'concierge' AND c.status <> 'deleted' AND ${channelFilter}
        ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
        LIMIT ${parsed.limit}
      `));
      return rows.map(summaryFrom);
    },

    async getTranscript(actor: Actor, conversationId: string): Promise<InboxTranscript | null> {
      requireAdmin(actor);
      const id = z.string().uuid().parse(conversationId);
      const database = await loadDatabase();
      const header = rowsFrom(await database.execute(sql`
        SELECT c.id, c.agent_kind, c.locale, c.status, c.last_message_at, c.profile_id, p.display_name,
               (SELECT channel FROM ${messages} m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS channel,
               (SELECT content FROM ${messages} m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
               (SELECT count(*)::int FROM ${messages} m WHERE m.conversation_id = c.id) AS message_count,
               (SELECT count(*)::int FROM ${staffTasks} t WHERE t.status = 'open' AND t.context->>'conversationId' = c.id::text) AS open_task_count
        FROM ${conversations} c
        LEFT JOIN ${profiles} p ON p.id = c.profile_id
        WHERE c.id = ${id} AND c.status <> 'deleted'
      `))[0];
      if (!header) return null;
      const transcript = rowsFrom(await database.execute(sql`
        SELECT id, role, channel, content, created_at
        FROM ${messages}
        WHERE conversation_id = ${id}
        ORDER BY created_at ASC, id ASC
        LIMIT 500
      `));
      return {
        conversation: summaryFrom(header),
        messages: transcript.map((row) => ({
          id: String(row.id),
          role: row.role === "assistant" ? "assistant" : row.role === "tool" ? "tool" : "user",
          channel: row.channel === "whatsapp" ? "whatsapp" : "web",
          content: String(row.content ?? ""),
          createdAt: dateFrom(row.created_at) ?? new Date(0),
        })),
      };
    },
  };
}

export type InboxRepository = ReturnType<typeof createInboxRepository>;
export const inboxRepository = createInboxRepository();
```

- [ ] **Step 4: Add admin reads and resolve to the staff-tasks repository**

In `lib/db/repos/staff-tasks.ts` add `import {requireAdmin} from "@/lib/auth/authorize";` and `import type {Actor} from "@/lib/membership/lifecycle";`, add this exported type beside `StaffTaskRecord` (the existing record types carry no `created_at`, and concierge tasks have a null `profileId`, so the admin list gets its own shape):

```ts
export type OpenStaffTask = Readonly<{
  id: string;
  profileId: string | null;
  kind: string;
  summaryCode: string;
  context: StaffTaskContext;
  status: "open" | "resolved";
  createdAt: Date;
}>;
```

then add two members to the object returned by `createStaffTasksRepository` (beside `createOnce`; `rowsFrom` already exists in that file):

```ts
    async listOpen(actor: Actor): Promise<readonly OpenStaffTask[]> {
      requireAdmin(actor);
      const database = await loadDatabase();
      const rows = rowsFrom(await database.execute(sql`
        SELECT id, profile_id, kind, summary_code, context, status, created_at
        FROM ${staffTasks}
        WHERE status = 'open'
        ORDER BY created_at DESC, id DESC
        LIMIT 200
      `));
      return rows.map((row) => ({
        id: String(row.id),
        profileId: typeof row.profile_id === "string" ? row.profile_id : null,
        kind: String(row.kind),
        summaryCode: String(row.summary_code),
        context: (row.context && typeof row.context === "object" ? row.context : {}) as StaffTaskContext,
        status: row.status === "resolved" ? "resolved" : "open",
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
      }));
    },

    async resolve(actor: Actor, taskId: string): Promise<Readonly<{id: string; disposition: "resolved" | "already_resolved"}>> {
      requireAdmin(actor);
      const id = z.string().uuid().parse(taskId);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        UPDATE ${staffTasks}
        SET status = 'resolved', resolved_at = now(), resolved_by_profile_id = ${actor.profileId}, updated_at = now()
        WHERE id = ${id} AND status = 'open'
        RETURNING id
      `))[0];
      return {id, disposition: row ? "resolved" : "already_resolved"};
    },
```

(`Actor` of kind `staff|exco|superadmin` carries `profileId`; `requireAdmin` narrows to `AdminActor` so the property is typed.)

- [ ] **Step 5: Action core + `"use server"` wrapper + admin read facade**

```ts
// lib/admin/task-action-core.ts
import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {staffTasksRepository} from "@/lib/db/repos/staff-tasks";
import type {Actor} from "@/lib/membership/lifecycle";

type Resolver = Pick<typeof staffTasksRepository, "resolve">;

/** Actor-taking core, kept out of the "use server" module (CLAUDE.md boundary #3). */
export async function resolveStaffTask(actor: Actor, taskId: unknown, deps: Resolver = staffTasksRepository) {
  requireAdmin(actor);
  const id = z.string().uuid().parse(taskId);
  return deps.resolve(actor, id);
}
```

```ts
// lib/admin/task-actions.ts
"use server";

import {revalidatePath} from "next/cache";

import {resolveStaffTask} from "@/lib/admin/task-action-core";

export async function resolveStaffTaskAction(formData: FormData): Promise<void> {
  const {requireAdminActor} = await import("@/lib/auth/actor");
  const actor = await requireAdminActor();
  await resolveStaffTask(actor, formData.get("taskId"));
  // revalidatePath takes the internal locale path (CLAUDE.md boundary #5 exception).
  revalidatePath("/en/admin/tasks");
  revalidatePath("/zh-HK/admin/tasks");
  revalidatePath("/en/admin");
  revalidatePath("/zh-HK/admin");
}
```

```ts
// lib/admin/inbox.ts
import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {inboxRepository, type InboxChannelFilter} from "@/lib/db/repos/inbox";
import {staffTasksRepository} from "@/lib/db/repos/staff-tasks";
import type {Actor} from "@/lib/membership/lifecycle";

export async function listInbox(actor: Actor, channel: InboxChannelFilter) {
  requireAdmin(actor);
  return inboxRepository.listConversations(actor, {channel, limit: 100});
}

export async function readTranscript(actor: Actor, conversationId: string) {
  requireAdmin(actor);
  return inboxRepository.getTranscript(actor, conversationId);
}

export async function listOpenTasks(actor: Actor) {
  requireAdmin(actor);
  return staffTasksRepository.listOpen(actor);
}
```

- [ ] **Step 6: Strings, navigation, components and pages**

`messages/en.json` → `"Admin"`: add `"inbox": "Inbox"` and `"tasks": "Tasks"` inside `navigation`; add `"openTasks": "Open staff tasks"` inside `dashboard`; add two namespaces:

```json
"inbox": {
  "eyebrow": "Member and lead conversations",
  "title": "Inbox",
  "description": "Every concierge conversation on the web widget and WhatsApp. Read-only in this release; replying from here arrives with the WhatsApp operations phase.",
  "filters": {"all": "All", "whatsapp": "WhatsApp", "web": "Web"},
  "columns": {"owner": "Who", "channel": "Channel", "last": "Last message", "when": "Updated", "messages": "Messages", "status": "Status"},
  "anonymous": "Prospect (not a member)",
  "escalated": "Needs a person",
  "empty": "No conversations yet.",
  "error": "The inbox could not be loaded.",
  "open": "Open",
  "back": "Back to inbox",
  "roles": {"user": "Sender", "assistant": "Concierge", "tool": "Tool"}
},
"tasks": {
  "eyebrow": "Escalations",
  "title": "Staff tasks",
  "description": "Concierge hand-offs and automation follow-ups waiting for a person.",
  "columns": {"kind": "Kind", "summary": "Summary", "member": "Member", "conversation": "Conversation", "created": "Created", "actions": "Actions"},
  "resolve": "Mark resolved",
  "openConversation": "Open conversation",
  "empty": "Nothing is waiting for a person.",
  "error": "Tasks could not be loaded."
}
```

`messages/zh-HK.json` → `"Admin"`: `"inbox": "訊息中心"`, `"tasks": "待辦"` in `navigation`; `"openTasks": "待處理員工任務"` in `dashboard`; and:

```json
"inbox": {
  "eyebrow": "會員及潛在客戶對話",
  "title": "訊息中心",
  "description": "網頁小工具及 WhatsApp 上的所有禮賓對話。此版本只可閱讀；於 WhatsApp 營運階段將可直接回覆。",
  "filters": {"all": "全部", "whatsapp": "WhatsApp", "web": "網頁"},
  "columns": {"owner": "對象", "channel": "渠道", "last": "最後訊息", "when": "更新時間", "messages": "訊息數", "status": "狀態"},
  "anonymous": "潛在客戶（非會員）",
  "escalated": "需要真人跟進",
  "empty": "尚未有對話。",
  "error": "無法載入訊息中心。",
  "open": "開啟",
  "back": "返回訊息中心",
  "roles": {"user": "發送者", "assistant": "禮賓", "tool": "工具"}
},
"tasks": {
  "eyebrow": "升級個案",
  "title": "員工任務",
  "description": "等待真人處理的禮賓轉介及自動化跟進。",
  "columns": {"kind": "類型", "summary": "摘要", "member": "會員", "conversation": "對話", "created": "建立時間", "actions": "操作"},
  "resolve": "標記為已處理",
  "openConversation": "開啟對話",
  "empty": "目前沒有待處理項目。",
  "error": "無法載入任務。"
}
```

`config/internal-navigation.ts`: in the `workspace` group after `{id: "at-risk", …}` add `{id: "inbox", href: "/admin/inbox"}, {id: "tasks", href: "/admin/tasks"},`.

`components/admin/admin-nav.tsx`: add `inbox: "navigation.inbox", tasks: "navigation.tasks",` to `linkLabelKeys`.

```tsx
// components/admin/inbox-list.tsx
import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {InboxConversationSummary} from "@/lib/db/repos/inbox";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{owner: string; channel: string; last: string; when: string; messages: string; status: string; anonymous: string; escalated: string; empty: string; open: string; filters: Readonly<{all: string; whatsapp: string; web: string}>}>;

export function InboxList({locale, rows, labels, channel}: Readonly<{locale: AppLocale; rows: readonly InboxConversationSummary[]; labels: Labels; channel: "all" | "whatsapp" | "web"}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return (
    <div className="space-y-4">
      <nav aria-label={labels.channel} className="flex gap-2">
        {(["all", "whatsapp", "web"] as const).map((key) => (
          <Link aria-current={key === channel ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${key === channel ? "border-primary text-primary" : "border-border"}`} href={`${localizedPath(locale, "/admin/inbox")}?channel=${key}`} key={key}>{labels.filters[key]}</Link>
        ))}
      </nav>
      {rows.length === 0 ? <p className="text-muted-foreground">{labels.empty}</p> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th className="p-3">{labels.owner}</th><th className="p-3">{labels.channel}</th><th className="p-3">{labels.last}</th><th className="p-3">{labels.when}</th><th className="p-3">{labels.messages}</th><th className="p-3">{labels.status}</th><th className="p-3"><span className="sr-only">{labels.open}</span></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-border" key={row.id}>
                  <td className="p-3">{row.ownerLabel ?? <span className="text-muted-foreground">{labels.anonymous}</span>}</td>
                  <td className="p-3">{row.channel}</td>
                  <td className="max-w-md truncate p-3">{row.lastMessage ?? ""}</td>
                  <td className="p-3">{row.lastMessageAt ? formatter.format(row.lastMessageAt) : ""}</td>
                  <td className="p-3">{row.messageCount}</td>
                  <td className="p-3">{row.escalated ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{labels.escalated}</span> : row.status}</td>
                  <td className="p-3"><Link className="text-primary underline" href={localizedPath(locale, `/admin/inbox/${row.id}`)}>{labels.open}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

```tsx
// components/admin/inbox-thread.tsx
import type {AppLocale} from "@/i18n/routing";
import type {InboxTranscript} from "@/lib/db/repos/inbox";

type Labels = Readonly<{roles: Readonly<{user: string; assistant: string; tool: string}>}>;

export function InboxThread({locale, transcript, labels}: Readonly<{locale: AppLocale; transcript: InboxTranscript; labels: Labels}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return (
    <ol className="space-y-3">
      {transcript.messages.map((message) => (
        <li className={`rounded-md border border-border p-4 ${message.role === "user" ? "bg-background" : "bg-muted/40"}`} key={message.id}>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">{labels.roles[message.role]} · {message.channel} · <time dateTime={message.createdAt.toISOString()}>{formatter.format(message.createdAt)}</time></p>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </li>
      ))}
    </ol>
  );
}
```

```tsx
// components/admin/task-table.tsx
import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {OpenStaffTask} from "@/lib/db/repos/staff-tasks";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{kind: string; summary: string; member: string; conversation: string; created: string; actions: string; resolve: string; openConversation: string; empty: string}>;

export function TaskTable({locale, tasks, labels, action}: Readonly<{locale: AppLocale; tasks: readonly OpenStaffTask[]; labels: Labels; action: (formData: FormData) => Promise<void>}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  if (tasks.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th className="p-3">{labels.kind}</th><th className="p-3">{labels.summary}</th><th className="p-3">{labels.member}</th><th className="p-3">{labels.conversation}</th><th className="p-3">{labels.created}</th><th className="p-3">{labels.actions}</th></tr></thead>
        <tbody>
          {tasks.map((task) => (
            <tr className="border-t border-border" key={task.id}>
              <td className="p-3">{task.kind}</td>
              <td className="p-3">{task.summaryCode}</td>
              <td className="p-3">{task.profileId ?? ""}</td>
              <td className="p-3">{task.context.conversationId ? <Link className="text-primary underline" href={localizedPath(locale, `/admin/inbox/${task.context.conversationId}`)}>{labels.openConversation}</Link> : ""}</td>
              <td className="p-3"><time dateTime={task.createdAt.toISOString()}>{formatter.format(task.createdAt)}</time></td>
              <td className="p-3"><form action={action}><input name="taskId" type="hidden" value={task.id} /><button className="rounded-md border border-border px-3 py-1" type="submit">{labels.resolve}</button></form></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

```tsx
// app/[locale]/(admin)/admin/inbox/page.tsx
import {getTranslations, setRequestLocale} from "next-intl/server";

import {InboxList} from "@/components/admin/inbox-list";
import type {AppLocale} from "@/i18n/routing";
import {listInbox} from "@/lib/admin/inbox";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function channelFrom(value: string | string[] | undefined): "all" | "whatsapp" | "web" {
  return value === "whatsapp" || value === "web" ? value : "all";
}

export default async function AdminInboxPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.inbox"});
  const channel = channelFrom((await searchParams).channel);
  const header = <header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header>;
  let rows;
  try {
    rows = await listInbox(actor, channel);
  } catch {
    return <div className="space-y-8">{header}<p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p></div>;
  }
  return <div className="space-y-8">{header}<InboxList channel={channel} labels={{owner: t("columns.owner"), channel: t("columns.channel"), last: t("columns.last"), when: t("columns.when"), messages: t("columns.messages"), status: t("columns.status"), anonymous: t("anonymous"), escalated: t("escalated"), empty: t("empty"), open: t("open"), filters: {all: t("filters.all"), whatsapp: t("filters.whatsapp"), web: t("filters.web")}}} locale={locale} rows={rows} /></div>;
}
```

```tsx
// app/[locale]/(admin)/admin/inbox/[id]/page.tsx
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {InboxThread} from "@/components/admin/inbox-thread";
import type {AppLocale} from "@/i18n/routing";
import {readTranscript} from "@/lib/admin/inbox";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

export default async function AdminInboxThreadPage({params}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.inbox"});
  const transcript = await readTranscript(actor, id).catch(() => null);
  if (!transcript) notFound();
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link className="text-sm text-primary underline" href={localizedPath(locale, "/admin/inbox")}>{t("back")}</Link>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{transcript.conversation.ownerLabel ?? t("anonymous")}</h1>
        <p className="text-muted-foreground">{transcript.conversation.channel} · {transcript.conversation.messageCount}</p>
      </header>
      <InboxThread labels={{roles: {user: t("roles.user"), assistant: t("roles.assistant"), tool: t("roles.tool")}}} locale={locale} transcript={transcript} />
    </div>
  );
}
```

```tsx
// app/[locale]/(admin)/admin/tasks/page.tsx
import {getTranslations, setRequestLocale} from "next-intl/server";

import {TaskTable} from "@/components/admin/task-table";
import type {AppLocale} from "@/i18n/routing";
import {listOpenTasks} from "@/lib/admin/inbox";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {resolveStaffTaskAction} from "@/lib/admin/task-actions";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminTasksPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.tasks"});
  const header = <header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header>;
  let tasks;
  try {
    tasks = await listOpenTasks(actor);
  } catch {
    return <div className="space-y-8">{header}<p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p></div>;
  }
  return <div className="space-y-8">{header}<TaskTable action={resolveStaffTaskAction} labels={{kind: t("columns.kind"), summary: t("columns.summary"), member: t("columns.member"), conversation: t("columns.conversation"), created: t("columns.created"), actions: t("columns.actions"), resolve: t("resolve"), openConversation: t("openConversation"), empty: t("empty")}} locale={locale} tasks={tasks} /></div>;
}
```

`app/[locale]/(admin)/admin/page.tsx`: import `listOpenTasks` from `@/lib/admin/inbox`, add `count(listOpenTasks(actor))` as a fifth entry of the `Promise.all` in `queueCounts` (return it as `openTasks`), and add the tile `{id: "tasks", href: "/admin/tasks", label: t("dashboard.openTasks"), count: counts.openTasks}` to `tiles`.

- [ ] **Step 7: Run tests, audit, typecheck, lint**

Run: `npx vitest run tests/unit/inbox-repository.test.ts tests/unit/staff-tasks-admin.test.ts tests/unit/task-action-core.test.ts tests/unit/server-action-actor-boundary.test.ts tests/unit/admin-events.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npm run lint`
Expected: PASS. If a route-discovery or nav test enumerates admin link ids, add `inbox` and `tasks` to its expected list.

- [ ] **Step 8: Commit**

```bash
git add lib/db/repos/inbox.ts lib/db/repos/staff-tasks.ts lib/admin/inbox.ts lib/admin/task-action-core.ts lib/admin/task-actions.ts "app/[locale]/(admin)/admin/inbox" "app/[locale]/(admin)/admin/tasks" "app/[locale]/(admin)/admin/page.tsx" components/admin/inbox-list.tsx components/admin/inbox-thread.tsx components/admin/task-table.tsx config/internal-navigation.ts components/admin/admin-nav.tsx messages tests/unit/inbox-repository.test.ts tests/unit/staff-tasks-admin.test.ts tests/unit/task-action-core.test.ts
git commit -m "feat(admin): read-only inbox over concierge conversations and a staff task queue (F2)"
```

---

### Task 12: Segment filter v1.5 — `whatsappOptIn` (F11)

**Files:**
- Modify: `lib/admin/segment-schema.ts:10-19, 50-70`
- Modify: `lib/db/repos/segments.ts:52-69`
- Modify: `components/admin/segment-builder.tsx` (one select)
- Modify: `messages/*` (`Admin.segments.filters.whatsappOptIn` + option labels)
- Test: extend `tests/unit/segment-schema.test.ts`, `tests/unit/segment-query.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/segment-schema.test.ts` (import `parseSegmentRouteQuery` and `segmentFilterSchema` if not already imported):

```ts
  it("accepts a nullable whatsappOptIn tri-state and defaults it to null", () => {
    expect(segmentFilterSchema.parse({}).whatsappOptIn).toBeNull();
    expect(segmentFilterSchema.parse({whatsappOptIn: true}).whatsappOptIn).toBe(true);
    expect(segmentFilterSchema.parse({whatsappOptIn: "true"}).whatsappOptIn).toBe(true);
    expect(segmentFilterSchema.parse({whatsappOptIn: ""}).whatsappOptIn).toBeNull();
    expect(parseSegmentRouteQuery({whatsappOptIn: "false"}).filter.whatsappOptIn).toBe(false);
  });
```

Append to `tests/unit/segment-query.test.ts`, using whatever helper that file already uses to render `segmentPredicates` to SQL text and parameters:

```ts
  it("filters on whatsapp opt-in when set", () => {
    const query = renderSql(segmentPredicates(segmentFilterSchema.parse({whatsappOptIn: true})));
    expect(query.sql).toContain("whatsapp_opt_in");
    expect(query.params).toContain(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/segment-schema.test.ts tests/unit/segment-query.test.ts --reporter=dot`
Expected: FAIL — `.strict()` rejects `whatsappOptIn`

- [ ] **Step 3: Extend the schema, the SQL and the form**

In `lib/admin/segment-schema.ts` add a helper after `nullableNumber`:

```ts
const triStateBoolean = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return null;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean().nullable().default(null));
```

Add `whatsappOptIn: triStateBoolean,` to `segmentFilterSchema` after `lastLoginBeforeDays`; add `whatsappOptIn: z.union([z.string(), z.boolean()]).optional().transform((value) => value ?? null),` to `segmentRouteQuerySchema` and pass `whatsappOptIn` through its `.transform` into the `segmentFilterSchema.parse({...})` call.

In `lib/db/repos/segments.ts` `segmentPredicates`, after the `lastLoginBeforeDays` block add:

```ts
  if (filter.whatsappOptIn !== null) terms.push(sql`${profiles.whatsappOptIn} = ${filter.whatsappOptIn}`);
```

In `components/admin/segment-builder.tsx`, beside the `sector` input add a `<select name="whatsappOptIn">` with options `""`, `"true"`, `"false"` labelled from four new keys in `Admin.segments.filters` — en: `"whatsappOptIn": "WhatsApp opt-in"`, `"whatsappAny": "Any"`, `"whatsappYes": "Opted in"`, `"whatsappNo": "Not opted in"`; zh-HK: `"whatsappOptIn": "WhatsApp 同意接收"`, `"whatsappAny": "不限"`, `"whatsappYes": "已同意"`, `"whatsappNo": "未同意"`. The builder already serialises every named field into the preview query string, so no other plumbing changes.

- [ ] **Step 4: Run the segment suite, audit, typecheck**

Run: `npx vitest run tests/unit/segment-schema.test.ts tests/unit/segment-query.test.ts tests/unit/segment-save-action.test.ts tests/unit/segment-save-form.test.tsx tests/unit/segment-export-route.test.ts --reporter=dot && npm run audit:strings && npm run typecheck`
Expected: PASS (saved segments with `filter_version: 1` parse unchanged because the new key defaults to `null`).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/segment-schema.ts lib/db/repos/segments.ts components/admin/segment-builder.tsx messages tests/unit/segment-schema.test.ts tests/unit/segment-query.test.ts
git commit -m "feat(segments): whatsappOptIn filter (F11)"
```

---

### Task 13: Hygiene — programme year, portal anonymous redirect, demo-content archive, privacy paragraph (F20, F21, F14, D-6)

**Files:**
- Modify: `lib/programs/programme-header.ts:16`, `tests/unit/programme-header.test.ts:23`
- Modify: `app/[locale]/(member)/portal/page.tsx:16`
- Create: `scripts/archive-demo-content.ts`; Modify: `package.json` scripts
- Modify: `messages/*` (`Privacy.sections`)

- [ ] **Step 1: Make the programme header test assert the first year**

In `tests/unit/programme-header.test.ts` line 23 change the expectation to:

```ts
    expect(facts.fact).toBe(`${asa.editionCount} editions since ${asa.firstYear}`);
```

Run: `npx vitest run tests/unit/programme-header.test.ts --reporter=dot`
Expected: FAIL — "10 editions since 2025" ≠ "10 editions since 2013"

- [ ] **Step 2: Use `firstYear` in the header**

In `lib/programs/programme-header.ts` change the `editionsFact` call to:

```ts
      : t('editionsFact', {count: summary.editionCount ?? 0, year: summary.firstYear ?? ''});
```

and amend the comment above the function: the header states the span from the **first** edition, matching `components/marketing/programme-grid.tsx` (card fixed in `03904e3`; the header was missed).

Run: `npx vitest run tests/unit/programme-header.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 3: Stop `/portal` throwing for anonymous visitors (F21)**

In `app/[locale]/(member)/portal/page.tsx` replace `const actor = await requireActor();` with:

```ts
  // The layout redirects unauthenticated visitors, but Next renders layout and
  // page in parallel, so requireActor() here threw UNAUTHORIZED into the
  // runtime error log on every anonymous hit (Vercel, 2026-09). Redirecting
  // from the page as well keeps the log clean and the behaviour identical.
  const actor = await getActor();
  if (!actor) redirect(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent("/portal")}`);
```

with imports `import {getActor} from "@/lib/auth/actor";`, `import {redirect} from "next/navigation";`, `import {localizedPath} from "@/lib/urls";` (remove the now-unused `requireActor` import).

Run: `npx vitest run tests/unit/portal-authorization.test.ts tests/unit/portal-continuation.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 4: Demo-content archive script (D-13), guarded like the other seeds**

```ts
// scripts/archive-demo-content.ts
// Archives the fictional showcase listings and news post that shipped as
// public-journey demos (audit F14). Guarded: requires an explicit flag and a
// DATABASE_URL, mirroring scripts/seed-m6.ts's opt-in shape.
import {neon} from "@neondatabase/serverless";

const flag = process.env.ARCHIVE_DEMO_CONTENT;
const url = process.env.DATABASE_URL;
if (flag !== "true" || !url) {
  console.error("Set ARCHIVE_DEMO_CONTENT=true and DATABASE_URL to run.");
  process.exit(1);
}
const sql = neon(url);
const listings = await sql`UPDATE showcase_listings SET status = 'rejected', rejection_reason = 'demo content archived 2026-09', reviewed_at = now(), updated_at = now() WHERE slug LIKE '%-demo' AND status = 'published' RETURNING slug`;
const posts = await sql`UPDATE posts SET archived_at = now(), updated_at = now() WHERE slug = 'wtia-demo-content-note-2026' AND archived_at IS NULL RETURNING slug`;
console.log(JSON.stringify({archivedListings: listings.map((row) => row.slug), archivedPosts: posts.map((row) => row.slug)}));
```

Add to `package.json` scripts: `"content:archive-demo": "node --experimental-strip-types scripts/archive-demo-content.ts"`. Run it once against production during the Phase A content gate (`ARCHIVE_DEMO_CONTENT=true DATABASE_URL=… npm run content:archive-demo`); the pages read live rows, so no rebuild is needed.

- [ ] **Step 5: Privacy statement paragraph (D-6, D-7)**

Add one section to `Privacy.sections` in both bundles, in the same shape as the existing entries there (a heading plus its paragraphs, as `parsePolicySections` in `components/marketing/policy-sections.tsx` expects):

en — heading "WhatsApp messages and enquiries"; paragraphs: "If you message WTIA on WhatsApp we keep your number, the conversation and when you wrote so that we can reply. We only send you activity updates or announcements on WhatsApp if you have ticked a consent box on this site or asked us to; we record when and where you agreed." and "Reply STOP to any WhatsApp message, use the unsubscribe link in any email, or update your member profile to withdraw consent at any time. Withdrawal stops marketing messages; we may still send transactional messages about a registration or membership you hold."

zh-HK — heading "WhatsApp 訊息及查詢"; paragraphs: "如你透過 WhatsApp 聯絡 WTIA，我們會保留你的號碼、對話內容及時間，以便回覆。只有在你於本網站剔選同意欄或主動要求後，我們才會透過 WhatsApp 向你發送活動更新或公告，並會記錄你同意的時間及途徑。" and "你可隨時回覆「取消」、使用電郵內的取消訂閱連結，或更新會員個人資料以撤回同意。撤回後我們會停止推廣訊息，但仍可能就你持有的報名或會籍發送交易性訊息。"

- [ ] **Step 6: Full gate**

Run: `npm run audit:strings && npm test && npm run lint && npm run typecheck && npm run build`
Expected: all green (the full Vitest run takes more than 10 minutes on 2 vCPU — run it once here, not per task).

- [ ] **Step 7: Commit**

```bash
git add lib/programs/programme-header.ts tests/unit/programme-header.test.ts "app/[locale]/(member)/portal/page.tsx" scripts/archive-demo-content.ts package.json messages
git commit -m "chore(phase-a): programme first-year fact, quiet portal redirect, demo archive script, privacy WhatsApp section"
```

---

## Phase A exit checklist

- [ ] Migration `0025_phase_a_contacts_consent` applied to production before the deploy that contains Task 4+ (the join step writes the new columns).
- [ ] `WOZTELL_*` env unchanged (`RUN_LIVE_WOZTELL` unset) — the webhook still processes with the mock adapter; the contact and opt-out writes are real.
- [ ] `config/site.ts` `whatsapp` stays `undefined` until the ops track (spec §8) delivers the number; then set it, redeploy, and the click-to-chat links appear.
- [ ] Owner walk of the acceptance script in spec §4, both locales, on a Preview, then on production.
- [ ] Playwright: add `tests/e2e/phase-a-funnel.spec.ts` covering bare `/join` → chooser, `/events` interest form success message, `/admin/inbox` and `/admin/tasks` reachable for the credential-gated admin fixture (`tests/fixtures/m2-auth.ts`), and the `/zh` equivalents.
