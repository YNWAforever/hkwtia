# WP-4 Inner-Page Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the ~20 remaining public pages (Events, Showcase, Membership, About/History/Chairman/Committees, Programs, Launch Pad, News, Contact, AI-Transparency/Privacy, AI-Ops, not-found) onto the same donor-fidelity presentation layer WP-1 through WP-3 already established for the homepage and shell — real ported `app/styles/wisetech.css` classes over real data, `components/wt/*` primitives reused wherever their shape fits, two new shared primitives (`RouteMap`, `RichCompass`/`RichRelatedRoutes`/`InnerCardGrid`) added where it doesn't, and two small cross-cutting fixes (`PageHero`'s breadcrumb as a `<nav>` landmark, the concierge launcher's `.concierge` positioning wrapper) that every page in this plan depends on.

**Architecture:** Two cross-cutting primitive/fix tasks land first, since Groups A–D's own tasks assume them. The remaining twenty tasks are grouped by area (Events & Conversion; Showcase & Membership; Institutional/About/Programs; Launch Pad/News/Contact/Policy/AI-Ops/not-found) and were drafted in parallel against the approved design spec, each task independently investigating its own real data shapes and real donor CSS selectors before writing to them — several tasks explicitly document where the spec's own language didn't match the actual codebase (no `format` field on events, no `.first-90` class, two genuinely different GBA route-map shapes, CPAI having no editions field) and resolve the gap honestly rather than fabricating data or classes. A penultimate task reconciles the two existing public-journey e2e specs against the rewritten markup, and a final task runs the whole-programme regression gate and opens the PR.

**Tech Stack:** Next.js 16 App Router (Webpack) · React 19 Server Components · TypeScript strict · Tailwind v3 + the ported `wisetech.css`/`wisetech-shell.css` donor stylesheets · next-intl v4 (`en`, `zh-HK`) · Vitest + Testing Library · Drizzle/Neon repositories already built in earlier milestones.

---

### Task 1: Promote `PageHero`'s breadcrumb to a `<nav>` landmark (spec §6, Decision 6)

**Files:**
- Modify: `components/wt/page-hero.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Modify: `tests/unit/wt-primitives.test.tsx`
- Modify: `tests/unit/messages.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/wt-primitives.test.tsx` — add `within` to the existing import (line 1):

```ts
import {render, screen, within} from "@testing-library/react";
```

Replace the existing `"PageHero renders the donor structure over an own-origin figure"` test (lines 150-178) with:

```tsx
  it("PageHero renders the donor structure over an own-origin figure", () => {
    render(
      <PageHero
        variant="inner"
        eyebrow="Events"
        title="Find an activity"
        lead="Lead copy"
        artMark="W+"
        image={{src: "/images/projects-hero.jpg", alt: "Community", caption: "WTIA archive"}}
        actions={[{href: "/events", label: "Find an event"}, {href: "/membership", label: "Compare"}]}
        breadcrumb={{homeHref: "/", homeLabel: "Home", current: "Events"}}
        breadcrumbLabel="Breadcrumb"
      />,
    );
    const section = document.querySelector("section");
    expect(section).toHaveClass("page-hero", "inner-page-hero");
    expect(screen.getByRole("heading", {level: 1})).toHaveTextContent("Find an activity");
    expect(screen.getByText("Events", {selector: "p"})).toHaveClass("eyebrow", "light");
    const image = screen.getByRole("img", {name: "Community"});
    expect(image).toHaveAttribute("src", "/images/projects-hero.jpg");
    expect(image).toHaveAttribute("data-fill", "true");
    expect(image).toHaveAttribute("data-sizes", "(max-width: 820px) 100vw, 58vw");
    expect(screen.getByText("WTIA archive").tagName).toBe("FIGCAPTION");
    expect(screen.getByRole("link", {name: "Find an event"})).toHaveClass("button", "button-light");
    expect(screen.getByRole("link", {name: "Compare"})).toHaveClass("text-link", "light-link");
    const breadcrumbNav = screen.getByRole("navigation", {name: "Breadcrumb"});
    expect(breadcrumbNav).toHaveClass("breadcrumb");
    expect(within(breadcrumbNav).getByRole("link", {name: "Home"})).toHaveAttribute("href", "/");
    expect(breadcrumbNav.querySelector("b")).toHaveTextContent("Events");
    expect(document.querySelector(".page-hero-art")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".page-hero-art span")).toHaveTextContent("W+");
  });

  it("PageHero falls back to the default breadcrumb label when none is supplied", () => {
    render(
      <PageHero
        eyebrow="About"
        title="Who we are"
        lead="Lead"
        breadcrumb={{homeHref: "/", homeLabel: "Home", current: "About"}}
      />,
    );
    expect(screen.getByRole("navigation", {name: "Breadcrumb"})).toBeInTheDocument();
  });
```

(Leave the following `"PageHero omits the figure and art..."` test at what are now lines 195-201 untouched.)

`tests/unit/messages.test.ts` — append a new entry to the end of the `publicJourneyKeys` array (currently ending `'Concierge.close',`):

```ts
  'Concierge.close',
  'Common.breadcrumbLabel',
```

- [ ] **Step 2: Run the tests and confirm they fail for the right reason**

Run: `npx vitest run tests/unit/wt-primitives.test.tsx tests/unit/messages.test.ts`
Expected: FAIL — `wt-primitives.test.tsx` fails both new/changed `PageHero` assertions with `Unable to find role="navigation"` (or a matching accessible name), because `PageHero` still renders `<div className="breadcrumb">` and has no `breadcrumbLabel` prop; `messages.test.ts` fails the public-journey-keys check because `Common.breadcrumbLabel` doesn't exist in either bundle yet.

- [ ] **Step 3: Promote the breadcrumb to a `<nav>` and add the `breadcrumbLabel` prop**

`components/wt/page-hero.tsx` — replace the `PageHeroProps` type (lines 11-23):

```tsx
type PageHeroProps = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  variant?: 'page' | 'inner';
  image?: Readonly<{src: string; alt: string; caption?: string}>;
  artMark?: string;
  actions?: readonly WtAction[];
  priority?: boolean;
  breadcrumb?: Readonly<{homeHref: string; homeLabel: string; current: string}>;
  id?: string;
  className?: string;
}>;
```

with:

```tsx
type PageHeroProps = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  variant?: 'page' | 'inner';
  image?: Readonly<{src: string; alt: string; caption?: string}>;
  artMark?: string;
  actions?: readonly WtAction[];
  priority?: boolean;
  breadcrumb?: Readonly<{homeHref: string; homeLabel: string; current: string}>;
  /** Accessible name for the breadcrumb `<nav>`. This primitive has no locale of its own, so
   * callers resolve `Common.breadcrumbLabel` themselves and pass the translated string;
   * `BREADCRUMB_LABEL_FALLBACK` only covers a caller that omits it. */
  breadcrumbLabel?: string;
  id?: string;
  className?: string;
}>;

const BREADCRUMB_LABEL_FALLBACK = 'Breadcrumb';
```

Replace the function signature (line 25):

```tsx
export function PageHero({eyebrow, title, lead, variant = 'page', image, artMark, actions, priority = true, breadcrumb, id, className}: PageHeroProps) {
```

with:

```tsx
export function PageHero({eyebrow, title, lead, variant = 'page', image, artMark, actions, priority = true, breadcrumb, breadcrumbLabel, id, className}: PageHeroProps) {
```

Replace the breadcrumb markup (lines 60-66):

```tsx
        {breadcrumb ? (
          <div className="breadcrumb">
            <Link href={breadcrumb.homeHref}>{breadcrumb.homeLabel}</Link>
            <span aria-hidden="true">/</span>
            <b>{breadcrumb.current}</b>
          </div>
        ) : null}
```

with:

```tsx
        {breadcrumb ? (
          <nav className="breadcrumb" aria-label={breadcrumbLabel ?? BREADCRUMB_LABEL_FALLBACK}>
            <Link href={breadcrumb.homeHref}>{breadcrumb.homeLabel}</Link>
            <span aria-hidden="true">/</span>
            <b>{breadcrumb.current}</b>
          </nav>
        ) : null}
```

(`.breadcrumb` in `app/styles/wisetech.css:269` is a class selector with no element-type qualifier, so the donor styling applies unchanged to the `<nav>`.)

- [ ] **Step 4: Add the message key**

`messages/en.json` — inside `"Common"` (currently just `"skipToContent"`):

```json
  "Common": {
    "skipToContent": "Skip to content",
    "breadcrumbLabel": "Breadcrumb"
  },
```

`messages/zh-HK.json` — inside `"Common"`:

```json
  "Common": {
    "skipToContent": "跳至主要內容",
    "breadcrumbLabel": "位置導覽"
  },
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wt-primitives.test.tsx tests/unit/messages.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/wt/page-hero.tsx messages/en.json messages/zh-HK.json tests/unit/wt-primitives.test.tsx tests/unit/messages.test.ts
git commit -m "$(cat <<'EOF'
feat: promote PageHero's breadcrumb to a nav landmark

Decision 6 of the WP-4 design closes errata E-11's deferral: the breadcrumb
was still a bare div. It's now a <nav aria-label> with a new
Common.breadcrumbLabel message key, so every WP-4 page inherits an
accessible breadcrumb landmark for free once it adopts PageHero.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wrap the concierge launcher in `.concierge` (spec §6, Decision 5)

**Files:**
- Modify: `components/ai/concierge-widget.tsx`
- Modify: `tests/unit/concierge-widget.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/concierge-widget.test.tsx` — append a new `it` block immediately before the file's final closing `});` (after the `"records one 1..5 feedback score..."` test, i.e. at the end of the `describe("ConciergeWidget", ...)` block):

```tsx
  it("wraps the launcher in the donor .concierge positioning wrapper", () => {
    render(widget());
    const launcher = screen.getByRole("button", {name: labels.launcher});
    const wrapper = launcher.closest(".concierge");
    expect(wrapper).not.toBeNull();
    expect(wrapper).not.toBe(launcher);
    expect(wrapper).toHaveClass(
      "concierge",
      "fixed",
      "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
      "right-[calc(1rem+env(safe-area-inset-right))]",
      "z-40",
    );
    expect(launcher).toHaveClass("concierge-trigger", "touch-manipulation");
    expect(launcher).not.toHaveClass("fixed", "z-40");
    expect(launcher.className).not.toMatch(/bottom-\[calc\(1rem/);
    expect(launcher.className).not.toMatch(/right-\[calc\(1rem/);
  });
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

Run: `npx vitest run tests/unit/concierge-widget.test.tsx`
Expected: FAIL — `launcher.closest(".concierge")` is `null` today, because no ancestor of the trigger button carries the `.concierge` class; the button itself still carries `fixed`/`bottom-[...]`/`right-[...]`/`z-40`.

- [ ] **Step 3: Wrap the trigger and move the fixed-positioning utilities onto the wrapper**

`components/ai/concierge-widget.tsx` — replace the block from `<Dialog.Trigger asChild>` through its closing `</Dialog.Trigger>` (currently lines 541-569, immediately inside `<Dialog.Root open={open} onOpenChange={handleOpenChange}>` and immediately before `<Dialog.Portal>`):

```tsx
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={labels.launcher}
          aria-controls={dialogId}
          aria-expanded={open}
          className="concierge-trigger fixed touch-manipulation bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-40 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg motion-safe:transition-[opacity,transform] motion-safe:duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 active:opacity-90"
        >
          {/* Both class families on purpose: `.concierge-trigger` and its `span` rule style this
              inside the public route group, where the port is loaded, and the Tailwind
              utilities are the fallback in the portal, where it is not (errata E-11). They only
              back the port up, never override it: `hover:bg-primary/90` was dropped because at
              specificity (0,2,0) it beat `.concierge-trigger` (0,1,0) and repainted the donor
              ink on hover, and the port declares no `.concierge-trigger:hover` of its own — so
              the donor pill keeps its colour. `hover:opacity-90` is the one hover effect that
              does not repaint that ink: `.concierge-trigger` declares no `opacity`, so it
              layers over both renderings rather than overriding either, and it matches the
              `active:opacity-90` already here. Without it the portal launcher, which never
              loads the port, would have no hover affordance at all. The label must stay a bare
              text node — `.concierge-trigger span` turns any span into the 38px badge. */}
          <span
            aria-hidden="true"
            className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-white font-serif text-[15px] font-bold text-primary"
          >
            W+
          </span>
          {labels.launcher}
        </button>
      </Dialog.Trigger>
```

with:

```tsx
      <div className="concierge fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-40">
        {/* `.concierge` (wisetech.css:286) is the donor's fixed-position anchor: the three
            `.site-root:has(.event-action-bar) .concierge` lifts (wisetech.css:419,445,449) and
            the narrow-viewport hide (wisetech.css:860) all key off this exact class on the fixed
            ancestor, not on `.concierge-trigger`. Until now nothing in the tree carried
            `.concierge`, so those six donor rules were completely inert (spec Decision 5). The
            `fixed`/offset/`z-40` Tailwind utilities move here from the button — they used to
            position the button independently of any wrapper, which would have made the donor
            lifts above no-ops even after adding the class, since a `fixed` button ignores an
            ancestor's `bottom`/`right`. They stay as the fallback for the portal layout, which
            never loads wisetech.css (errata E-11), so the launcher still positions itself
            correctly there. */}
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label={labels.launcher}
            aria-controls={dialogId}
            aria-expanded={open}
            className="concierge-trigger touch-manipulation inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg motion-safe:transition-[opacity,transform] motion-safe:duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 active:opacity-90"
          >
            {/* Both class families on purpose: `.concierge-trigger` and its `span` rule style this
                inside the public route group, where the port is loaded, and the Tailwind
                utilities are the fallback in the portal, where it is not (errata E-11). They only
                back the port up, never override it: `hover:bg-primary/90` was dropped because at
                specificity (0,2,0) it beat `.concierge-trigger` (0,1,0) and repainted the donor
                ink on hover, and the port declares no `.concierge-trigger:hover` of its own — so
                the donor pill keeps its colour. `hover:opacity-90` is the one hover effect that
                does not repaint that ink: `.concierge-trigger` declares no `opacity`, so it
                layers over both renderings rather than overriding either, and it matches the
                `active:opacity-90` already here. Without it the portal launcher, which never
                loads the port, would have no hover affordance at all. The label must stay a bare
                text node — `.concierge-trigger span` turns any span into the 38px badge. */}
            <span
              aria-hidden="true"
              className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-white font-serif text-[15px] font-bold text-primary"
            >
              W+
            </span>
            {labels.launcher}
          </button>
        </Dialog.Trigger>
      </div>
```

`<Dialog.Portal>` and everything after it are unchanged, remaining a direct sibling of the new `<div>` under `<Dialog.Root>` (Radix only requires `Dialog.Trigger`/`Dialog.Portal` to be descendants, not direct children).

- [ ] **Step 4: Run the tests and confirm they pass, with no regression in the widget's other suites**

Run: `npx vitest run tests/unit/concierge-widget.test.tsx tests/unit/concierge-shell.test.tsx tests/unit/contact-concierge-launcher.test.tsx`
Expected: PASS — `concierge-shell.test.tsx`'s `expect(launcher).toHaveClass("concierge-trigger", "touch-manipulation")` still passes because both classes stay on the button; `contact-concierge-launcher.test.tsx`'s source-pattern checks are unaffected by the JSX restructuring.

- [ ] **Step 5: Commit**

```bash
git add components/ai/concierge-widget.tsx tests/unit/concierge-widget.test.tsx
git commit -m "$(cat <<'EOF'
feat: wrap the concierge launcher in the donor .concierge positioning wrapper

Decision 5 of the WP-4 design: the launcher's own Tailwind fixed offset
made the donor's .concierge rules (wisetech.css:286,419,445,449,860) inert
since nothing carried that class. The fixed/offset/z-40 utilities move from
the button onto a new wrapper div so the donor's event-action-bar lifts and
narrow-viewport hide can actually reposition the whole launcher; the button
keeps the same utilities' remaining visual classes plus its portal-fallback
role, unchanged in the portal layout.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `EventCard` component — donor `.event-library` card grammar

**Files:**
- Create: `components/marketing/event-card.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/event-card.test.tsx`

Location matches this codebase's existing convention: `EventDetail` (the other event-specific presentational component) already lives at `components/marketing/event-detail.tsx`, so `EventCard` is its sibling.

`PublicEventProjection` (`lib/events/public.ts`) and `listPublicEvents`/`getPublicEventBySlug` (`lib/db/repos/events.ts`) were read in full: the real projected fields are `id, slug, title, description, startsAt, endsAt, venue, capacity, hero`. **There is no `format` field anywhere** — not on the Drizzle `events` table columns used by `projectPublicEvent`, not on `PublicEventProjection`. The design spec's "format badge" (online/in-person) has no honest data behind it in this codebase, so this card does not fabricate one — it surfaces the two real optional facts the repository actually projects (venue, capacity) instead, alongside the real status pill and `<time>`.

- [ ] **Step 1: Write the failing test**

`tests/unit/event-card.test.tsx`

```tsx
import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import {EventCard} from "@/components/marketing/event-card";

const labels = {status: {open: "Open", past: "Past"}, venueLabel: "Venue", capacityLabel: "Capacity", cta: "View event"};

describe("EventCard", () => {
  it("renders the open-status pill, date block, venue, capacity and two links for an open event", () => {
    render(
      <EventCard
        event={{id: "1", slug: "ai-clinic", title: "AI Clinic", description: "A hands-on clinic.", startsAt: "2030-10-24T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null}}
        status="open"
        locale="en"
        labels={labels}
      />,
    );

    const card = screen.getByRole("heading", {level: 3, name: "AI Clinic"}).closest("article")!;
    expect(card).toHaveClass("event-card-v2");
    expect(within(card).getByText("Open")).toHaveClass("event-status");
    expect(within(card).getByText("Open")).not.toHaveClass("completed");
    expect(within(card).getByText("Kwun Tong")).toBeInTheDocument();
    expect(within(card).getByText("40")).toBeInTheDocument();
    expect(within(card).getAllByRole("link")).toHaveLength(2);
    expect(within(card).getByRole("link", {name: "AI Clinic"})).toHaveAttribute("href", "/events/ai-clinic");
    expect(within(card).getByRole("link", {name: "View event"})).toHaveAttribute("href", "/events/ai-clinic");
  });

  it("renders the past-status pill and omits venue/capacity facts that are null, keeping the description clamped", () => {
    const longDescription = "B".repeat(240);
    render(
      <EventCard
        event={{id: "2", slug: "demo-day", title: "Demo Day", description: longDescription, startsAt: "2020-01-01T02:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null}}
        status="past"
        locale="en"
        labels={labels}
      />,
    );

    const pastPill = screen.getByText("Past");
    expect(pastPill).toHaveClass("event-status", "completed");
    expect(screen.queryByText("Venue")).not.toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.getByText(longDescription)).toHaveClass("line-clamp-3", "break-words");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/event-card.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/marketing/event-card`.

- [ ] **Step 3: Add the message keys**

Add these under the existing `Events` namespace in `messages/en.json` and `messages/zh-HK.json`:

| Key | EN | ZH |
|---|---|---|
| `Events.card.venueLabel` | Venue | 地點 |
| `Events.card.capacityLabel` | Capacity | 名額 |
| `Events.card.cta` | View event | 查看活動 |

- [ ] **Step 4: Implement `components/marketing/event-card.tsx`**

```tsx
import {ActionLink} from "@/components/wt/action-link";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import type {PublicEventProjection, PublicEventStatus} from "@/lib/events/public";
import {formatEventDate} from "@/lib/home/format-event-date";
import {cn} from "@/lib/utils";

export type EventCardLabels = Readonly<{
  status: Readonly<{open: string; past: string}>;
  venueLabel: string;
  capacityLabel: string;
  cta: string;
}>;

export type EventCardProps = Readonly<{
  event: PublicEventProjection;
  status: PublicEventStatus;
  locale: AppLocale;
  labels: EventCardLabels;
}>;

function dateBlockParts(value: string, locale: AppLocale): Readonly<{day: string; month: string}> {
  const parts = new Intl.DateTimeFormat(locale, {day: "numeric", month: "short", timeZone: "Asia/Hong_Kong"}).formatToParts(new Date(value));
  return {
    day: parts.find((part) => part.type === "day")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
  };
}

// Donor `.event-library` card grammar (app/styles/wisetech.css:559 `.event-card-v2`, :561
// `.event-date-block`, :563 `.event-card-body`, :566 `.event-status`). No `format` field exists on
// `PublicEventProjection` (confirmed against lib/db/repos/events.ts's `projectPublicEvent`) --
// the donor's "format badge" (online/in-person) has no honest data behind it here, so this card
// surfaces the two real optional facts the repository actually projects (venue, capacity)
// instead of fabricating one. `formatEventDate` is the same Asia/Hong_Kong helper already shared
// by components/home/open-now.tsx and components/home/events-journey.tsx.
export function EventCard({event, status, locale, labels}: EventCardProps) {
  const {day, month} = dateBlockParts(event.startsAt, locale);
  const fullDate = formatEventDate(event.startsAt, locale);

  return (
    <article className="event-card-v2">
      <div className="event-date-block">
        <time aria-label={fullDate} dateTime={event.startsAt}>{day}</time>
        <span>{month}</span>
      </div>
      <div className="event-card-body">
        <span className={cn("event-status", status === "past" && "completed")}>{labels.status[status]}</span>
        <h3><Link href={`/events/${event.slug}`}>{event.title}</Link></h3>
        <p className="line-clamp-3 break-words">{event.description}</p>
        <dl>
          {event.venue ? <div><dt>{labels.venueLabel}</dt><dd>{event.venue}</dd></div> : null}
          {event.capacity !== null ? <div><dt>{labels.capacityLabel}</dt><dd>{event.capacity}</dd></div> : null}
        </dl>
        <div className="event-card-actions">
          <ActionLink href={`/events/${event.slug}`} variant="text-link">{labels.cta}</ActionLink>
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/event-card.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/marketing/event-card.tsx messages/en.json messages/zh-HK.json tests/unit/event-card.test.tsx
git commit -m "$(cat <<'EOF'
feat: add EventCard with the donor event-library card grammar

New components/marketing/event-card.tsx renders the donor's .event-card-v2/
.event-date-block/.event-status/.event-card-body grammar over the real
PublicEventProjection shape. No `format` field exists anywhere in the data
model (confirmed against lib/db/repos/events.ts), so this surfaces venue and
capacity -- the two real optional facts -- rather than fabricating a
format badge.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `/events` page rewrite — hero, quick tabs, activity strip, EventCard grid, recommendations, interest and closing bands

**Files:**
- Modify: `app/[locale]/(public)/events/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Modify: `tests/unit/event-public-page.test.tsx` (two markup assertions tied to the retired two-link nav and `glass-card` grid; every business-logic assertion is preserved)
- Test (new): `tests/unit/wt-pages/events-page.test.tsx`

Confirmed by reading `components/wt/interest-band.tsx`, `closing-band.tsx`, `honest-empty.tsx`, `section.tsx`, `action-link.tsx`: `InterestBand`/`ClosingBand`/`HonestEmpty` already exist with exactly the prop shapes this page needs (they are currently unused anywhere in the codebase — this page is their first real consumer) — reused as-is, nothing hand-rolled. `CardGrid`'s three variants (`service`/`principle`/`badge`) don't match the donor's `.inner-card-grid`/`.inner-card` recommendation-row grammar, and no existing component wraps those classes either (grepped `components/` — no hits), so the recommendations row is built directly in the page, the same way `components/home/pathways.tsx` hand-rolls `.audience-grid` when `CardGrid` doesn't fit.

Grepped `app/styles/wisetech.css` and confirmed every class used below is real and already ported: `.event-quick-tabs` (814-816, targets `button` elements specifically, not `a`), `.activity-type-strip` (351-352), `.event-results-head` (359-361), `.event-library` (366), `.inner-card-grid`/`.inner-card`/`.inner-card-index` (335-341).

Because `.event-quick-tabs button` styles real `<button>` elements (not anchors), and because this page must keep working with zero client JS (`app/[locale]/(public)/events/page.tsx` is `force-dynamic`, no client state), the quick tabs are one `<form method="get">` with two `<button type="submit" name="status" value="...">` — the same real no-JS GET-navigation idiom `components/marketing/showcase-filters.tsx` already uses, giving genuine `<button>` elements styled by the donor CSS instead of anchors wearing `aria-current`.

The hero image reuses `/images/projects-hero.jpg`, the same own-origin placeholder `components/home/hero.tsx` uses "until WP-5" — no `/editorial/events-community.webp` asset exists in `public/` today (confirmed: `find public -iname '*.webp'` finds nothing), so this follows the same documented placeholder convention rather than referencing a file that doesn't exist.

- [ ] **Step 1: Write the failing test**

`tests/unit/wt-pages/events-page.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
} as const;

function messageAt(namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles.en);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublic = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listPublic}}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) => (key: string) => String(messageAt(namespace, key))),
  setRequestLocale: () => undefined,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import EventsPage from "@/app/[locale]/(public)/events/page";

async function renderEventsPage(): Promise<void> {
  render(await EventsPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})}));
}

describe("Events page donor markup", () => {
  it("renders the hero, activity strip, an EventCard grid and the recommendations/interest/closing bands", async () => {
    listPublic.mockResolvedValueOnce([
      {id: "1", slug: "ai-clinic", title: "AI Clinic", description: "d", startsAt: "2030-10-24T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null},
    ]);
    await renderEventsPage();

    expect(screen.getByRole("heading", {level: 1, name: bundles.en.Events.title})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Common.breadcrumbHome})).toHaveAttribute("href", "/");

    const strip = screen.getByRole("navigation", {name: bundles.en.Events.activityStrip.label});
    expect(within(strip).getByRole("link", {name: bundles.en.Events.activityStrip.launchpadLabel})).toHaveAttribute("href", "/launchpad");
    expect(within(strip).getByRole("link", {name: bundles.en.Events.activityStrip.showcaseLabel})).toHaveAttribute("href", "/showcase");
    expect(within(strip).getByRole("link", {name: bundles.en.Events.activityStrip.openLabel})).toHaveAttribute("href", "/events?status=open");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("heading", {level: 3, name: "AI Clinic"}).closest("article")).toHaveClass("event-card-v2");

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.recommendations.items.launchpad.title}).closest("a")).toHaveAttribute("href", "/launchpad");
    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.recommendations.items.showcase.title}).closest("a")).toHaveAttribute("href", "/showcase");
    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.recommendations.items.membership.title}).closest("a")).toHaveAttribute("href", "/membership");

    expect(screen.getByRole("link", {name: bundles.en.Events.interest.action})).toHaveAttribute("href", "/events?status=open");
    expect(screen.getByRole("link", {name: bundles.en.Events.closing.actions.primary})).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", {name: bundles.en.Events.closing.actions.secondary})).toHaveAttribute("href", "/membership");
  });

  it("renders the honest-empty state with a contact action when no open event exists", async () => {
    listPublic.mockResolvedValueOnce([]);
    await renderEventsPage();

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.empty.open.title})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Events.empty.action})).toHaveAttribute("href", "/contact");
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/events-page.test.tsx`
Expected: FAIL — `bundles.en.Common.breadcrumbHome` is `undefined` (this is the first task in this plan's final task order to need it) and the rendered markup doesn't match (old page has no activity strip, no EventCard grid, no bands).

- [ ] **Step 3: Add the message keys**

`Common.breadcrumbHome` is a shared, cross-page key (every WP-4 group's `PageHero` breadcrumb needs it) — introduced here since this is the first task in final task order to call `PageHero` with a breadcrumb; add it once to `Common` rather than duplicating a page-scoped copy.

Add these to `messages/en.json` and `messages/zh-HK.json`:

| Key | EN | ZH |
|---|---|---|
| `Common.breadcrumbHome` | Home | 主頁 |

Add these under the existing `Events` namespace:

| Key | EN | ZH |
|---|---|---|
| `Events.heroImageAlt` | Members networking at a WTIA event | WTIA 活動中的會員交流情況 |
| `Events.breadcrumbCurrent` | Events | 活動 |
| `Events.resultsHeading` | Event results | 活動列表 |
| `Events.quickTabs.label` | Filter events by status | 按狀態篩選活動 |
| `Events.quickTabs.open` | Open now | 現正開放 |
| `Events.quickTabs.past` | Past events | 已結束活動 |
| `Events.activityStrip.label` | Related activities | 相關活動 |
| `Events.activityStrip.openLabel` | Open events | 開放活動 |
| `Events.activityStrip.launchpadLabel` | Launch Pad | 創科加速平台 |
| `Events.activityStrip.showcaseLabel` | Showcase | 方案展示 |
| `Events.resultsHead.label` | `{count, plural, one {event found} other {events found}}` | `{count, plural, other {個活動}}` |
| `Events.empty.action` | Contact the team | 聯絡團隊 |
| `Events.recommendations.items.launchpad.title` | Launch Pad | 創科加速平台 |
| `Events.recommendations.items.launchpad.copy` | GBA market entry, soft landing and buyer matching for founders. | 為初創企業提供大灣區市場進入、落地支援及買家配對。 |
| `Events.recommendations.items.launchpad.cta` | Explore Launch Pad | 探索創科加速平台 |
| `Events.recommendations.items.showcase.title` | Showcase | 方案展示 |
| `Events.recommendations.items.showcase.copy` | Browse verified member solutions and request an introduction. | 瀏覽已驗證會員方案，並提出洽談請求。 |
| `Events.recommendations.items.showcase.cta` | Browse the showcase | 瀏覽方案展示 |
| `Events.recommendations.items.membership.title` | Membership | 會籍 |
| `Events.recommendations.items.membership.copy` | Find the pathway that matches your organisation. | 尋找切合貴機構的會籍路徑。 |
| `Events.recommendations.items.membership.cta` | Compare plans | 比較會籍方案 |
| `Events.interest.eyebrow` | Keep in touch | 保持聯繫 |
| `Events.interest.title` | Never miss an open activity | 緊貼公開活動資訊 |
| `Events.interest.copy` | Register for activity updates and we will let you know as soon as a new session opens. | 登記接收活動通知，一有新場次開放，我們將盡快通知你。 |
| `Events.interest.action` | Get activity updates | 接收活動通知 |
| `Events.closing.eyebrow` | Partner with us | 與我們合作 |
| `Events.closing.title` | Host or partner on a future event | 有意主辦或合辦未來活動？ |
| `Events.closing.copy` | Bring a venue, a topic or a co-hosting proposal and the team will help shape it into a session. | 歡迎提供場地、主題或合辦建議，團隊將協助構思成實際活動。 |
| `Events.closing.actions.primary` | Contact the team | 聯絡團隊 |
| `Events.closing.actions.secondary` | Explore membership | 探索會籍 |

- [ ] **Step 4: Rewrite `app/[locale]/(public)/events/page.tsx`**

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventCard} from "@/components/marketing/event-card";
import {ActionLink} from "@/components/wt/action-link";
import {Arrow} from "@/components/wt/arrow";
import {ClosingBand} from "@/components/wt/closing-band";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {InterestBand} from "@/components/wt/interest-band";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository} from "@/lib/db/repos/events";
import {parsePublicEventStatus} from "@/lib/events/public";
import {buildPageMetadata} from "@/lib/metadata";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;
const anonymous = {kind: "anonymous", userId: null} as const;
// Group A / Decision (design spec §2): 3 static links, not the donor's unported `/activities/*`.
const RECOMMENDATIONS = [
  {key: "launchpad", href: "/launchpad"},
  {key: "showcase", href: "/showcase"},
  {key: "membership", href: "/membership"},
] as const;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Events"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/events", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function EventsPage({params, searchParams}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: "Events"}),
    getTranslations({locale, namespace: "Common"}),
  ]);
  const appLocale = locale as AppLocale;
  const status = parsePublicEventStatus(query.status);
  const asOf = new Date();
  const records = await eventsRepository.listPublic(anonymous, {status, asOf, locale}).catch(() => null);
  const cardLabels = {
    status: {open: t("status.open"), past: t("status.past")},
    venueLabel: t("card.venueLabel"),
    capacityLabel: t("card.capacityLabel"),
    cta: t("card.cta"),
  };

  return (
    <>
      <PageHero
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("breadcrumbCurrent")}}
        breadcrumbLabel={common("breadcrumbLabel")}
        eyebrow={t("eyebrow")}
        image={{src: "/images/projects-hero.jpg", alt: t("heroImageAlt")}}
        lead={t("description")}
        title={t("title")}
        variant="inner"
      />
      <Section id="events-results" labelledBy="events-results-title">
        <h2 className="sr-only" id="events-results-title">{t("resultsHeading")}</h2>
        {/* Real <button> elements (not styled anchors): app/styles/wisetech.css:815 targets
            `.event-quick-tabs button`, not `a`. Plain GET navigation, same idiom as
            components/marketing/showcase-filters.tsx -- no client state. */}
        <form action={localizedPath(appLocale, "/events")} aria-label={t("quickTabs.label")} className="event-quick-tabs" method="get">
          <button aria-pressed={status === "open"} className={status === "open" ? "active" : undefined} name="status" type="submit" value="open">{t("quickTabs.open")}</button>
          <button aria-pressed={status === "past"} className={status === "past" ? "active" : undefined} name="status" type="submit" value="past">{t("quickTabs.past")}</button>
        </form>
        <nav aria-label={t("activityStrip.label")} className="activity-type-strip">
          <Link href="/events?status=open">{t("activityStrip.openLabel")}</Link>
          <Link href="/launchpad">{t("activityStrip.launchpadLabel")}</Link>
          <Link href="/showcase">{t("activityStrip.showcaseLabel")}</Link>
        </nav>
        {records === null ? (
          <HonestEmpty copy={t("unavailableDescription")} label={t("statusLabel")} title={t("unavailableTitle")} variant="light" />
        ) : (
          <>
            <div className="event-results-head" role="status">
              <p><strong>{records.length}</strong>{t("resultsHead.label", {count: records.length})}</p>
            </div>
            {records.length > 0 ? (
              <div className="event-library">
                {records.map((event) => (
                  <EventCard event={event} key={event.id} labels={cardLabels} locale={appLocale} status={status} />
                ))}
              </div>
            ) : (
              <HonestEmpty
                actions={[{label: t("empty.action"), href: "/contact"}]}
                copy={t(`empty.${status}.description`)}
                label={t("statusLabel")}
                title={t(`empty.${status}.title`)}
                variant="light"
              />
            )}
          </>
        )}
        <div className="inner-card-grid">
          {RECOMMENDATIONS.map((item, index) => (
            <Link className="inner-card" href={item.href} key={item.key}>
              <span className="inner-card-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{t(`recommendations.items.${item.key}.title`)}</h3>
              <p>{t(`recommendations.items.${item.key}.copy`)}</p>
              <b>{t(`recommendations.items.${item.key}.cta`)} <Arrow /></b>
            </Link>
          ))}
        </div>
      </Section>
      <InterestBand
        action={<ActionLink href="/events?status=open" variant="button-light">{t("interest.action")}</ActionLink>}
        copy={t("interest.copy")}
        eyebrow={t("interest.eyebrow")}
        id="events-interest"
        title={t("interest.title")}
      />
      <ClosingBand
        actions={[{label: t("closing.actions.primary"), href: "/contact"}, {label: t("closing.actions.secondary"), href: "/membership"}]}
        copy={t("closing.copy")}
        eyebrow={t("closing.eyebrow")}
        id="events-closing"
        title={t("closing.title")}
      />
    </>
  );
}
```

- [ ] **Step 5: Update the two markup assertions in `tests/unit/event-public-page.test.tsx` that pinned the retired two-link nav**

The quick tabs are now real `<button>` elements in a GET form (Step 4's donor-fidelity requirement), not `<a aria-current="page">` — so `aria-current="page"` no longer appears, and there is no longer an anchor with `href="/events?status=past"` (only the activity strip's `href="/events?status=open"` anchor survives, and it still does). Every other assertion in this file — the repository call arguments, the malformed-status fallback, the unavailable state, and the `line-clamp-3 break-words` clamp on card descriptions — is unaffected by the restyle and needs no change. Replace the whole file with:

```tsx
import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const events = vi.hoisted(() => ({listPublic: vi.fn()}));

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import EventsPage from "@/app/[locale]/(public)/events/page";

const anonymous = {kind: "anonymous", userId: null} as const;

async function renderEventsPage(status: string | readonly string[] | undefined): Promise<string> {
  return renderToStaticMarkup(await EventsPage({
    params: Promise.resolve({locale: "en"}),
    searchParams: Promise.resolve({status: status === undefined || typeof status === "string" ? status : Array.from(status)}),
  }));
}

describe("public Event status controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events.listPublic.mockResolvedValue([]);
  });

  it("drives the public reader and selected control from one scalar status", async () => {
    const rendered = await renderEventsPage("past");

    expect(events.listPublic).toHaveBeenCalledWith(
      anonymous,
      expect.objectContaining({status: "past", asOf: expect.any(Date)}),
    );
    // The quick tabs are real <button> elements in a GET form (donor `.event-quick-tabs button`
    // grammar, app/styles/wisetech.css:815), not styled anchors -- so the selected control is
    // `aria-pressed`, and the status value travels as a form field, not a second href.
    expect(rendered).toContain('aria-pressed="true"');
    expect(rendered).toContain('name="status" value="open"');
    expect(rendered).toContain('name="status" value="past"');
    // The activity strip still links straight to the open filter.
    expect(rendered).toContain('href="/events?status=open"');
  });

  it.each([undefined, "", "future", ["past", "open"]] as const)("uses open for malformed status %o", async (status) => {
    await renderEventsPage(status);

    expect(events.listPublic).toHaveBeenCalledWith(
      anonymous,
      expect.objectContaining({status: "open", asOf: expect.any(Date)}),
    );
  });

  it("renders an unavailable state when the repository read fails", async () => {
    events.listPublic.mockRejectedValue(new Error("database private payload"));

    await expect(renderEventsPage(undefined)).resolves.toContain("unavailableTitle");
  });

  it("clamps list-card descriptions, breaks long tokens, and preserves the meaningful text", async () => {
    const longDescription = "A".repeat(240);
    events.listPublic.mockResolvedValue([{
      id: "10000000-0000-4000-8000-000000000001",
      slug: "long-description",
      title: "Long description Event",
      description: longDescription,
      startsAt: "2030-01-01T10:00:00.000Z",
      endsAt: null,
      venue: "Hong Kong",
      capacity: null,
      hero: null,
    }]);

    const rendered = await renderEventsPage("open");

    expect(rendered).toContain(`class="line-clamp-3 break-words">${longDescription}</p>`);
  });
});
```

- [ ] **Step 6: Run both tests and confirm they pass**

Run: `npx vitest run tests/unit/event-public-page.test.tsx tests/unit/wt-pages/events-page.test.tsx`
Expected: PASS

- [ ] **Step 7: Confirm the pinned business-logic detail-page suites still pass unmodified**

Run: `npx vitest run tests/unit/event-public-detail-review.test.tsx tests/unit/event-private-media-render.test.tsx tests/unit/event-detail-seo.test.ts`
Expected: PASS (unaffected — this task only touches the `/events` list page)

- [ ] **Step 8: Commit**

```bash
git add app/\[locale\]/\(public\)/events/page.tsx messages/en.json messages/zh-HK.json tests/unit/event-public-page.test.tsx tests/unit/wt-pages/events-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: restyle /events with the donor inner-page grammar

PageHero (variant inner, breadcrumb) replaces the old marketing PageHero.
The two-link Open/Past nav becomes a real <button> GET form
(.event-quick-tabs, no client state) plus a static .activity-type-strip.
.event-results-head is a role=status live count; the old glass-card grid
is replaced by EventCard inside .event-library. Adds a recommendations row
(.inner-card-grid), and reuses the already-built, previously-unconsumed
InterestBand/ClosingBand primitives for the interest and "host or partner"
closing sections. tests/unit/event-public-page.test.tsx keeps every
business-logic assertion; only the two markup assertions tied to the
retired nav are updated.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Event view switch — `EventCard` grid ↔ day-grouped list, `?view=calendar`

**Files:**
- Create: `components/marketing/event-view-switch.tsx`
- Create: `components/marketing/event-calendar-view.tsx`
- Modify: `app/[locale]/(public)/events/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Modify: `tests/unit/wt-pages/events-page.test.tsx`
- Test (new): `tests/unit/event-view-switch.test.tsx`, `tests/unit/event-calendar-view.test.tsx`

`components/home/market-products.tsx` and `components/home/open-now.tsx` were read in full: neither actually uses `router.replace` or any query-state hook — both are plain server components. The real established idiom for a `router.replace`-driven query toggle in this codebase is `components/layout/locale-switcher.tsx`: a `'use client'` component using `usePathname`/`useRouter` from `@/i18n/navigation` plus `useSearchParams` from `next/navigation`, wrapped in `Suspense`, calling `router.replace` with the existing query string preserved. `EventViewSwitch` follows that exact shape.

Grepped `app/styles/wisetech.css` for a day-group-header class (`day-group`, `date-group`, `calendar-day`, `calendar-group`) — none exists. `.event-calendar-view>a` (358-364) already renders one event's own large `<time>` per row; it has no bespoke sub-class for grouping rows under a shared day heading. Per the design spec's own restraint principle (Group C's compass-grid precedent), rather than inventing a new donor-styled class, each day heading reuses the already-ported, generic `.status-label` class.

- [ ] **Step 1: Write the failing tests**

`tests/unit/event-view-switch.test.tsx`

```tsx
import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const {pathState, routerReplace, searchState} = vi.hoisted(() => ({
  pathState: {current: "/events"},
  routerReplace: vi.fn(),
  searchState: {current: new URLSearchParams()},
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathState.current,
  useRouter: () => ({replace: routerReplace}),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchState.current,
}));

import {EventViewSwitch} from "@/components/marketing/event-view-switch";

const labels = {label: "Switch how events are displayed", cards: "Cards", calendar: "By date"};

describe("EventViewSwitch", () => {
  beforeEach(() => {
    pathState.current = "/events";
    routerReplace.mockReset();
    searchState.current = new URLSearchParams();
  });

  it("marks Cards as pressed and Calendar as not pressed when ?view is absent", () => {
    render(<EventViewSwitch labels={labels} />);

    expect(screen.getByRole("button", {name: "Cards"})).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", {name: "By date"})).toHaveAttribute("aria-pressed", "false");
  });

  it("marks Calendar as pressed when ?view=calendar", () => {
    searchState.current = new URLSearchParams("view=calendar");
    render(<EventViewSwitch labels={labels} />);

    expect(screen.getByRole("button", {name: "By date"})).toHaveAttribute("aria-pressed", "true");
  });

  it("adds view=calendar while preserving the existing status param", () => {
    searchState.current = new URLSearchParams("status=past");
    render(<EventViewSwitch labels={labels} />);

    fireEvent.click(screen.getByRole("button", {name: "By date"}));

    expect(routerReplace).toHaveBeenCalledWith("/events?status=past&view=calendar");
  });

  it("removes the view param when switching back to Cards", () => {
    searchState.current = new URLSearchParams("status=past&view=calendar");
    render(<EventViewSwitch labels={labels} />);

    fireEvent.click(screen.getByRole("button", {name: "Cards"}));

    expect(routerReplace).toHaveBeenCalledWith("/events?status=past");
  });
});
```

`tests/unit/event-calendar-view.test.tsx`

```tsx
import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import {EventCalendarView} from "@/components/marketing/event-calendar-view";

const events = [
  {id: "1", slug: "morning-clinic", title: "Morning Clinic", description: "d1", startsAt: "2030-10-24T01:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: null, hero: null},
  {id: "2", slug: "afternoon-demo", title: "Afternoon Demo", description: "d2", startsAt: "2030-10-24T08:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null},
  {id: "3", slug: "next-day-talk", title: "Next Day Talk", description: "d3", startsAt: "2030-10-25T01:00:00.000Z", endsAt: null, venue: "Central", capacity: 20, hero: null},
];

describe("EventCalendarView", () => {
  it("groups events under one day header per Hong Kong calendar day, in chronological order", () => {
    render(<EventCalendarView events={events} locale="en" />);

    const dayGroups = document.querySelectorAll(".event-calendar-view");
    expect(dayGroups).toHaveLength(2);
    expect(within(dayGroups[0] as HTMLElement).getByRole("link", {name: /Morning Clinic/})).toHaveAttribute("href", "/events/morning-clinic");
    expect(within(dayGroups[0] as HTMLElement).getByRole("link", {name: /Afternoon Demo/})).toHaveAttribute("href", "/events/afternoon-demo");
    expect(within(dayGroups[1] as HTMLElement).getByRole("link", {name: /Next Day Talk/})).toHaveAttribute("href", "/events/next-day-talk");
  });

  it("omits the venue span when an event has no venue", () => {
    render(<EventCalendarView events={[events[1]]} locale="en" />);

    expect(screen.queryByText("Kwun Tong")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run both new tests and confirm they fail**

Run: `npx vitest run tests/unit/event-view-switch.test.tsx tests/unit/event-calendar-view.test.tsx`
Expected: FAIL with module-not-found errors for both new components.

- [ ] **Step 3: Add the message keys**

Add these under the existing `Events` namespace in `messages/en.json` and `messages/zh-HK.json`:

| Key | EN | ZH |
|---|---|---|
| `Events.viewSwitch.label` | Switch how events are displayed | 切換活動顯示方式 |
| `Events.viewSwitch.cards` | Cards | 卡片 |
| `Events.viewSwitch.calendar` | By date | 按日期 |

- [ ] **Step 4: Implement `components/marketing/event-view-switch.tsx`**

```tsx
"use client";

import {useSearchParams} from "next/navigation";
import {Suspense} from "react";

import {usePathname, useRouter} from "@/i18n/navigation";

export type EventViewMode = "cards" | "calendar";

type EventViewSwitchLabels = Readonly<{label: string; cards: string; calendar: string}>;

// Donor `.event-view-switch` (app/styles/wisetech.css:362-365). Same client-island idiom as
// components/layout/locale-switcher.tsx: useSearchParams needs a Suspense boundary, so the
// interactive read lives in a nested component with a static (non-interactive) fallback.
export function EventViewSwitch({labels}: Readonly<{labels: EventViewSwitchLabels}>) {
  return (
    <Suspense fallback={<EventViewSwitchButtons active="cards" labels={labels} />}>
      <EventViewSwitchContent labels={labels} />
    </Suspense>
  );
}

function EventViewSwitchContent({labels}: Readonly<{labels: EventViewSwitchLabels}>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const active: EventViewMode = searchParams.get("view") === "calendar" ? "calendar" : "cards";

  function select(mode: EventViewMode) {
    const next = new URLSearchParams(searchParams.toString());
    if (mode === "cards") next.delete("view");
    else next.set("view", "calendar");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`);
  }

  return <EventViewSwitchButtons active={active} labels={labels} onSelect={select} />;
}

function EventViewSwitchButtons({active, labels, onSelect}: Readonly<{active: EventViewMode; labels: EventViewSwitchLabels; onSelect?: (mode: EventViewMode) => void}>) {
  return (
    <div aria-label={labels.label} className="event-view-switch" role="group">
      <button aria-pressed={active === "cards"} className={active === "cards" ? "active" : undefined} onClick={() => onSelect?.("cards")} type="button">{labels.cards}</button>
      <button aria-pressed={active === "calendar"} className={active === "calendar" ? "active" : undefined} onClick={() => onSelect?.("calendar")} type="button">{labels.calendar}</button>
    </div>
  );
}
```

- [ ] **Step 5: Implement `components/marketing/event-calendar-view.tsx`**

```tsx
import {Arrow} from "@/components/wt/arrow";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import type {PublicEventProjection} from "@/lib/events/public";
import {formatEventDate} from "@/lib/home/format-event-date";

type EventDayGroup = Readonly<{key: string; heading: string; events: readonly PublicEventProjection[]}>;

// Hong Kong calendar day, not the UTC date -- consistent with this codebase's existing
// Asia/Hong_Kong convention everywhere else events are formatted (lib/home/format-event-date.ts).
function dayKey(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit"})
    .formatToParts(new Date(value))
    .map((part) => part.value)
    .join("");
}

function groupByDay(events: readonly PublicEventProjection[], locale: AppLocale): readonly EventDayGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, PublicEventProjection[]>();
  for (const event of events) {
    const key = dayKey(event.startsAt);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(event);
    else { byKey.set(key, [event]); order.push(key); }
  }
  return order.map((key) => ({key, heading: formatEventDate(byKey.get(key)![0].startsAt, locale), events: byKey.get(key)!}));
}

// Donor `.event-calendar-view` (app/styles/wisetech.css:358-364) has no distinct day-group-header
// class of its own -- confirmed via grep, no day-group/date-group/calendar-day/calendar-group
// selector exists anywhere in the ported stylesheet. Its `>a` row already carries one event's own
// large serif <time>; day-header grouping (design spec §2, restraint precedent from Group C's
// compass grids) reuses the existing, generic `.status-label` class rather than inventing one.
export function EventCalendarView({events, locale}: Readonly<{events: readonly PublicEventProjection[]; locale: AppLocale}>) {
  const groups = groupByDay(events, locale);
  return (
    <div>
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="status-label">{group.heading}</h3>
          <div className="event-calendar-view">
            {group.events.map((event) => (
              <Link href={`/events/${event.slug}`} key={event.id}>
                <time dateTime={event.startsAt}>{new Intl.DateTimeFormat(locale, {day: "numeric", timeZone: "Asia/Hong_Kong"}).format(new Date(event.startsAt))}</time>
                <div>
                  {event.venue ? <span>{event.venue}</span> : null}
                  <h3>{event.title}</h3>
                  <p>{event.description}</p>
                </div>
                <Arrow />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run the two new tests and confirm they pass**

Run: `npx vitest run tests/unit/event-view-switch.test.tsx tests/unit/event-calendar-view.test.tsx`
Expected: PASS

- [ ] **Step 7: Wire both into `app/[locale]/(public)/events/page.tsx`**

Apply this diff to the file from Task 4 (imports, `view` parsing, and the results block only — everything else is unchanged):

```tsx
// Add imports:
import {EventCalendarView} from "@/components/marketing/event-calendar-view";
import {EventViewSwitch} from "@/components/marketing/event-view-switch";

// Inside EventsPage, after `const status = ...`:
  const view = query.view === "calendar" ? "calendar" : "cards";

// Replace the results block (from `{records === null ? (` through its closing `)}`) with:
        {records === null ? (
          <HonestEmpty copy={t("unavailableDescription")} label={t("statusLabel")} title={t("unavailableTitle")} variant="light" />
        ) : (
          <>
            <div className="event-results-head" role="status">
              <p><strong>{records.length}</strong>{t("resultsHead.label", {count: records.length})}</p>
              {records.length > 0 ? (
                <EventViewSwitch labels={{label: t("viewSwitch.label"), cards: t("viewSwitch.cards"), calendar: t("viewSwitch.calendar")}} />
              ) : null}
            </div>
            {records.length > 0 ? (
              view === "calendar" ? (
                <EventCalendarView events={records} locale={appLocale} />
              ) : (
                <div className="event-library">
                  {records.map((event) => (
                    <EventCard event={event} key={event.id} labels={cardLabels} locale={appLocale} status={status} />
                  ))}
                </div>
              )
            ) : (
              <HonestEmpty
                actions={[{label: t("empty.action"), href: "/contact"}]}
                copy={t(`empty.${status}.description`)}
                label={t("statusLabel")}
                title={t(`empty.${status}.title`)}
                variant="light"
              />
            )}
          </>
        )}
```

The view switch only renders when there's at least one real result — toggling between two identical empty views has nothing to show, so it stays hidden rather than rendering a control with no effect.

- [ ] **Step 8: Extend `tests/unit/wt-pages/events-page.test.tsx` with the view-switch and calendar-view integration**

Replace the whole file with:

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
} as const;

function messageAt(namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles.en);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublic = vi.hoisted(() => vi.fn());
const searchState = vi.hoisted(() => ({current: new URLSearchParams()}));

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listPublic}}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) => (key: string) => String(messageAt(namespace, key))),
  setRequestLocale: () => undefined,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/events",
  useRouter: () => ({replace: vi.fn()}),
}));
vi.mock("next/navigation", () => ({useSearchParams: () => searchState.current}));

import EventsPage from "@/app/[locale]/(public)/events/page";

async function renderEventsPage(query: Record<string, string> = {}): Promise<void> {
  render(await EventsPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve(query)}));
}

describe("Events page donor markup", () => {
  beforeEach(() => { searchState.current = new URLSearchParams(); });

  it("renders the hero, activity strip, an EventCard grid and the recommendations/interest/closing bands", async () => {
    listPublic.mockResolvedValueOnce([
      {id: "1", slug: "ai-clinic", title: "AI Clinic", description: "d", startsAt: "2030-10-24T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null},
    ]);
    await renderEventsPage();

    expect(screen.getByRole("heading", {level: 1, name: bundles.en.Events.title})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Common.breadcrumbHome})).toHaveAttribute("href", "/");

    const strip = screen.getByRole("navigation", {name: bundles.en.Events.activityStrip.label});
    expect(within(strip).getByRole("link", {name: bundles.en.Events.activityStrip.launchpadLabel})).toHaveAttribute("href", "/launchpad");
    expect(within(strip).getByRole("link", {name: bundles.en.Events.activityStrip.showcaseLabel})).toHaveAttribute("href", "/showcase");
    expect(within(strip).getByRole("link", {name: bundles.en.Events.activityStrip.openLabel})).toHaveAttribute("href", "/events?status=open");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("heading", {level: 3, name: "AI Clinic"}).closest("article")).toHaveClass("event-card-v2");
    expect(screen.getByRole("button", {name: bundles.en.Events.viewSwitch.cards})).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.recommendations.items.launchpad.title}).closest("a")).toHaveAttribute("href", "/launchpad");
    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.recommendations.items.showcase.title}).closest("a")).toHaveAttribute("href", "/showcase");
    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.recommendations.items.membership.title}).closest("a")).toHaveAttribute("href", "/membership");

    expect(screen.getByRole("link", {name: bundles.en.Events.interest.action})).toHaveAttribute("href", "/events?status=open");
    expect(screen.getByRole("link", {name: bundles.en.Events.closing.actions.primary})).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", {name: bundles.en.Events.closing.actions.secondary})).toHaveAttribute("href", "/membership");
  });

  it("renders the honest-empty state with a contact action, and no view switch, when no open event exists", async () => {
    listPublic.mockResolvedValueOnce([]);
    await renderEventsPage();

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.empty.open.title})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Events.empty.action})).toHaveAttribute("href", "/contact");
    expect(screen.queryByRole("button", {name: bundles.en.Events.viewSwitch.cards})).not.toBeInTheDocument();
  });

  it("renders the day-grouped calendar view instead of the card grid when ?view=calendar", async () => {
    searchState.current = new URLSearchParams("view=calendar");
    listPublic.mockResolvedValueOnce([
      {id: "1", slug: "ai-clinic", title: "AI Clinic", description: "d", startsAt: "2030-10-24T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null},
    ]);
    await renderEventsPage({view: "calendar"});

    expect(document.querySelector(".event-library")).not.toBeInTheDocument();
    expect(document.querySelector(".event-calendar-view")).not.toBeNull();
    expect(screen.getByRole("button", {name: bundles.en.Events.viewSwitch.calendar})).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 9: Run the full events test slice and confirm everything passes**

Run: `npx vitest run tests/unit/event-view-switch.test.tsx tests/unit/event-calendar-view.test.tsx tests/unit/wt-pages/events-page.test.tsx tests/unit/event-public-page.test.tsx`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add components/marketing/event-view-switch.tsx components/marketing/event-calendar-view.tsx app/\[locale\]/\(public\)/events/page.tsx messages/en.json messages/zh-HK.json tests/unit/event-view-switch.test.tsx tests/unit/event-calendar-view.test.tsx tests/unit/wt-pages/events-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: add the /events cards-vs-calendar view switch

EventViewSwitch is a client island reading/writing ?view=calendar via
router.replace, the same Suspense-wrapped idiom as
components/layout/locale-switcher.tsx -- the existing status param is
preserved, nothing new is held in React state. EventCalendarView groups
the identical result set under Hong-Kong-calendar-day headers (no bespoke
donor class exists for that grouping, confirmed by grep, so headers reuse
the generic .status-label class). Scoped to day-header grouping per the
design spec, not a month-grid or date-picker widget.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `/events/[slug]` rewrite — donor hero, facts, main/aside layout, and action bar

**Files:**
- Modify: `app/[locale]/(public)/events/[slug]/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test (new): `tests/unit/wt-pages/event-detail-page.test.tsx`
- **Not modified, verified unaffected:** `components/marketing/event-detail.tsx`, `components/portal/event-registration-form.tsx`, `tests/unit/event-public-detail-review.test.tsx`, `tests/unit/event-private-media-render.test.tsx`, `tests/unit/event-detail-seo.test.ts`

**`EventDetail`/`StructuredData`/`buildEventData` logic is untouched — this task changes zero lines in `components/marketing/event-detail.tsx`, `components/seo/structured-data.tsx`, or `lib/structured-data.ts`.** `tests/unit/event-private-media-render.test.tsx` renders `EventDetail` in complete isolation and pins its exact `<Image unoptimized={...}>` behaviour; `tests/unit/event-public-detail-review.test.tsx` pins the registration-boundary/hero-security/structured-data contract through the page. Because `EventDetail` keeps rendering its own `<h1>{event.title}</h1>` exactly as it does today, the new `.event-detail-hero` wrapper does **not** duplicate the title — it wraps the unchanged `<EventDetail>` output, and the donor's `.event-detail-hero h1` rule (no child combinator, matches any descendant) still applies the clamped serif sizing to that same, single `<h1>`. One accepted, documented gap from this constraint: the donor's `.event-detail-hero>.shell>p` rule needs the lead paragraph to be a *direct* child of `.shell`, but `EventDetail`'s own description `<p>` sits inside its own `<header>`/`<article>`, so that specific color/max-width rule doesn't reach it — a smaller compromise than duplicating the h1, and the honest tradeoff of reusing the untouched component rather than editing it.

`app/styles/wisetech.css:565`'s `.event-detail-hero` rule sets `background-image: linear-gradient(...), var(--wt-event-photo)` unconditionally, with no fallback — an unset custom property makes the whole declaration invalid, so the section always needs `--wt-event-photo` set inline (confirmed by reading the port's own top-of-file note: "`--wt-event-photo` (set inline on the event hero)"). It's set from the event's own validated `displayEvent.hero.url` when present, falling back to the same `/images/projects-hero.jpg` placeholder Task 4 and `components/home/hero.tsx` already use.

The `.event-detail-layout` main/aside split and `.event-action-bar` are genuinely separate donor elements (confirmed via CSS: `.event-detail-aside` is `position: sticky` with plain `>a` links, while `.event-action-bar` is `position: fixed` at the viewport bottom — a distinct floating bar, which is exactly what wraps the registration CTA, and exactly why Decision 5's `.concierge` wrapper coordination in `app/styles/wisetech.css:419` (`.site-root:has(.event-action-bar) .concierge`) applies to this route). Since there is no other real per-event data for a supplementary sidebar, `.event-detail-aside` holds two honest, real navigational links rather than fabricated content, matching this design programme's own restraint precedent (Group C's compass-grid rule).

- [ ] **Step 1: Write the failing test**

`tests/unit/wt-pages/event-detail-page.test.tsx`

```tsx
import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const events = vi.hoisted(() => ({getPublicBySlug: vi.fn()}));

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: () => undefined}));
vi.mock("next/navigation", () => ({notFound: () => { throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("next/image", () => ({default: ({unoptimized, ...props}: {unoptimized?: boolean; [key: string]: unknown}) => <img {...props} data-unoptimized={String(unoptimized)} />}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/portal/event-registration-form", () => ({EventRegistrationForm: () => <div data-registration-form="true" />}));

import EventPage from "@/app/[locale]/(public)/events/[slug]/page";

const props = {params: Promise.resolve({locale: "en", slug: "public-event"})};
const event = (endsAt: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "10000000-0000-4000-8000-000000000001",
  slug: "public-event",
  title: "Public Event",
  description: "A public Event description.",
  startsAt: "2030-01-01T09:00:00.000Z",
  endsAt,
  venue: "Hong Kong",
  capacity: 20,
  hero: null,
  ...overrides,
});

describe("event detail page donor markup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the hero, facts grid, main/aside layout and a live action bar for an open event", async () => {
    events.getPublicBySlug.mockResolvedValue(event("2030-01-02T09:00:00.000Z"));

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).toContain('class="event-detail-hero"');
    expect(rendered).toMatch(/--wt-event-photo:\s*url\(\/images\/projects-hero\.jpg\)/);
    expect(rendered).toContain('class="event-detail-facts"');
    expect(rendered).toContain('class="event-detail-layout"');
    expect(rendered).toContain('class="event-detail-aside"');
    expect(rendered).toContain('class="event-action-bar"');
    expect(rendered).toContain('data-registration-form="true"');
    expect(rendered).not.toContain("pastEventLabel");
  });

  it("shows the past-event action bar instead of the registration form once the boundary has passed", async () => {
    events.getPublicBySlug.mockResolvedValue(event("2020-01-02T09:00:00.000Z"));

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).toContain("pastEventLabel");
    expect(rendered).not.toContain('data-registration-form="true"');
  });

  it("sets --wt-event-photo from the event's own validated hero image", async () => {
    const url = "/api/media/10000000-0000-4000-8000-000000000001";
    events.getPublicBySlug.mockResolvedValue(event("2030-01-02T09:00:00.000Z", {hero: {url, alt: "Hero"}}));

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).toMatch(new RegExp(`--wt-event-photo:\\s*url\\(${url.replace(/\//g, "\\/")}\\)`));
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/event-detail-page.test.tsx`
Expected: FAIL — none of the new donor classes exist in the current markup.

- [ ] **Step 3: Add the message keys**

Add these under the existing `Events` namespace in `messages/en.json` and `messages/zh-HK.json`:

| Key | EN | ZH |
|---|---|---|
| `Events.detail.eyebrow` | Event | 活動 |
| `Events.detail.factsTitle` | Practical information | 活動資訊 |
| `Events.detail.asideTitle` | Questions about this event? | 對此活動有疑問？ |
| `Events.detail.asideContact` | Contact the team | 聯絡團隊 |
| `Events.detail.asideBrowse` | Browse all events | 瀏覽所有活動 |
| `Events.detail.pastEventLabel` | Past event | 已結束活動 |
| `Events.detail.pastEventNotice` | Registration for this event has closed. Browse open activities instead. | 此活動已截止登記，請瀏覽其他開放活動。 |

- [ ] **Step 4: Rewrite `app/[locale]/(public)/events/[slug]/page.tsx`**

```tsx
import type {CSSProperties} from "react";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventDetail} from "@/components/marketing/event-detail";
import {EventRegistrationForm} from "@/components/portal/event-registration-form";
import {StructuredData} from "@/components/seo/structured-data";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository} from "@/lib/db/repos/events";
import {eventBoundary} from "@/lib/events/public";
import {formatEventDate} from "@/lib/home/format-event-date";
import {isPrivateMediaDeliveryUrl, isRegistrableMediaUrl} from "@/lib/media/url";
import {runPublicEventRegistrationAction} from "@/lib/events/registration-action";
import type {RegistrationActionState} from "@/lib/events/registration-state";
import {buildPageMetadata} from "@/lib/metadata";
import {buildEventData} from "@/lib/structured-data";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string; slug: string}>}>;
// Same own-origin placeholder components/home/hero.tsx uses "until WP-5" -- no donor
// /editorial event photo is ported into public/ yet.
const EVENT_HERO_PLACEHOLDER = "/images/projects-hero.jpg";

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const row = await eventsRepository.getPublicBySlug(slug, locale, {asOf: new Date()}).catch(() => null);
  if (!row) return {};
  return buildPageMetadata({locale: locale as AppLocale, pathname: `/events/${row.slug}`, title: row.title, description: row.description});
}

export default async function EventPage({params}: Props) {
  const {locale, slug} = await params;
  setRequestLocale(locale);
  const asOf = new Date();
  const [event, t] = await Promise.all([eventsRepository.getPublicBySlug(slug, locale, {asOf}).catch(() => null), getTranslations({locale, namespace: "Events"})]);
  if (!event) notFound();
  const displayEvent = event.hero && !(isPrivateMediaDeliveryUrl(event.hero.url) || isRegistrableMediaUrl(event.hero.url)) ? {...event, hero: null} : event;
  const appLocale = locale as AppLocale;
  const registrationMessages = {registered: t("registration.registered"), waitlist: t("registration.waitlist"), alreadyRegistered: t("registration.alreadyRegistered"), alreadyWaitlisted: t("registration.alreadyWaitlisted"), unauthenticated: t("registration.unauthenticated"), ineligible: t("registration.ineligible"), closed: t("registration.closed"), error: t("registration.error")};
  async function registerAction(state: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> { "use server"; return runPublicEventRegistrationAction(state, formData, {messages: registrationMessages}); }
  const past = eventBoundary({startsAt: new Date(displayEvent.startsAt), endsAt: displayEvent.endsAt ? new Date(displayEvent.endsAt) : null}) < asOf;
  const detailLabels = {date: t("detail.date"), venue: t("detail.venue"), capacity: t("detail.capacity")};
  // app/styles/wisetech.css:565's `.event-detail-hero` background-image reads var(--wt-event-photo)
  // with no fallback -- an unset custom property invalidates the whole declaration, so this is
  // always set: the event's own validated, already-filtered hero, or the placeholder above.
  const heroStyle = {"--wt-event-photo": `url(${displayEvent.hero?.url ?? EVENT_HERO_PLACEHOLDER})`} as CSSProperties;

  return (
    <>
      <StructuredData data={buildEventData({...displayEvent, image: displayEvent.hero?.url}, displayEvent.title, appLocale)} />
      <section className="event-detail-page">
        {/* EventDetail is rendered completely unchanged inside this wrapper: its own <h1> is
            the page's only title, styled by the donor's `.event-detail-hero h1` descendant rule
            without this file touching EventDetail's markup at all. */}
        <section className="event-detail-hero" style={heroStyle}>
          <div className="shell">
            <div className="event-detail-meta">
              <span>{t("detail.eyebrow")}</span>
              <span>{formatEventDate(displayEvent.startsAt, appLocale)}</span>
            </div>
            <EventDetail event={displayEvent} labels={detailLabels} locale={locale} />
          </div>
        </section>
        <div className="shell">
          <div className="event-detail-layout">
            <div className="event-detail-main">
              <section>
                <h2>{t("detail.factsTitle")}</h2>
                <div className="event-detail-facts">
                  <div><span>{detailLabels.date}</span><time dateTime={displayEvent.startsAt}>{formatEventDate(displayEvent.startsAt, appLocale)}</time></div>
                  {displayEvent.venue ? <div><span>{detailLabels.venue}</span><strong>{displayEvent.venue}</strong></div> : null}
                  {displayEvent.capacity !== null ? <div><span>{detailLabels.capacity}</span><strong>{displayEvent.capacity}</strong></div> : null}
                </div>
              </section>
            </div>
            <aside className="event-detail-aside">
              <h2>{t("detail.asideTitle")}</h2>
              <Link href="/contact">{t("detail.asideContact")}</Link>
              <Link href="/events">{t("detail.asideBrowse")}</Link>
            </aside>
          </div>
        </div>
        {!past ? (
          <div className="event-action-bar">
            <div>
              <time dateTime={displayEvent.startsAt}>{formatEventDate(displayEvent.startsAt, appLocale)}</time>
              <strong>{t("status.open")}</strong>
            </div>
            <div>
              <EventRegistrationForm action={registerAction} eventId={displayEvent.id} links={{ineligible: localizedPath(appLocale, "/membership"), unauthenticated: localizedPath(appLocale, "/join")}} messages={registrationMessages} pendingLabel={t("registration.pending")} registerLabel={t("registration.submit")} />
            </div>
          </div>
        ) : (
          <div className="event-action-bar">
            <div><strong>{t("detail.pastEventLabel")}</strong></div>
            <div><p>{t("detail.pastEventNotice")}</p></div>
          </div>
        )}
      </section>
    </>
  );
}
```

Note: this drops the old `<h2>{t("registration.title")}</h2>` heading that used to sit above the registration form — the donor `.event-action-bar` is a slim, compact floating bar (not a titled section), and the bar's own `<strong>{t("status.open")}</strong>` plus the form's own "Register" button already convey the context. This is a deliberate consequence of the container restyle, not an oversight.

- [ ] **Step 5: Run the new test and confirm it passes**

Run: `npx vitest run tests/unit/wt-pages/event-detail-page.test.tsx`
Expected: PASS

- [ ] **Step 6: Confirm every pinned business-logic test still passes completely unmodified**

Run: `npx vitest run tests/unit/event-public-detail-review.test.tsx tests/unit/event-private-media-render.test.tsx tests/unit/event-detail-seo.test.ts tests/unit/event-registration-form.test.tsx`
Expected: PASS with zero changes to any of these four files.

- [ ] **Step 7: Run the full events slice**

Run: `npx vitest run tests/unit/event-card.test.tsx tests/unit/event-view-switch.test.tsx tests/unit/event-calendar-view.test.tsx tests/unit/wt-pages/events-page.test.tsx tests/unit/wt-pages/event-detail-page.test.tsx tests/unit/event-public-page.test.tsx tests/unit/event-public-detail-review.test.tsx tests/unit/event-private-media-render.test.tsx tests/unit/event-detail-seo.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/\[locale\]/\(public\)/events/\[slug\]/page.tsx messages/en.json messages/zh-HK.json tests/unit/wt-pages/event-detail-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: restyle /events/[slug] with the donor detail-hero grammar

Adds .event-detail-hero (--wt-event-photo set from the event's own
validated hero, or the components/home/hero.tsx placeholder), a real
.event-detail-facts grid, an .event-detail-layout main/aside split, and
.event-action-bar wrapping the existing EventRegistrationForm for open
events (a static past-event notice otherwise). This route had no hero
component at all before this task. EventDetail/StructuredData/
buildEventData are completely untouched -- confirmed by every pinned
business-logic test (event-public-detail-review, event-private-media-
render, event-detail-seo, event-registration-form) passing with zero
file changes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `/showcase` rewrite — directory prompts, search, use-case chips, verification, pathways (E-29 fix)

**Files:**
- Create: `components/marketing/directory-prompts.tsx`
- Create: `components/marketing/solution-needs.tsx`
- Create: `components/marketing/solution-verification.tsx`
- Create: `components/marketing/solution-pathways.tsx`
- Modify: `components/marketing/showcase-filters.tsx`, `components/marketing/showcase-card.tsx`
- Modify: `app/[locale]/(public)/showcase/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Modify: `tests/unit/showcase-page-degrades.test.tsx`, `tests/unit/wisetech-pr5-showcase-presentation.test.tsx`, `tests/unit/m5-public-showcase.test.tsx` (harness-only — see Step 6)
- Test: `tests/unit/wt-pages/showcase-page.test.tsx`

**Investigation notes worth recording (they shaped every decision below):**
- `.first-90` does not exist in `app/styles/wisetech.css` (confirmed by `tests/unit/wisetech-css-port.test.ts`'s own comment) — not this task's page, but the same "no rule the donor doesn't have" logic applies here: every class used below (`.directory-prompts`, `.directory-search`, `.solution-needs`, `.solution-verification`, `.solution-pathways`, `.partner-record-card`, `.partner-status`, `.badge-grid`) is confirmed present in `app/styles/wisetech.css` by direct grep.
- No page in this codebase yet imports `components/wt/page-hero.tsx` or any `components/wt/*` primitive from a route file — this is the first. Every WT primitive that renders a `<Link>` uses `@/i18n/navigation`'s `Link` (built on `next-intl/navigation`'s `createNavigation`), which calls `getConfig()`/`getRequestLocale()` internally. Every existing unit test that exercises such a component (`tests/unit/wt-primitives.test.tsx`, `tests/unit/home-pathways.test.tsx`, `tests/unit/home-market-products.test.tsx`) explicitly does `vi.mock("@/i18n/navigation", ...)` first — there is no global mock in `tests/setup.ts`. The three existing pinned Showcase tests render the real page tree via `renderToStaticMarkup`/`render` without that mock, because the current page only uses plain `next/link` + `localizedPath`. Once `PageHero`/`ActionLink`/`HonestEmpty`/`InterestBand` land in the page, those three tests need the same mock added — a harness-only change, not a change to what they assert. Step 6 makes exactly that change, nothing else, to each file.
- `PublicMembershipTier`/`PLAN_CODES` are membership-only; not used here. `PublicListing`'s shape (from `lib/showcase/contracts.ts`) already has everything `ShowcaseCard` needs: `slug`, `premium`, `goneGlobal`, `memberSince`, `name`, `tagline`, `description`, `category`, `logo`.
- `showcaseRepository.listPublished(filters)` still degrades via `.catch(() => [])` exactly as today — that call is unchanged.

- [ ] **Step 1: Write the failing test**

`tests/unit/wt-pages/showcase-page.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const showcase = vi.hoisted(() => ({listPublished: vi.fn()}));

vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import ShowcasePage from "@/app/[locale]/(public)/showcase/page";

async function renderShowcase(searchParams: Record<string, string> = {}) {
  const html = renderToStaticMarkup(await ShowcasePage({
    params: Promise.resolve({locale: "en"}),
    searchParams: Promise.resolve(searchParams),
  }));
  return html;
}

describe("/showcase rewrite", () => {
  beforeEachReset();
  function beforeEachReset() {
    beforeEach(() => { showcase.listPublished.mockReset(); });
  }

  it("renders the six directory-prompt search shortcuts, each its own GET form to /showcase with only q set", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toContain('class="directory-prompts"');
    for (const query of ["AI concierge", "Cybersecurity", "Cross-border trade", "Cloud migration", "Generative AI", "Fintech"]) {
      expect(html).toContain(`<input type="hidden" name="q" value="${query}"/>`);
    }
    expect(html.match(/action="\/showcase"/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("gives the search input a real id so #q deep-links resolve (E-29)", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toMatch(/<label[^>]*for="q"[^>]*>/);
    expect(html).toContain('id="q"');
    expect(html).toContain('name="q"');
  });

  it("renders the twelve solution-needs chips, additive alongside the current q", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase({q: "trade"});

    expect(html).toContain('class="solution-needs"');
    expect(html).toContain('<input type="hidden" name="q" value="trade"/>');
    expect(html).toContain('name="useCase" value="cybersecurity"');
    expect((html.match(/name="useCase"/g) ?? []).length).toBe(12);
  });

  it("shows HonestEmpty, not a fabricated grid, at zero results", async () => {
    showcase.listPublished.mockResolvedValue([]);
    render(<ShowcaseListingsRegion/>);

    async function ShowcaseListingsRegion() {
      return await ShowcasePage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})});
    }

    expect(await screen.findByRole("status")).toHaveTextContent(bundles.en.Showcase.emptyTitle);
    expect(screen.queryByText("partner-record-grid")).not.toBeInTheDocument();
  });

  it("renders published listings inside .partner-record-grid using the restyled ShowcaseCard", async () => {
    showcase.listPublished.mockResolvedValue([{
      slug: "harbour-vision-ai", premium: true, goneGlobal: false, views: 1, memberSince: "2020-01-01",
      nameEn: "Harbour Vision AI", nameZhHk: "港灣視野 AI", taglineEn: "Trade intelligence", taglineZhHk: "貿易智能",
      descriptionEn: "Public description", descriptionZhHk: "公開描述", category: "software", useCases: ["logistics"],
      deploymentOptions: ["cloud"], supportedLanguages: ["en"], worksWith: ["ERP"], videoUrl: null, caseStudyUrl: null,
      caseStudySummaryEn: null, caseStudySummaryZhHk: null, logoReference: null,
    }]);
    const html = await renderShowcase();

    expect(html).toContain('class="partner-record-grid"');
    expect(html).toContain('class="partner-record-card"');
    expect(html).toContain("Harbour Vision AI");
    expect(html).toContain(bundles.en.Showcase.premium);
  });

  it("renders the solution-verification badge-definitions block with the honest label", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toContain('class="solution-verification"');
    expect(html).toContain(bundles.en.Showcase.verification.label);
    expect(html).toContain('class="badge-grid"');
    expect((html.match(/<article>/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("renders the buyer/provider solution-pathways with the correct destinations", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toContain('class="solution-pathways"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/portal/company/listing"');
    expect(html).toContain(bundles.en.Showcase.ownerCta);
  });

  it("renders the interest band pointing at /events", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toContain('class="event-interest"');
    expect(html).toContain(`href="/events"`);
    expect(html).toContain(bundles.en.Showcase.interest.action);
  });

  it("keeps bilingual parity for every new Showcase key", () => {
    for (const key of [
      "prompts.aiConcierge", "prompts.cybersecurity", "prompts.crossBorderTrade", "prompts.cloudMigration",
      "prompts.generativeAi", "prompts.fintech", "needs.customerService", "needs.cybersecurity", "needs.tradeCompliance",
      "needs.supplyChain", "needs.fintechPayments", "needs.dataAnalytics", "needs.hrTalent", "needs.marketingAutomation",
      "needs.legalCompliance", "needs.smartManufacturing", "needs.sustainabilityEsg", "needs.crossBorderTrade",
      "verification.label", "verification.title", "verification.copy",
      "verification.badges.verifiedDeployment.title", "verification.badges.verifiedDeployment.copy",
      "verification.badges.reviewedEvidence.title", "verification.badges.reviewedEvidence.copy",
      "verification.badges.dataHandling.title", "verification.badges.dataHandling.copy",
      "pathways.heading", "pathways.buyer.label", "pathways.buyer.title", "pathways.buyer.copy", "pathways.buyer.action",
      "pathways.provider.label", "pathways.provider.title", "pathways.provider.copy",
      "interest.eyebrow", "interest.title", "interest.copy", "interest.action",
    ]) {
      expect(messageAt("en", "Showcase", key), key).toBeTruthy();
      expect(messageAt("zh-HK", "Showcase", key), key).toBeTruthy();
    }
    expect(bundles.en.Common.breadcrumbHome).toBe("Home");
    expect(bundles["zh-HK"].Common.breadcrumbHome).toBe("主頁");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/showcase-page.test.tsx`
Expected: FAIL — module `tests/unit/wt-pages/showcase-page.test.tsx`'s target markup (`.directory-prompts`, `.solution-needs`, `.partner-record-grid`, `.solution-verification`, `.solution-pathways`, `.event-interest`, `id="q"`) does not exist in the current page; `Showcase.prompts`/`Showcase.needs`/`Showcase.verification`/`Showcase.pathways`/`Showcase.interest`/`Common.breadcrumbHome` are undefined.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Common.breadcrumbHome` | Home | 主頁 |
| `Showcase.prompts.aiConcierge` | AI concierge | AI 禮賓服務 |
| `Showcase.prompts.cybersecurity` | Cybersecurity | 網絡安全 |
| `Showcase.prompts.crossBorderTrade` | Cross-border trade | 跨境貿易 |
| `Showcase.prompts.cloudMigration` | Cloud migration | 雲端遷移 |
| `Showcase.prompts.generativeAi` | Generative AI | 生成式 AI |
| `Showcase.prompts.fintech` | Fintech | 金融科技 |
| `Showcase.needs.customerService` | Customer service | 客戶服務 |
| `Showcase.needs.cybersecurity` | Cybersecurity | 網絡安全 |
| `Showcase.needs.tradeCompliance` | Trade & customs compliance | 貿易及海關合規 |
| `Showcase.needs.supplyChain` | Supply chain visibility | 供應鏈可視化 |
| `Showcase.needs.fintechPayments` | Fintech & payments | 金融科技及支付 |
| `Showcase.needs.dataAnalytics` | Data & analytics | 數據分析 |
| `Showcase.needs.hrTalent` | HR & talent | 人力資源及人才 |
| `Showcase.needs.marketingAutomation` | Marketing automation | 市場推廣自動化 |
| `Showcase.needs.legalCompliance` | Legal & regulatory compliance | 法律及監管合規 |
| `Showcase.needs.smartManufacturing` | Smart manufacturing | 智能製造 |
| `Showcase.needs.sustainabilityEsg` | Sustainability & ESG | 可持續發展及 ESG |
| `Showcase.needs.crossBorderTrade` | Cross-border trade | 跨境貿易 |
| `Showcase.verification.label` | Proposed badge definitions — not currently awarded | 建議中的認證標誌定義－目前尚未頒發任何認證 |
| `Showcase.verification.title` | How WTIA plans to verify showcased solutions | WTIA 將如何驗證已展示的方案 |
| `Showcase.verification.copy` | WTIA is developing a verification framework for showcased solutions. The badges below describe what each one would confirm once the framework is in place — none has been awarded yet. | WTIA 正在制訂方案展示的驗證框架。以下標誌說明框架落實後各項認證所代表的意思－目前尚未有任何方案獲頒發認證。 |
| `Showcase.verification.badges.verifiedDeployment.title` | Verified deployment | 已核實部署 |
| `Showcase.verification.badges.verifiedDeployment.copy` | Would confirm the solution has at least one active, confirmed deployment with a WTIA member organisation. | 將核實方案已在至少一間 WTIA 會員機構完成並持續運作中的部署。 |
| `Showcase.verification.badges.reviewedEvidence.title` | Reviewed evidence | 已審閱證據 |
| `Showcase.verification.badges.reviewedEvidence.copy` | Would confirm a case study or outcome evidence has been reviewed by WTIA staff before publication. | 將核實案例研究或成效證據已由 WTIA 職員審閱後才對外發布。 |
| `Showcase.verification.badges.dataHandling.title` | Data handling disclosure | 數據處理披露 |
| `Showcase.verification.badges.dataHandling.copy` | Would confirm the provider has disclosed how customer and business data is stored, processed and secured. | 將核實供應商已披露客戶及業務數據的儲存、處理及保安方式。 |
| `Showcase.pathways.heading` | Two ways to engage the showcase | 兩種參與展示頁的方式 |
| `Showcase.pathways.buyer.label` | Looking for a solution | 尋找方案 |
| `Showcase.pathways.buyer.title` | Tell WTIA what you need. | 告訴 WTIA 你的需要。 |
| `Showcase.pathways.buyer.copy` | Describe the business problem you are solving and WTIA staff will help connect you to a fitting member solution. | 描述你要解決的業務問題，WTIA 職員將協助你聯繫合適的會員方案。 |
| `Showcase.pathways.buyer.action` | Talk to WTIA | 聯絡 WTIA |
| `Showcase.pathways.provider.label` | Have a solution to list | 有方案想登記 |
| `Showcase.pathways.provider.title` | Manage your own showcase listing. | 管理你自己的展示頁。 |
| `Showcase.pathways.provider.copy` | WTIA member companies can submit and manage their own listing directly. If you are not yet signed in, you will be asked to sign in first. | WTIA 會員公司可直接提交及管理自己的展示頁。如你尚未登入，系統將先要求你登入。 |
| `Showcase.interest.eyebrow` | Stay involved | 保持參與 |
| `Showcase.interest.title` | See these solutions in person. | 親身認識這些方案。 |
| `Showcase.interest.copy` | WTIA events regularly feature member solutions and the teams behind them. | WTIA 活動經常展示會員方案及其團隊。 |
| `Showcase.interest.action` | Browse events | 瀏覽活動 |

- [ ] **Step 4: Restyle `ShowcaseFilters` — E-29 fix**

`components/marketing/showcase-filters.tsx`

```tsx
import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {ShowcaseFilters as FilterValues} from "@/lib/showcase/contracts";
import {buildShowcaseQuery} from "@/lib/showcase/public";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{search: string; category: string; useCase: string; deployment: string; language: string; worksWith: string; submit: string; clear: string}>;

export function ShowcaseFilters({locale, filters, labels}: Readonly<{locale: AppLocale; filters: FilterValues; labels: Labels}>) {
  const clearHref = localizedPath(locale, "/showcase");
  const fields = [["category", labels.category], ["useCase", labels.useCase], ["deployment", labels.deployment], ["language", labels.language], ["worksWith", labels.worksWith]] as const;
  return (
    <form method="get">
      {/* E-29: the donor's `.directory-search` block is exactly a label + one input/button row.
          The search field gets a real id so `/showcase#q` (the homepage's Market Products panel,
          or anything else) can deep-link straight to it; before this fix the input had a `name`
          but no `id`, so a `#q` fragment resolved to nothing. */}
      <div className="directory-search">
        <label htmlFor="q">{labels.search}</label>
        <div>
          <input defaultValue={filters.q ?? ""} id="q" name="q" />
          <button type="submit">{labels.submit}</button>
        </div>
      </div>
      {/* The five facet fields and the clear link are not part of the donor's `.directory-search`
          content model (that block is only the search bar), so they sit in the real
          `.directory-actions` row instead of a class invented for this purpose. Labels stay
          visually hidden but explicitly associated, matching E-29's own fix. */}
      <div className="directory-actions">
        {fields.map(([name, label]) => (
          <span key={name}>
            <label className="sr-only" htmlFor={`showcase-${name}`}>{label}</label>
            <input defaultValue={filters[name] ?? ""} id={`showcase-${name}`} name={name} placeholder={label} />
          </span>
        ))}
        <Link className="text-link" href={clearHref}>{labels.clear}</Link>
      </div>
      <span className="sr-only">{buildShowcaseQuery(filters).toString()}</span>
    </form>
  );
}
```

- [ ] **Step 5: Restyle `ShowcaseCard`**

`components/marketing/showcase-card.tsx`

```tsx
import Image from "next/image";
import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";
import type {PublicListing} from "@/lib/showcase/contracts";
import {localizedPath} from "@/lib/urls";

// `category` is optional so the existing pinned test in tests/unit/m5-public-showcase.test.tsx,
// which supplies labels without it, keeps typechecking; the dt/dd row is simply omitted then.
type Labels = Readonly<{premium: string; goneGlobal: string; memberSince: string; category?: string; view: string}>;

export function ShowcaseCard({listing, locale, labels}: Readonly<{listing: PublicListing; locale: AppLocale; labels: Labels}>) {
  return <article className="partner-record-card">
    {listing.logo ? (
      <div className="partner-record-logo">
        <Image alt={listing.logo.alt} height={202} src={listing.logo.url} unoptimized={isPrivateMediaDeliveryUrl(listing.logo.url)} width={320} />
      </div>
    ) : null}
    <div className="partner-record-body">
      <div className="flex flex-wrap gap-2">
        {listing.premium ? <span className="partner-status">{labels.premium}</span> : null}
        {listing.goneGlobal ? <span className="partner-status">{labels.goneGlobal}</span> : null}
      </div>
      <h3>{listing.name}</h3>
      <p>{listing.tagline}</p>
      <dl>
        {labels.category ? <div><dt>{labels.category}</dt><dd>{listing.category}</dd></div> : null}
        <div><dt>{labels.memberSince}</dt><dd>{listing.memberSince}</dd></div>
      </dl>
    </div>
    <Link className="text-link" href={localizedPath(locale, `/showcase/${listing.slug}`)}>{labels.view}</Link>
  </article>;
}
```

- [ ] **Step 6: Update the three existing pinned Showcase tests — harness-only**

Add the same `@/i18n/navigation` mock every other WT-primitive test already carries (`tests/unit/wt-primitives.test.tsx`, `tests/unit/home-pathways.test.tsx`), so these tests keep exercising the real page tree without throwing once it depends on `PageHero`/`ActionLink`/`HonestEmpty`/`InterestBand`. No assertion in any of the three changes.

`tests/unit/showcase-page-degrades.test.tsx` — add after the existing `vi.mock("next-intl/server", ...)` block:

```tsx
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: React.ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
```

(Full file otherwise unchanged — insert this block directly below the existing `vi.mock("next-intl/server", ...)` call at line 14, and add `import type {ReactNode} from "react";` — use `ReactNode` instead of `React.ReactNode` since the file has no default `React` import, matching the convention already used in `tests/unit/home-market-products.test.tsx`.)

`tests/unit/wisetech-pr5-showcase-presentation.test.tsx` — add the identical mock directly below its existing `vi.mock("next-intl/server", ...)` at line 17, with the same `import type {ReactNode} from "react";` addition.

`tests/unit/m5-public-showcase.test.tsx` — this file renders `ShowcaseFilters`/`ShowcaseCard` directly (not the page), and neither now uses `@/i18n/navigation` (Step 4/5 keep plain `next/link` + `localizedPath` exactly as before) — **no change needed here**; listed above only because it was checked and confirmed unaffected.

- [ ] **Step 7: Implement the four new components**

`components/marketing/directory-prompts.tsx`

```tsx
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type DirectoryPrompt = Readonly<{query: string; label: string}>;

// Each preset is its own one-field GET form rather than a shared submit-button/name pair on the
// existing filter form: a shared form would submit two `q` entries (the typed search value and
// the preset), and which one `parseShowcaseFilters` keeps first would depend on DOM order rather
// than intent. Same param name, same target route, same GET semantics as the real filter form --
// just not the same DOM node. `className="contents"` removes the form's own box from the grid
// layout so the real `<button>` becomes the `.directory-prompts` grid item the donor CSS expects.
export function DirectoryPrompts({locale, prompts}: Readonly<{locale: AppLocale; prompts: readonly DirectoryPrompt[]}>) {
  const action = localizedPath(locale, "/showcase");
  return <div className="directory-prompts">
    {prompts.map((prompt) => (
      <form action={action} className="contents" key={prompt.query} method="get">
        <input name="q" type="hidden" value={prompt.query} />
        <button type="submit">{prompt.label}</button>
      </form>
    ))}
  </div>;
}
```

`components/marketing/solution-needs.tsx`

```tsx
import {Arrow} from "@/components/wt/arrow";
import type {AppLocale} from "@/i18n/routing";
import type {ShowcaseFilters} from "@/lib/showcase/contracts";
import {localizedPath} from "@/lib/urls";

export type SolutionNeed = Readonly<{slug: string; label: string}>;

const CARRY_FORWARD_KEYS = ["category", "deployment", "language", "worksWith", "q"] as const;

// Additive alongside q (and every other active facet): each chip's own form carries forward
// every currently-set filter except useCase as hidden inputs, then sets useCase itself via the
// submit button's own name/value pair. `className="contents"` keeps the real <button> as the
// `.solution-needs` grid item, matching the donor's tag-specific selector.
export function SolutionNeeds({locale, filters, chips}: Readonly<{locale: AppLocale; filters: ShowcaseFilters; chips: readonly SolutionNeed[]}>) {
  const action = localizedPath(locale, "/showcase");
  return <div className="solution-needs">
    {chips.map((chip, index) => {
      const active = filters.useCase === chip.slug;
      return (
        <form action={action} className="contents" key={chip.slug} method="get">
          {CARRY_FORWARD_KEYS.filter((key) => filters[key]).map((key) => (
            <input key={key} name={key} type="hidden" value={filters[key]} />
          ))}
          <button aria-pressed={active} className={active ? "active" : undefined} name="useCase" type="submit" value={chip.slug}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <span>{chip.label}</span>
            <Arrow />
          </button>
        </form>
      );
    })}
  </div>;
}
```

`components/marketing/solution-verification.tsx`

```tsx
import {CardGrid} from "@/components/wt/card-grid";
import {Shell} from "@/components/wt/shell";
import {StatusLabel} from "@/components/wt/status-label";
import type {WtCard} from "@/components/wt/types";

export function SolutionVerification({label, title, copy, badges}: Readonly<{label: string; title: string; copy: string; badges: readonly WtCard[]}>) {
  return <section className="solution-verification">
    <Shell>
      <StatusLabel as="p">{label}</StatusLabel>
      <h2>{title}</h2>
      <p>{copy}</p>
      <CardGrid items={badges} variant="badge" />
    </Shell>
  </section>;
}
```

`components/marketing/solution-pathways.tsx`

```tsx
import {ActionLink} from "@/components/wt/action-link";
import {Shell} from "@/components/wt/shell";
import {StatusLabel} from "@/components/wt/status-label";

export type SolutionPathwayPanel = Readonly<{label: string; title: string; copy: string; action: string; href: string}>;

export function SolutionPathways({buyer, provider}: Readonly<{buyer: SolutionPathwayPanel; provider: SolutionPathwayPanel}>) {
  return <section aria-label="Showcase pathways">
    <Shell>
      <div className="solution-pathways">
        {[buyer, provider].map((panel) => (
          <article key={panel.href}>
            <StatusLabel>{panel.label}</StatusLabel>
            <h2>{panel.title}</h2>
            <p>{panel.copy}</p>
            <ActionLink href={panel.href} variant="button-dark">{panel.action}</ActionLink>
          </article>
        ))}
      </div>
    </Shell>
  </section>;
}
```

- [ ] **Step 8: Rewrite the page**

`app/[locale]/(public)/showcase/page.tsx`

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {DirectoryPrompts} from "@/components/marketing/directory-prompts";
import {ShowcaseCard} from "@/components/marketing/showcase-card";
import {ShowcaseFilters} from "@/components/marketing/showcase-filters";
import {SolutionNeeds} from "@/components/marketing/solution-needs";
import {SolutionPathways} from "@/components/marketing/solution-pathways";
import {SolutionVerification} from "@/components/marketing/solution-verification";
import {ActionLink} from "@/components/wt/action-link";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {InterestBand} from "@/components/wt/interest-band";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import type {AppLocale} from "@/i18n/routing";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {buildPageMetadata} from "@/lib/metadata";
import {parseShowcaseFilters, toPublicListing} from "@/lib/showcase/contracts";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

const PROMPTS = [
  {key: "aiConcierge", query: "AI concierge"},
  {key: "cybersecurity", query: "Cybersecurity"},
  {key: "crossBorderTrade", query: "Cross-border trade"},
  {key: "cloudMigration", query: "Cloud migration"},
  {key: "generativeAi", query: "Generative AI"},
  {key: "fintech", query: "Fintech"},
] as const;

const USE_CASES = [
  "customerService", "cybersecurity", "tradeCompliance", "supplyChain", "fintechPayments", "dataAnalytics",
  "hrTalent", "marketingAutomation", "legalCompliance", "smartManufacturing", "sustainabilityEsg", "crossBorderTrade",
] as const;
const USE_CASE_SLUGS: Record<(typeof USE_CASES)[number], string> = {
  customerService: "customer-service", cybersecurity: "cybersecurity", tradeCompliance: "trade-compliance",
  supplyChain: "supply-chain", fintechPayments: "fintech-payments", dataAnalytics: "data-analytics",
  hrTalent: "hr-talent", marketingAutomation: "marketing-automation", legalCompliance: "legal-compliance",
  smartManufacturing: "smart-manufacturing", sustainabilityEsg: "sustainability-esg", crossBorderTrade: "cross-border-trade",
};
const BADGE_KEYS = ["verifiedDeployment", "reviewedEvidence", "dataHandling"] as const;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Showcase"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/showcase", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function ShowcasePage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [t, tCommon, query] = await Promise.all([
    getTranslations({locale, namespace: "Showcase"}),
    getTranslations({locale, namespace: "Common"}),
    searchParams,
  ]);
  const filters = parseShowcaseFilters(query);
  // A database outage degrades to the empty state rather than a 500 -- unchanged from today.
  const rows = await showcaseRepository.listPublished(filters).catch(() => []);
  const listings = rows.map((row) => toPublicListing(row, locale));
  const cardLabels = {premium: t("premium"), goneGlobal: t("goneGlobal"), memberSince: t("memberSince"), category: t("filters.category"), view: t("view")};
  const filterLabels = {search: t("filters.search"), category: t("filters.category"), useCase: t("filters.useCase"), deployment: t("filters.deployment"), language: t("filters.language"), worksWith: t("filters.worksWith"), submit: t("filters.submit"), clear: t("filters.clear")};
  const prompts = PROMPTS.map((prompt) => ({query: prompt.query, label: t(`prompts.${prompt.key}`)}));
  const chips = USE_CASES.map((key) => ({slug: USE_CASE_SLUGS[key], label: t(`needs.${key}`)}));
  const badges = BADGE_KEYS.map((key) => ({title: t(`verification.badges.${key}.title`), copy: t(`verification.badges.${key}.copy`)}));

  return <>
    <PageHero
      breadcrumb={{homeHref: "/", homeLabel: tCommon("breadcrumbHome"), current: t("title")}}
      eyebrow={t("eyebrow")}
      lead={t("description")}
      title={t("title")}
    />
    <Section id="results" labelledBy="showcase-results-title">
      <h2 className="sr-only" id="showcase-results-title">{t("resultsTitle")}</h2>
      <DirectoryPrompts locale={locale} prompts={prompts} />
      <ShowcaseFilters filters={filters} labels={filterLabels} locale={locale} />
      <SolutionNeeds chips={chips} filters={filters} locale={locale} />
      {listings.length > 0
        ? <div className="partner-record-grid">{listings.map((listing) => <ShowcaseCard key={listing.slug} labels={cardLabels} listing={listing} locale={locale} />)}</div>
        : <HonestEmpty actions={[{label: t("filters.clear"), href: "/showcase"}]} copy={t("emptyDescription")} title={t("emptyTitle")} variant="inner" />}
    </Section>
    <SolutionVerification badges={badges} copy={t("verification.copy")} label={t("verification.label")} title={t("verification.title")} />
    <Section labelledBy="showcase-pathways-title">
      <h2 className="sr-only" id="showcase-pathways-title">{t("pathways.heading")}</h2>
      <SolutionPathways
        buyer={{label: t("pathways.buyer.label"), title: t("pathways.buyer.title"), copy: t("pathways.buyer.copy"), action: t("pathways.buyer.action"), href: "/contact"}}
        provider={{label: t("pathways.provider.label"), title: t("pathways.provider.title"), copy: t("pathways.provider.copy"), action: t("ownerCta"), href: "/portal/company/listing"}}
      />
    </Section>
    <InterestBand
      action={<ActionLink href="/events" variant="button-light">{t("interest.action")}</ActionLink>}
      copy={t("interest.copy")}
      eyebrow={t("interest.eyebrow")}
      title={t("interest.title")}
    />
  </>;
}
```

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wt-pages/showcase-page.test.tsx tests/unit/showcase-page-degrades.test.tsx tests/unit/wisetech-pr5-showcase-presentation.test.tsx tests/unit/m5-public-showcase.test.tsx tests/unit/messages.test.ts`
Expected: PASS — all five files green, including the three pre-existing pinned suites.

- [ ] **Step 10: Commit**

```bash
git add components/marketing/directory-prompts.tsx components/marketing/solution-needs.tsx components/marketing/solution-verification.tsx components/marketing/solution-pathways.tsx components/marketing/showcase-filters.tsx components/marketing/showcase-card.tsx app/\[locale\]/\(public\)/showcase/page.tsx messages/en.json messages/zh-HK.json tests/unit/wt-pages/showcase-page.test.tsx tests/unit/showcase-page-degrades.test.tsx tests/unit/wisetech-pr5-showcase-presentation.test.tsx
git commit -m "$(cat <<'EOF'
feat: rewrite /showcase to the inner-page directory grammar (WP-4 Group B)

Adds directory-prompts, solution-needs, solution-verification and
solution-pathways over the existing showcaseRepository.listPublished read;
fixes E-29 (search input had no id, so #q could not deep-link); restyles
ShowcaseFilters/ShowcaseCard to .directory-search/.partner-record-card
with no change to their GET semantics or props contract.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `/showcase/[slug]` restyle — inner-page grammar only, no logic change

**Files:**
- Modify: `components/marketing/showcase-detail.tsx`, `components/marketing/request-intro-form.tsx`
- Test: `tests/unit/wt-pages/showcase-detail-page.test.tsx`

**Investigation notes:** `wisetech-pr5-showcase-presentation.test.tsx` already renders `<ShowcaseDetail>` directly and pins two heading names (`overview`, `capabilities`) plus the description text; `app/[locale]/(public)/showcase/[slug]/page.tsx` itself is untouched (spec: "no logic change"), so this task never opens that file. `ShowcaseDetail` and `RequestIntroForm` today use no `@/i18n/navigation` import at all (only plain `<a>` for external video/case-study URLs) — restyle must not introduce one, so the pinned test keeps rendering without a `@/i18n/navigation` mock. Real donor classes confirmed by grep: `.detail-page` (main/aside 2-col grid), `.detail-aside` (bordered card, `.button` full width), `.practical-grid` (2-col dt/dd grid — a 1:1 fit for the four use-case/deployment/languages/works-with facts), `.partner-status` (badge pill), `.form-grid`/`.partner-form` (the form's own field styling).

- [ ] **Step 1: Write the failing test**

`tests/unit/wt-pages/showcase-detail-page.test.tsx`

```tsx
import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ShowcaseDetail} from "@/components/marketing/showcase-detail";
import {RequestIntroForm} from "@/components/marketing/request-intro-form";
import type {PublicListing} from "@/lib/showcase/contracts";

const listing: PublicListing = {
  slug: "harbour-vision-ai", premium: true, goneGlobal: true, views: 42, memberSince: "2020-01-01",
  name: "Harbour Vision AI", tagline: "Trade intelligence", description: "Public description", category: "software",
  useCases: ["logistics"], deploymentOptions: ["cloud"], supportedLanguages: ["en", "zh-HK"], worksWith: ["ERP"],
  videoUrl: null, caseStudyUrl: null, caseStudySummary: null, logoReference: null, logo: null,
};

const labels = {
  premium: "Premium", goneGlobal: "Gone Global", memberSince: "WTIA member since", overview: "Solution overview",
  capabilities: "Capabilities", useCases: "Use cases", deployment: "Deployment", languages: "Languages",
  worksWith: "Works with", caseStudy: "Case study", video: "Product video", requestIntro: "Request an introduction",
} as const;

describe("/showcase/[slug] restyle", () => {
  it("wraps the detail body in the donor's main/aside layout", () => {
    render(<ShowcaseDetail labels={labels} listing={listing} locale="en" />);

    expect(document.querySelector(".detail-page")).not.toBeNull();
    expect(document.querySelector(".detail-page .detail-main")).not.toBeNull();
    expect(document.querySelector(".detail-page .detail-aside")).not.toBeNull();
  });

  it("keeps the pinned headings, badge text and description intact", () => {
    render(<ShowcaseDetail labels={labels} listing={listing} locale="en" />);

    expect(screen.getByRole("heading", {name: labels.overview})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: labels.capabilities})).toBeInTheDocument();
    expect(screen.getByText(listing.description)).toBeInTheDocument();
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".partner-status")).toHaveLength(2);
  });

  it("renders the four capability facts in the real .practical-grid", () => {
    render(<ShowcaseDetail labels={labels} listing={listing} locale="en" />);

    const grid = document.querySelector(".practical-grid");
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll("dt")).toHaveLength(4);
  });

  it("styles the request-intro form fields with the real donor form classes", () => {
    render(<RequestIntroForm action={async () => ({ok: true as const})} labels={{
      name: "Name", email: "Email", organization: "Organisation", message: "Message", website: "Website",
      submit: "Submit", submitting: "Sending", success: "Done", invalid: "Invalid", rateLimited: "Later",
    }} locale="en" slug="harbour-vision-ai" />);

    expect(document.querySelector(".partner-form")).not.toBeNull();
    expect(document.querySelector(".partner-form .form-grid")).not.toBeNull();
    expect(document.querySelector(".partner-form button[type=submit]")).toHaveClass("button");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/showcase-detail-page.test.tsx`
Expected: FAIL — `.detail-page`, `.detail-main`, `.detail-aside`, `.practical-grid`, `.partner-status`, `.partner-form`, `.form-grid` do not exist in the current markup.

- [ ] **Step 3: Restyle `ShowcaseDetail`**

`components/marketing/showcase-detail.tsx`

```tsx
import Image from "next/image";
import type {ReactNode} from "react";

import type {AppLocale} from "@/i18n/routing";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";
import type {PublicListing} from "@/lib/showcase/contracts";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{
  premium: string;
  goneGlobal: string;
  memberSince: string;
  overview?: string;
  capabilities?: string;
  useCases: string;
  deployment: string;
  languages: string;
  worksWith: string;
  caseStudy: string;
  video: string;
  requestIntro: string;
}>;

export function ShowcaseDetail({listing, locale, labels, requestIntro}: Readonly<{listing: PublicListing; locale: AppLocale; labels: Labels; requestIntro?: ReactNode}>) {
  return <div className="detail-page">
    <div className="detail-main">
      <header>
        {listing.logo
          ? <Image alt={listing.logo.alt} className="h-16 w-auto rounded-lg object-contain" height={64} src={listing.logo.url} unoptimized={isPrivateMediaDeliveryUrl(listing.logo.url)} width={160} />
          : null}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{listing.category}</p>
          {listing.premium ? <span className="partner-status">{labels.premium}</span> : null}
          {listing.goneGlobal ? <span className="partner-status">{labels.goneGlobal}</span> : null}
        </div>
        <h1>{listing.name}</h1>
        <p className="lead">{listing.tagline}</p>
        <p>{labels.memberSince} {listing.memberSince}</p>
      </header>
      {listing.videoUrl ? <section><h2>{labels.video}</h2><a href={listing.videoUrl} rel="noreferrer" target="_blank">{listing.videoUrl}</a></section> : null}
      <section>
        {labels.overview ? <h2>{labels.overview}</h2> : null}
        <p className="whitespace-pre-line">{listing.description}</p>
      </section>
      <section>
        {labels.capabilities ? <h2>{labels.capabilities}</h2> : null}
        <dl className="practical-grid">
          <div><dt>{labels.useCases}</dt><dd>{listing.useCases.join(", ")}</dd></div>
          <div><dt>{labels.deployment}</dt><dd>{listing.deploymentOptions.join(", ")}</dd></div>
          <div><dt>{labels.languages}</dt><dd>{listing.supportedLanguages.join(", ")}</dd></div>
          <div><dt>{labels.worksWith}</dt><dd>{listing.worksWith.join(", ")}</dd></div>
        </dl>
      </section>
      {listing.caseStudySummary ? <section><h2>{labels.caseStudy}</h2><p>{listing.caseStudySummary}</p>{listing.caseStudyUrl ? <a href={listing.caseStudyUrl} rel="noreferrer" target="_blank">{listing.caseStudyUrl}</a> : null}</section> : null}
    </div>
    <aside className="detail-aside">
      <h3>{labels.requestIntro}</h3>
      {requestIntro ?? <p>{localizedPath(locale, "/contact")}</p>}
    </aside>
  </div>;
}
```

- [ ] **Step 4: Restyle `RequestIntroForm`**

`components/marketing/request-intro-form.tsx`

```tsx
"use client";

import {useActionState} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {LeadRequestResult} from "@/lib/showcase/lead-actions";

type Labels = Readonly<{
  name: string;
  email: string;
  organization: string;
  message: string;
  website: string;
  submit: string;
  submitting: string;
  success: string;
  invalid: string;
  rateLimited: string;
}>;

type FormState = Readonly<{status: "idle" | "success" | "invalid" | "rate_limited"}>;
const initialState: FormState = {status: "idle"};

export function RequestIntroForm({
  action,
  locale,
  slug,
  labels,
}: Readonly<{
  action: (formData: FormData) => Promise<LeadRequestResult>;
  locale: AppLocale;
  slug: string;
  labels: Labels;
}>) {
  const [state, formAction, pending] = useActionState(
    async (_previous: FormState, formData: FormData): Promise<FormState> => {
      const result = await action(formData);
      if (result.ok) return {status: "success"};
      return {status: result.code};
    },
    initialState,
  );
  const statusMessage = state.status === "success"
    ? labels.success
    : state.status === "invalid"
      ? labels.invalid
      : state.status === "rate_limited"
        ? labels.rateLimited
        : "";

  return <form action={formAction} className="partner-form" noValidate>
    <input name="slug" type="hidden" value={slug} />
    <input name="locale" type="hidden" value={locale} />
    <div className="form-grid">
      <label htmlFor="showcase-contact-name"><span>{labels.name}</span><input aria-describedby="request-intro-status" autoComplete="name" id="showcase-contact-name" name="contactName" required type="text" /></label>
      <label htmlFor="showcase-contact-email"><span>{labels.email}</span><input aria-describedby="request-intro-status" autoComplete="email" id="showcase-contact-email" name="email" required type="email" /></label>
      <label htmlFor="showcase-contact-organization"><span>{labels.organization}</span><input aria-describedby="request-intro-status" autoComplete="organization" id="showcase-contact-organization" name="organization" type="text" /></label>
    </div>
    <label htmlFor="showcase-contact-message"><span>{labels.message}</span><textarea aria-describedby="request-intro-status" id="showcase-contact-message" maxLength={4_000} name="message" rows={5} /></label>
    <label className="sr-only" htmlFor="showcase-website">{labels.website}<input autoComplete="off" id="showcase-website" name="website" tabIndex={-1} type="text" /></label>
    <button className="button" disabled={pending} type="submit">{pending ? labels.submitting : labels.submit}</button>
    <p aria-live="polite" className={state.status === "invalid" || state.status === "rate_limited" ? "form-error" : undefined} id="request-intro-status">{statusMessage}</p>
  </form>;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wt-pages/showcase-detail-page.test.tsx tests/unit/wisetech-pr5-showcase-presentation.test.tsx tests/unit/event-registration-form.test.tsx`
Expected: PASS — the new suite, plus the pinned `ShowcaseDetail` assertions in `wisetech-pr5-showcase-presentation.test.tsx`, which never depended on the removed Tailwind classes.

- [ ] **Step 6: Commit**

```bash
git add components/marketing/showcase-detail.tsx components/marketing/request-intro-form.tsx tests/unit/wt-pages/showcase-detail-page.test.tsx
git commit -m "$(cat <<'EOF'
style: restyle /showcase/[slug] to the donor's detail-page grammar

ShowcaseDetail and RequestIntroForm keep every prop, every field and every
existing action call unchanged -- only classNames move to .detail-page/
.detail-aside/.practical-grid/.partner-form/.partner-status, none of which
this route's page.tsx needed to change.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `/membership` rewrite — plan grid, SME pathway, pricing note, dimensions, first-90 steps

**Files:**
- Create: `components/marketing/plan-grid.tsx`
- Create: `components/marketing/membership-dimensions.tsx`
- Create: `components/marketing/pricing-note.tsx`
- Modify: `app/[locale]/(public)/membership/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Modify: `tests/unit/membership-page-catalog.test.tsx` (harness-only — see Step 6)
- Test: `tests/unit/wt-pages/membership-page.test.tsx`

**Investigation notes:** `.first-90` does not exist in `app/styles/wisetech.css` — confirmed both by direct grep and by `tests/unit/wisetech-css-port.test.ts`'s own comment ("A mechanical port cannot produce a rule the donor does not have... the section takes its appearance from `.section`, `.shell`, `.inner-section-heading`, `.intro-process` and `.directory-actions` instead"). This task therefore uses the existing `StepGrid` component (`components/wt/step-grid.tsx`, class `.intro-process`) for the first-90-days steps, not a fabricated `.first-90` class. `PLAN_CODES` is confirmed exactly `["community", "startup", "corporate", "patron"]` (`lib/membership/plans.ts:6`); `buildPublicMembershipCatalog` (`lib/membership/public-catalog.ts`) returns `readonly PublicMembershipTier[]` with `{code, price: {kind:"free"}|{kind:"review"}|{kind:"paid", options:[{amount,cadence}]}, cta:{href,kind}}` — `cta.href` is already exactly `/join?plan=<code>` for community/startup/corporate and `/contact` for patron, so no new href logic is needed, only the CTA label text changes (spec's "Discuss this pathway", one wording for all four). `.plan-grid` is a real, confirmed CSS rule (`repeat(5,1fr)`, `article:nth-child(5)` auto-styled dark) — the SME card is simply the 5th `<article>` in DOM order, no extra class needed. `tests/unit/membership-page-catalog.test.tsx` is the only test rendering the full page; it checks `t("unavailable")` appears exactly once when the catalog is empty and never appears when a valid tier renders, and it checks `href="/join?plan=community"` and `Community`/`Free` text — none of that changes. `tests/unit/membership-links.test.tsx` exercises `TierComparison` in isolation and is untouched by this task (the page stops calling `TierComparison`, but the component itself is not modified or deleted, since other future pages may still reference it).

- [ ] **Step 1: Write the failing test**

`tests/unit/wt-pages/membership-page.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {PersistedMembershipPlan} from "@/lib/membership/public-catalog";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const membershipPlans = vi.hoisted(() => ({list: vi.fn()}));

vi.mock("@/lib/db/repos/membership-plans", () => ({membershipPlansRepository: membershipPlans}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import MembershipPage from "@/app/[locale]/(public)/membership/page";

const startup: PersistedMembershipPlan = {
  code: "startup", audience: "startup", billingBehavior: "checkout", seatAllowance: 5, active: true,
  annualPriceHkd: 120000, monthlyPriceHkd: 12000, stripePriceReference: "price_startup",
};
const community: PersistedMembershipPlan = {
  code: "community", audience: "individual", billingBehavior: "free", seatAllowance: 1, active: true,
  annualPriceHkd: 0, monthlyPriceHkd: null, stripePriceReference: null,
};
const patron: PersistedMembershipPlan = {
  code: "patron", audience: "patron", billingBehavior: "review", seatAllowance: 1, active: true,
  annualPriceHkd: null, monthlyPriceHkd: null, stripePriceReference: null,
};

async function renderMembership(rows: readonly PersistedMembershipPlan[]) {
  membershipPlans.list.mockResolvedValue(rows);
  const originalEnv = {...process.env};
  process.env.STRIPE_STARTUP_PRICE_ID = "price_startup";
  process.env.STRIPE_CORPORATE_PRICE_ID = "price_corporate";
  const html = renderToStaticMarkup(await MembershipPage({params: Promise.resolve({locale: "en"})}));
  process.env = originalEnv;
  return html;
}

describe("/membership rewrite", () => {
  beforeEach(() => { membershipPlans.list.mockReset(); });

  it("renders the plan grid with four anchors plus a fifth, distinct SME card", async () => {
    const html = await renderMembership([community, startup, patron]);

    expect(html).toContain('class="plan-grid"');
    expect(html).toContain('id="community"');
    expect(html).toContain('id="startup"');
    expect(html).not.toContain('id="corporate"');
    expect(html).toContain('id="patron"');
    expect((html.match(/<article/g) ?? []).length).toBe(4);
    expect(html).toContain(bundles.en.Membership.sme.title);
    expect(html).toContain('href="/join?plan=community"');
    expect(html).toContain('href="/join?plan=startup"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain(bundles.en.Membership.actions.discuss);
  });

  it("shows the confirmed-pricing note when both configured price ids resolve", async () => {
    const html = await renderMembership([community, startup]);

    expect(html).toContain('class="pricing-note"');
    expect(html).toContain(bundles.en.Membership.pricing.readyCopy);
    expect(html).not.toContain(bundles.en.Membership.pricing.fallbackCopy);
  });

  it("falls back to the donor's confirm-with-team pricing copy otherwise", async () => {
    const html = await renderMembership([community]);

    expect(html).toContain(bundles.en.Membership.pricing.fallbackCopy);
  });

  it("renders exactly one honest unavailable state for an empty catalog, unchanged", async () => {
    const html = await renderMembership([]);

    expect(html.match(/Membership is currently unavailable/g)).toHaveLength(1);
    expect(html).not.toContain('class="plan-grid"');
  });

  it("renders the 12-tile membership-dimensions panel", async () => {
    const html = await renderMembership([community]);

    expect(html).toContain('class="membership-dimensions"');
    expect((html.match(/<article>/g) ?? []).length).toBeGreaterThanOrEqual(12);
  });

  it("renders the first-90-days steps on the real .intro-process grid, not a fabricated .first-90 class", async () => {
    const html = await renderMembership([community]);

    expect(html).toContain('class="intro-process"');
    expect(html).not.toContain("first-90");
    expect((html.match(/<article/g) ?? []).length).toBeGreaterThanOrEqual(5 + 4);
  });

  it("closes with /join and mailto: actions", async () => {
    const html = await renderMembership([community]);

    expect(html).toContain('href="/join"');
    expect(html).toMatch(/href="mailto:[^"]+"/);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/membership-page.test.tsx`
Expected: FAIL — `.plan-grid`, `.pricing-note`, `.membership-dimensions`, `.intro-process`, `Membership.sme.*`, `Membership.pricing.*`, `Membership.dimensions.*`, `Membership.first90.*`, `Membership.actions.discuss`, `Membership.closing.*` do not exist yet.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Membership.actions.discuss` | Discuss this pathway | 討論此參與路徑 |
| `Membership.sme.label` | For SMEs | 適合中小企 |
| `Membership.sme.title` | Not sure which tier fits? | 未確定哪個級別適合你？ |
| `Membership.sme.copy` | Small and medium enterprises can start with a Community membership and move up as programme participation grows. WTIA staff can help you choose. | 中小企可先由社群會籍開始，隨參與計劃增加而升級。WTIA 職員可協助你選擇合適級別。 |
| `Membership.sme.action` | Ask WTIA | 查詢 WTIA |
| `Membership.pricing.readyLabel` | Current pricing | 現行收費 |
| `Membership.pricing.readyCopy` | Startup and Corporate fees shown above are the current, confirmed rates from the membership catalog. | 以上初創及企業會籍的收費，均為會員目錄中現行已確認的價格。 |
| `Membership.pricing.fallbackLabel` | Pricing | 收費 |
| `Membership.pricing.fallbackCopy` | Startup and Corporate fees are being finalised. Confirm current rates with the membership team before applying. | 初創及企業會籍收費仍在敲定中。申請前請向會員團隊確認現行收費。 |
| `Membership.dimensions.network.title` | Network | 網絡 |
| `Membership.dimensions.network.copy` | Community and networking access across the ecosystem. | 遍及生態系統的社群及聯繫網絡。 |
| `Membership.dimensions.programmes.title` | Programmes | 計劃參與 |
| `Membership.dimensions.programmes.copy` | Participation in WTIA programmes (ASA, TCT, HKICT, CPAI). | 參與 WTIA 計劃（ASA、TCT、HKICT、CPAI）。 |
| `Membership.dimensions.visibility.title` | Visibility | 曝光機會 |
| `Membership.dimensions.visibility.copy` | Opportunities to be seen by other members and partners. | 讓其他會員及夥伴認識你的機會。 |
| `Membership.dimensions.events.title` | Events | 活動 |
| `Membership.dimensions.events.copy` | Access to WTIA events, from open sessions to member-only sessions. | 參與 WTIA 活動，由公開場次至會員專屬場次。 |
| `Membership.dimensions.showcase.title` | Showcase | 展示頁 |
| `Membership.dimensions.showcase.copy` | Eligibility to list a solution on the public Showcase. | 符合資格於公開展示頁刊登方案。 |
| `Membership.dimensions.committees.title` | Committees | 委員會 |
| `Membership.dimensions.committees.copy` | Eligibility to join WTIA committees and working groups. | 符合資格加入 WTIA 委員會及工作小組。 |
| `Membership.dimensions.seats.title` | Seats | 名額 |
| `Membership.dimensions.seats.copy` | Number of individual seats included under one membership. | 每個會籍包含的個人名額數目。 |
| `Membership.dimensions.billing.title` | Billing | 收費安排 |
| `Membership.dimensions.billing.copy` | Billing cadence and available payment options. | 收費週期及可選付款方式。 |
| `Membership.dimensions.onboarding.title` | Onboarding | 入會導引 |
| `Membership.dimensions.onboarding.copy` | What to expect in your first 90 days as a member. | 入會首 90 天可期望的安排。 |
| `Membership.dimensions.governance.title` | Governance | 管治 |
| `Membership.dimensions.governance.copy` | Voting rights and involvement in WTIA governance, where applicable. | 適用情況下的投票權及參與 WTIA 管治事務。 |
| `Membership.dimensions.support.title` | Support | 支援 |
| `Membership.dimensions.support.copy` | Direct access to WTIA staff for enquiries and introductions. | 直接聯繫 WTIA 職員查詢及獲取引薦。 |
| `Membership.dimensions.renewal.title` | Renewal | 續會 |
| `Membership.dimensions.renewal.copy` | How and when membership is reviewed and renewed. | 會籍檢視及續會的方式與時間。 |
| `Membership.first90.eyebrow` | First 90 days | 首 90 天 |
| `Membership.first90.heading` | What happens after you join | 加入後的安排 |
| `Membership.first90.steps.0.title` | Join | 加入 |
| `Membership.first90.steps.0.copy` | Choose a tier and complete payment or review. | 選擇級別並完成付款或審批。 |
| `Membership.first90.steps.1.title` | Orientation | 入會導引 |
| `Membership.first90.steps.1.copy` | Meet the WTIA team and get access to your member tools. | 認識 WTIA 團隊，取得會員工具的使用權。 |
| `Membership.first90.steps.2.title` | First event | 首次活動 |
| `Membership.first90.steps.2.copy` | Attend your first WTIA event as a member. | 以會員身份出席首個 WTIA 活動。 |
| `Membership.first90.steps.3.title` | First introduction | 首次引薦 |
| `Membership.first90.steps.3.copy` | Make your first connection through the network. | 透過網絡建立第一個聯繫。 |
| `Membership.first90.steps.4.title` | Review | 檢視 |
| `Membership.first90.steps.4.copy` | WTIA checks in on how membership is working for you. | WTIA 跟進了解會籍對你的實際幫助。 |
| `Membership.closing.eyebrow` | Ready when you are | 隨時歡迎你 |
| `Membership.closing.title` | Choose your tier, or ask us first. | 選擇級別，或先向我們查詢。 |
| `Membership.closing.copy` | Community, Startup and Corporate membership can be applied for online. Patron membership and any other question can start with a direct message. | 社群、初創及企業會籍均可網上申請。贊助人會籍或其他查詢，可直接與我們聯絡。 |
| `Membership.closing.join` | Join now | 立即加入 |
| `Membership.closing.contact` | Email the membership team | 電郵會員團隊 |

- [ ] **Step 4: Implement `PlanGrid`, `MembershipDimensions`, `PricingNote`**

`components/marketing/plan-grid.tsx`

```tsx
import {ActionLink} from "@/components/wt/action-link";
import {CardIndex} from "@/components/wt/card-index";

export type PlanGridTier = Readonly<{
  code: string;
  name: string;
  description: string;
  priceLines: readonly string[];
  benefits: readonly string[];
  action: string;
  href: string;
}>;

export type PlanGridSme = Readonly<{label: string; title: string; copy: string; action: string; href: string}>;

// `.plan-grid article:nth-child(5)` auto-styles the fifth card dark -- the SME card is simply
// rendered fifth, in DOM order, so it needs no class of its own to be visually distinct (D-7).
export function PlanGrid({tiers, sme}: Readonly<{tiers: readonly PlanGridTier[]; sme: PlanGridSme}>) {
  return <div className="plan-grid">
    {tiers.map((tier, index) => (
      <article id={tier.code} key={tier.code}>
        <CardIndex index={index + 1} />
        <h2>{tier.name}</h2>
        {tier.priceLines.map((line) => <p key={line}>{line}</p>)}
        <p>{tier.description}</p>
        <ul>{tier.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
        <ActionLink href={tier.href} variant="text-link">{tier.action}</ActionLink>
      </article>
    ))}
    <article>
      <CardIndex index={tiers.length + 1} />
      <h2>{sme.title}</h2>
      <p>{sme.copy}</p>
      <ActionLink href={sme.href} variant="text-link">{sme.action}</ActionLink>
    </article>
  </div>;
}
```

`components/marketing/membership-dimensions.tsx`

```tsx
import type {WtCard} from "@/components/wt/types";

export function MembershipDimensions({items}: Readonly<{items: readonly WtCard[]}>) {
  return <div className="membership-dimensions">
    {items.map((item) => (
      <article key={item.title}>
        <span>{item.marker ?? ""}</span>
        <h3>{item.title}</h3>
        <p>{item.copy}</p>
      </article>
    ))}
  </div>;
}
```

`components/marketing/pricing-note.tsx`

```tsx
import {StatusLabel} from "@/components/wt/status-label";

export function PricingNote({label, copy}: Readonly<{label: string; copy: string}>) {
  return <div className="pricing-note">
    <StatusLabel>{label}</StatusLabel>
    <p>{copy}</p>
  </div>;
}
```

- [ ] **Step 5: Rewrite the page**

`app/[locale]/(public)/membership/page.tsx`

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MembershipDimensions} from "@/components/marketing/membership-dimensions";
import {PlanGrid, type PlanGridTier} from "@/components/marketing/plan-grid";
import {PricingNote} from "@/components/marketing/pricing-note";
import {ClosingBand} from "@/components/wt/closing-band";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import {StepGrid} from "@/components/wt/step-grid";
import {siteConfig} from "@/config/site";
import type {AppLocale} from "@/i18n/routing";
import {membershipPlansRepository} from "@/lib/db/repos/membership-plans";
import {buildPageMetadata} from "@/lib/metadata";
import {buildPublicMembershipCatalog, publicPriceIds, type PublicMembershipTier} from "@/lib/membership/public-catalog";

export const dynamic = "force-dynamic";
type Props = {params: Promise<{locale: string}>};

const DIMENSION_KEYS = [
  "network", "programmes", "visibility", "events", "showcase", "committees",
  "seats", "billing", "onboarding", "governance", "support", "renewal",
] as const;

function priceLines(price: PublicMembershipTier["price"], labels: Readonly<{free: string; review: string; annual: string; monthly: string}>): readonly string[] {
  if (price.kind === "free") return [labels.free];
  if (price.kind === "review") return [labels.review];
  return price.options.map((option) => `${option.amount} ${labels[option.cadence]}`);
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Membership"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/membership", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function MembershipPage({params}: Props) {
  const {locale: rawLocale} = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);

  const [t, tCommon, rows] = await Promise.all([
    getTranslations({locale, namespace: "Membership"}),
    getTranslations({locale, namespace: "Common"}),
    membershipPlansRepository.list().catch(() => null),
  ]);
  const publicTiers = rows === null ? [] : buildPublicMembershipCatalog({locale, rows, priceIds: publicPriceIds()});
  const labels = {free: t("priceLabels.free"), review: t("priceLabels.review"), annual: t("cadenceLabels.annual"), monthly: t("cadenceLabels.monthly")};
  const benefits = [t("benefits.network"), t("benefits.programs"), t("benefits.visibility")];
  const tiers: PlanGridTier[] = publicTiers.map((tier) => ({
    code: tier.code,
    name: t(`tiers.${tier.code}.name`),
    description: t(`tiers.${tier.code}.description`),
    priceLines: priceLines(tier.price, labels),
    benefits,
    action: t("actions.discuss"),
    href: tier.cta.href,
  }));
  // "Ready" means both configured Startup/Corporate price ids actually resolved into the
  // catalog -- the same gate buildPublicMembershipCatalog already applies, read back here.
  const pricingReady = tiers.some((tier) => tier.code === "startup") && tiers.some((tier) => tier.code === "corporate");
  const dimensions = DIMENSION_KEYS.map((key) => ({title: t(`dimensions.${key}.title`), copy: t(`dimensions.${key}.copy`)}));
  const steps = [0, 1, 2, 3, 4].map((index) => ({title: t(`first90.steps.${index}.title`), copy: t(`first90.steps.${index}.copy`)}));

  return <>
    <PageHero
      breadcrumb={{homeHref: "/", homeLabel: tCommon("breadcrumbHome"), current: t("title")}}
      eyebrow={t("eyebrow")}
      lead={t("summary")}
      title={t("title")}
    />
    <Section id="plans" labelledBy="membership-plans-title">
      <h2 className="sr-only" id="membership-plans-title">{t("tiersTitle")}</h2>
      {tiers.length > 0
        ? <>
            <PlanGrid sme={{label: t("sme.label"), title: t("sme.title"), copy: t("sme.copy"), action: t("sme.action"), href: "/contact"}} tiers={tiers} />
            <PricingNote copy={t(pricingReady ? "pricing.readyCopy" : "pricing.fallbackCopy")} label={t(pricingReady ? "pricing.readyLabel" : "pricing.fallbackLabel")} />
          </>
        : <HonestEmpty copy={t("tiersIntro")} title={t("unavailable")} variant="inner" />}
    </Section>
    <Section labelledBy="membership-dimensions-title">
      <h2 className="sr-only" id="membership-dimensions-title">{t("faqTitle")}</h2>
      <MembershipDimensions items={dimensions} />
    </Section>
    <Section labelledBy="membership-first90-title">
      <h2 id="membership-first90-title">{t("first90.heading")}</h2>
      <StepGrid steps={steps} />
    </Section>
    <ClosingBand
      actions={[{label: t("closing.join"), href: "/join"}, {label: t("closing.contact"), href: `mailto:${siteConfig.contact.email}`}]}
      copy={t("closing.copy")}
      eyebrow={t("closing.eyebrow")}
      title={t("closing.title")}
    />
  </>;
}
```

- [ ] **Step 6: Update the existing pinned membership test — harness-only**

`tests/unit/membership-page-catalog.test.tsx` — add the same `@/i18n/navigation` mock, directly under the existing `vi.mock("next-intl/server", ...)` block (imports need `type {ReactNode} from "react"` added at the top):

```tsx
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
```

No other line in that file changes — its four `it` blocks (`dynamic` export, empty-catalog unavailable state in both locales, rejected-read unavailable state, reconciled-tier rendering) keep asserting exactly what they did before.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wt-pages/membership-page.test.tsx tests/unit/membership-page-catalog.test.tsx tests/unit/membership-links.test.tsx tests/unit/messages.test.ts`
Expected: PASS — all four green, including the two pre-existing pinned suites.

- [ ] **Step 8: Commit**

```bash
git add components/marketing/plan-grid.tsx components/marketing/membership-dimensions.tsx components/marketing/pricing-note.tsx app/\[locale\]/\(public\)/membership/page.tsx messages/en.json messages/zh-HK.json tests/unit/wt-pages/membership-page.test.tsx tests/unit/membership-page-catalog.test.tsx
git commit -m "$(cat <<'EOF'
feat: rewrite /membership to the donor's plan-grid/dimensions grammar

.plan-grid over the existing buildPublicMembershipCatalog read (cta.href
already exactly /join?plan=<code> or /contact -- unchanged), a fifth SME
pathway card (D-7, not a fifth tier), .pricing-note gated on both Stripe
price ids resolving, a 12-tile Membership.dimensions.* panel, and the
first-90-days steps on the real .intro-process grid -- .first-90 itself
is confirmed absent from the ported stylesheet (tests/unit/
wisetech-css-port.test.ts), so it is not invented here either.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: RichCompass primitive — the shared 3-column quick-link/stat grid

Every other task in this group depends on this primitive existing first. Verified against `app/styles/wisetech.css:896-901`: `.rich-compass` is the full-bleed white band, `.rich-compass-grid` is a fixed 3-column grid (`repeat(3,minmax(0,1fr))`), and the border rules are keyed to `.rich-compass-grid>div` only — there is no `>a` rule the way `.rich-items-cards>a` has one. So every cell stays a `<div>` (matching the CSS selector) and only the value becomes a real link when the caller supplies an `href`, keeping the donor border/padding intact whether the cell links anywhere or not.

**Files:**
- Create: `components/wt/rich-compass.tsx`
- Test: `tests/unit/rich-compass.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/rich-compass.test.tsx`

```tsx
import {render, screen} from "@testing-library/react";
import type {AnchorHTMLAttributes} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({href, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));

describe("RichCompass", () => {
  it("renders each item inside the donor 3-column grid, as a <div> whether or not it links anywhere", async () => {
    const {RichCompass} = await import("@/components/wt/rich-compass");
    render(
      <RichCompass
        items={[
          {label: "Since 2001", value: "Our history", href: "/about/history"},
          {label: "Leadership", value: "Chairman's message", href: "/about/chairman"},
          {label: "Founded", value: "2001"},
        ]}
      />,
    );

    const wrapper = document.querySelector(".rich-compass");
    expect(wrapper).toBeInTheDocument();
    const grid = wrapper?.querySelector(".rich-compass-grid");
    expect(grid).toBeInTheDocument();
    expect(grid?.children).toHaveLength(3);
    for (const cell of Array.from(grid?.children ?? [])) expect(cell.tagName).toBe("DIV");

    expect(screen.getByText("Since 2001")).toBeVisible();
    expect(screen.getByRole("link", {name: "Our history"})).toHaveAttribute("href", "/about/history");
    expect(screen.getByRole("link", {name: "Chairman's message"})).toHaveAttribute("href", "/about/chairman");
    expect(screen.getByText("Founded")).toBeVisible();
    expect(screen.getByText("2001")).toBeVisible();
    expect(screen.queryByRole("link", {name: "2001"})).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/rich-compass.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/wt/rich-compass`.

- [ ] **Step 3: Implement `components/wt/rich-compass.tsx`**

```tsx
import {Shell} from '@/components/wt/shell';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type RichCompassItem = Readonly<{label: string; value: string; href?: string}>;

type RichCompassProps = Readonly<{items: readonly RichCompassItem[]; className?: string}>;

// app/styles/wisetech.css:896 .rich-compass; :897 .rich-compass-grid (a fixed 3 columns);
// :898-899 border rules keyed to `.rich-compass-grid>div` only -- there is no `>a` rule here,
// unlike .rich-items-cards>a. Every cell therefore stays a <div> so the CSS's border/padding
// apply either way; only the value becomes a real Link when the caller supplies an href.
// Reusable across pages: this file carries no page's own links or stats, only the grid shell.
export function RichCompass({items, className}: RichCompassProps) {
  return (
    <div className={cn('rich-compass', className)}>
      <Shell>
        <div className="rich-compass-grid">
          {items.map((item, index) => (
            <div key={`${index}-${item.label}`}>
              <span>{item.label}</span>
              {item.href ? (
                <Link href={item.href}>
                  <strong>{item.value}</strong>
                </Link>
              ) : (
                <strong>{item.value}</strong>
              )}
            </div>
          ))}
        </div>
      </Shell>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/rich-compass.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/wt/rich-compass.tsx tests/unit/rich-compass.test.tsx
git commit -m "$(cat <<'EOF'
feat: add the shared RichCompass primitive for WP-4 Group C

A 3-column quick-link/stat grid over app/styles/wisetech.css's .rich-compass/
.rich-compass-grid, carrying no page-specific content of its own so every
Group C page (and later groups) can supply its own links and stats. Cells
stay <div>s per the CSS's own selectors, which define no `>a` rule the way
.rich-items-cards does; only a cell's value becomes a Link when an href is
supplied.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: RichRelatedRoutes primitive + the About-family related-routes helper

Every page in this group needs a "related-routes footer row" linking the other About sub-pages, so this is built once rather than five times. `otherAboutRoutes` is pure (easy to unit test in isolation); `buildOtherAboutRoutes` is the async wrapper that resolves each route's real copy from its *own* namespace — `About`/`History`/`Chairman`/`Committees` all already carry an `eyebrow` and a `title`; only `History` calls its lead paragraph `intro` rather than `summary`, confirmed by reading `messages/en.json` directly rather than assumed. No new message keys are needed for this component at all — every string it renders already shipped.

**Files:**
- Create: `components/wt/rich-related-routes.tsx`
- Create: `lib/about/related-routes.ts`
- Test: `tests/unit/rich-related-routes.test.tsx`, `tests/unit/about-related-routes.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/rich-related-routes.test.tsx`

```tsx
import {render, screen} from "@testing-library/react";
import type {AnchorHTMLAttributes, ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({href, children, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {href: string; children: ReactNode}) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("RichRelatedRoutes", () => {
  it("renders one link per item inside the donor 3-column related grid", async () => {
    const {RichRelatedRoutes} = await import("@/components/wt/rich-related-routes");
    render(
      <RichRelatedRoutes
        items={[
          {href: "/about/history", label: "Since 2001", title: "Our history", description: "Milestones from twenty-five years."},
          {href: "/about/chairman", label: "Leadership", title: "Chairman's message", description: "A message from our chairman."},
          {href: "/about/committees", label: "Governance", title: "Committees that turn participation into action.", description: "How committees support governance."},
        ]}
      />,
    );

    expect(document.querySelector(".rich-related-grid")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/about/history");
    expect(screen.getByRole("heading", {level: 3, name: "Our history"})).toBeVisible();
    expect(screen.getByText("Milestones from twenty-five years.")).toBeVisible();
  });
});
```

`tests/unit/about-related-routes.test.ts`

```ts
import {describe, expect, it, vi} from "vitest";

const translationState = vi.hoisted(() => ({messages: {} as Record<string, Record<string, string>>}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) => (key: string) => {
    const value = translationState.messages[namespace]?.[key];
    if (typeof value !== "string") throw new Error(`Missing test message: ${namespace}.${key}`);
    return value;
  }),
}));

describe("otherAboutRoutes", () => {
  it("excludes the current page and returns the other three, in a stable order", async () => {
    const {otherAboutRoutes} = await import("@/lib/about/related-routes");
    expect(otherAboutRoutes("about").map((route) => route.key)).toEqual(["history", "chairman", "committees"]);
    expect(otherAboutRoutes("history").map((route) => route.key)).toEqual(["about", "chairman", "committees"]);
    expect(otherAboutRoutes("chairman").map((route) => route.key)).toEqual(["about", "history", "committees"]);
    expect(otherAboutRoutes("committees").map((route) => route.key)).toEqual(["about", "history", "chairman"]);
  });
});

describe("buildOtherAboutRoutes", () => {
  it("reads each other route's real eyebrow/title/summary (or History's intro) from its own namespace", async () => {
    translationState.messages = {
      About: {
        eyebrow: "About WTIA",
        title: "A connected voice for wireless technology.",
        summary: "WTIA convenes members, partners and public stakeholders to advance Hong Kong's technology ecosystem.",
      },
      History: {
        eyebrow: "Since 2001",
        title: "Our history",
        intro: "Milestones from twenty-five years of building Hong Kong's wireless and technology industry.",
      },
      Chairman: {
        eyebrow: "Leadership",
        title: "Chairman's message",
        summary: "Working together to keep Hong Kong connected to emerging technology opportunities.",
      },
      Committees: {
        eyebrow: "Governance",
        title: "Committees that turn participation into action.",
        summary: "Member-led committees provide oversight and focused expertise across WTIA priorities.",
      },
    };
    const {buildOtherAboutRoutes} = await import("@/lib/about/related-routes");

    expect(await buildOtherAboutRoutes("en", "history")).toEqual([
      {href: "/about", label: "About WTIA", title: "A connected voice for wireless technology.", description: "WTIA convenes members, partners and public stakeholders to advance Hong Kong's technology ecosystem."},
      {href: "/about/chairman", label: "Leadership", title: "Chairman's message", description: "Working together to keep Hong Kong connected to emerging technology opportunities."},
      {href: "/about/committees", label: "Governance", title: "Committees that turn participation into action.", description: "Member-led committees provide oversight and focused expertise across WTIA priorities."},
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/rich-related-routes.test.tsx tests/unit/about-related-routes.test.ts`
Expected: FAIL with module-not-found errors for `@/components/wt/rich-related-routes` and `@/lib/about/related-routes`.

- [ ] **Step 3: Implement `components/wt/rich-related-routes.tsx`**

```tsx
import {Arrow} from '@/components/wt/arrow';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type RichRelatedRouteItem = Readonly<{href: string; label: string; title: string; description: string}>;

type RichRelatedRoutesProps = Readonly<{items: readonly RichRelatedRouteItem[]; className?: string}>;

// app/styles/wisetech.css:951 .rich-related-grid (3 columns); :952-957 the card grammar --
// label span first, h3/p in the middle, a trailing span last -- so the CSS's
// `>a>span:first-child` / `>a>span:last-child` selectors both resolve. Arrow already renders
// an aria-hidden <span>, so it is the correct trailing element without a bespoke one here.
export function RichRelatedRoutes({items, className}: RichRelatedRoutesProps) {
  return (
    <div className={cn('rich-related-grid', className)}>
      {items.map((item) => (
        <Link key={item.href} href={item.href}>
          <span>{item.label}</span>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <Arrow />
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement `lib/about/related-routes.ts`**

```ts
import {getTranslations} from 'next-intl/server';

import type {AppLocale} from '@/i18n/routing';

export type AboutRouteKey = 'about' | 'history' | 'chairman' | 'committees';

export type AboutRelatedRoute = Readonly<{href: string; label: string; title: string; description: string}>;

type AboutRouteRecord = Readonly<{key: AboutRouteKey; href: string; namespace: string; descriptionKey: 'summary' | 'intro'}>;

// Route identity only. Every string rendered for a route is read from that route's own,
// already-shipped namespace -- never authored fresh here. History alone calls its lead
// paragraph `intro` (see History.intro in messages/en.json); About/Chairman/Committees all
// use `summary`.
const routes: readonly AboutRouteRecord[] = [
  {key: 'about', href: '/about', namespace: 'About', descriptionKey: 'summary'},
  {key: 'history', href: '/about/history', namespace: 'History', descriptionKey: 'intro'},
  {key: 'chairman', href: '/about/chairman', namespace: 'Chairman', descriptionKey: 'summary'},
  {key: 'committees', href: '/about/committees', namespace: 'Committees', descriptionKey: 'summary'},
];

export function otherAboutRoutes(current: AboutRouteKey): readonly AboutRouteRecord[] {
  return routes.filter((route) => route.key !== current);
}

export async function buildOtherAboutRoutes(locale: AppLocale, current: AboutRouteKey): Promise<readonly AboutRelatedRoute[]> {
  return Promise.all(
    otherAboutRoutes(current).map(async (route) => {
      const t = await getTranslations({locale, namespace: route.namespace});
      return {href: route.href, label: t('eyebrow'), title: t('title'), description: t(route.descriptionKey)};
    }),
  );
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/rich-related-routes.test.tsx tests/unit/about-related-routes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/wt/rich-related-routes.tsx lib/about/related-routes.ts tests/unit/rich-related-routes.test.tsx tests/unit/about-related-routes.test.ts
git commit -m "$(cat <<'EOF'
feat: add RichRelatedRoutes and the About-family related-routes helper

Every page in Group C needs a related-routes footer linking the other three
About sub-pages. lib/about/related-routes.ts resolves each one's real
eyebrow/title/summary (History's own intro) from its own namespace rather
than duplicating that copy; components/wt/rich-related-routes.tsx renders
the result over the donor .rich-related-grid card grammar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `/about` rewrite — PageHero + RichCompass + rich-items-cards + manifesto

Current `/about` (`app/[locale]/(public)/about/page.tsx`) renders `InstitutionalPageIntro` then two `StorySection`s: the first wraps the three role cards (`connect`/`advance`/`represent`) in a plain Tailwind `grid gap-6 md:grid-cols-3`; the second nests the founding facts (`foundedTitle`/`foundedBody`) around the mission statement (`missionTitle`/`missionBody`) and the `historyLink` CTA. `messages/en.json`'s `About` namespace was read directly to confirm the exact strings before deciding how to redistribute them — nothing here is new copy, only new placement:

- The 3 role cards become `.rich-items-cards`.
- `missionTitle`/`missionBody` (the association's real, existing mission statement) move into a dedicated `.manifesto` block, verbatim — `missionBody` becomes the big serif statement, `missionTitle` its eyebrow.
- `foundedTitle`/`foundedBody` stay together as a small heading + paragraph inside the manifesto's second column, next to `historyLink` — none of this is dropped, only regrouped.
- `RichCompass` links to History/Chairman/Committees, reusing each page's own real `eyebrow`/`title` (no new copy).
- `RichRelatedRoutes` closes the page, linking the same three pages again as the group's mandated footer.

This is also the first Group C task to call `PageHero` with a `breadcrumb`, so it adds the one genuinely new, cross-page message key this group needs: `Common.breadcrumbHome` ("Home"). This key is likely needed by every other WP-4 group too (Events, Showcase, Membership, Launchpad, News, Contact all call `PageHero` with a breadcrumb) — if another group's task also adds it, the assembler should dedupe rather than duplicate the key.

**Files:**
- Modify: `app/[locale]/(public)/about/page.tsx`, `messages/en.json`, `messages/zh-HK.json`
- Delete: `tests/unit/institutional-pages.test.tsx` (its about/chairman/committees coverage moves to `tests/unit/wt-pages/*`, added in this task and Task 14)
- Create: `tests/unit/wt-pages/about.test.tsx`
- Test: `tests/unit/about-page.test.ts` (unmodified — see Step 6)

- [ ] **Step 1: Write the failing test**

`tests/unit/wt-pages/about.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ImgHTMLAttributes, ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

type Locale = "en" | "zh-HK";

const {translationState, setRequestLocaleSpy} = vi.hoisted(() => {
  const state = {locale: "en" as Locale, messages: {} as Record<string, Record<string, unknown>>};
  return {
    translationState: state,
    setRequestLocaleSpy: vi.fn((locale: Locale) => {
      state.locale = locale;
    }),
  };
});

const buildPageMetadataSpy = vi.hoisted(() => vi.fn((input: unknown) => input));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string, values?: Record<string, string | number>) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), value);
    };
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("@/lib/metadata", () => ({buildPageMetadata: buildPageMetadataSpy}));
vi.mock("next/image", () => ({
  default: ({alt, ...props}: ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

function renderWithIntl(locale: Locale, element: ReactElement) {
  render(<NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>);
}

describe("/about", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it.each([
    ["en", "/about/history", "/about/chairman", "/about/committees"],
    ["zh-HK", "/zh/about/history", "/zh/about/chairman", "/zh/about/committees"],
  ] as const)("renders the hero, compass, role cards, manifesto and related footer in %s", async (locale, historyHref, chairmanHref, committeesHref) => {
    const messages = locale === "en" ? en : zh;
    const {default: AboutPage} = await import("@/app/[locale]/(public)/about/page");
    renderWithIntl(locale, await AboutPage({params: Promise.resolve({locale})}));

    expect(setRequestLocaleSpy).toHaveBeenCalledExactlyOnceWith(locale);

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: messages.About.title})).toBeVisible();
    expect(screen.getByRole("img", {name: messages.About.imageAlt})).toHaveAttribute("src", "/images/about-hero.jpg");

    // Breadcrumb: the eyebrow text appears twice (hero eyebrow + breadcrumb current).
    expect(screen.getByRole("link", {name: messages.Common.breadcrumbHome})).toHaveAttribute("href", locale === "en" ? "/" : "/zh");
    expect(screen.getAllByText(messages.About.eyebrow)).toHaveLength(2);

    // Compass: 3 real links to the other About pages, using each page's own eyebrow/title.
    expect(screen.getByRole("link", {name: messages.History.title})).toHaveAttribute("href", historyHref);
    expect(screen.getByRole("link", {name: messages.Chairman.title})).toHaveAttribute("href", chairmanHref);
    expect(screen.getByRole("link", {name: messages.Committees.title})).toHaveAttribute("href", committeesHref);

    // Role cards, restyled into rich-items-cards.
    const cardsGrid = document.querySelector(".rich-items-cards");
    expect(cardsGrid).toBeInTheDocument();
    expect(within(cardsGrid as HTMLElement).getAllByRole("article")).toHaveLength(3);
    for (const role of ["connect", "advance", "represent"] as const) {
      expect(screen.getByRole("heading", {level: 3, name: messages.About[role].title})).toBeVisible();
      expect(screen.getByText(messages.About[role].description)).toBeVisible();
    }

    // Manifesto: the existing mission copy, re-homed verbatim, plus the founding facts and CTA.
    const manifesto = document.querySelector(".manifesto");
    expect(manifesto).toBeInTheDocument();
    const withinManifesto = within(manifesto as HTMLElement);
    expect(withinManifesto.getByRole("heading", {level: 2, name: messages.About.missionBody})).toBeVisible();
    expect(withinManifesto.getByText(messages.About.missionTitle)).toBeVisible();
    expect(withinManifesto.getByRole("heading", {level: 3, name: messages.About.foundedTitle})).toBeVisible();
    expect(withinManifesto.getByText(messages.About.foundedBody)).toBeVisible();
    expect(withinManifesto.getByRole("link", {name: new RegExp(messages.About.historyLink)})).toHaveAttribute("href", historyHref);

    // Related footer: the other three About pages, not /about itself.
    const related = document.querySelector(".rich-related-grid");
    expect(related).toBeInTheDocument();
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      historyHref, chairmanHref, committeesHref,
    ]);

    expect(document.querySelector('a[href^="/zh/zh"]')).not.toBeInTheDocument();
    expect(document.querySelector("main")).not.toBeInTheDocument();
  });

  it("preserves the exact metadata inputs", async () => {
    const {generateMetadata} = await import("@/app/[locale]/(public)/about/page");
    for (const locale of ["en", "zh-HK"] as const) {
      buildPageMetadataSpy.mockClear();
      const messages = locale === "en" ? en : zh;
      const expected = {locale, pathname: "/about", title: messages.About.metaTitle, description: messages.About.metaDescription, image: "/images/about-hero.jpg"};
      expect(await generateMetadata({params: Promise.resolve({locale})})).toEqual(expected);
      expect(buildPageMetadataSpy).toHaveBeenCalledExactlyOnceWith(expected);
    }
  });

  it("stays server-only on the RichPage primitives", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/about/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("RichCompass");
    expect(source).toContain("RichRelatedRoutes");
    expect(source).not.toContain("InstitutionalPageIntro");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
    expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/about.test.tsx`
Expected: FAIL — `messages.Common.breadcrumbHome` is `undefined` and the rendered page still uses `InstitutionalPageIntro`/`StorySection`, so `PageHero`/`RichCompass`/`.rich-items-cards`/`.manifesto`/`.rich-related-grid` are all absent.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Common.breadcrumbHome` | Home | 主頁 |

No other new keys: every string this page renders is already in `About`, `History`, `Chairman`, or `Committees`.

- [ ] **Step 4: Rewrite `app/[locale]/(public)/about/page.tsx`**

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {Arrow} from "@/components/wt/arrow";
import {Eyebrow} from "@/components/wt/eyebrow";
import {PageHero} from "@/components/wt/page-hero";
import {RichCompass} from "@/components/wt/rich-compass";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import {Section} from "@/components/wt/section";
import {SectionHeading} from "@/components/wt/section-heading";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "About"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about",
    title: t("metaTitle"),
    description: t("metaDescription"),
    image: "/images/about-hero.jpg",
  });
}

export default async function AboutPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("About");
  const common = await getTranslations({locale, namespace: "Common"});
  const history = await getTranslations({locale, namespace: "History"});
  const chairman = await getTranslations({locale, namespace: "Chairman"});
  const committees = await getTranslations({locale, namespace: "Committees"});
  const roles = ["connect", "advance", "represent"] as const;
  const related = await buildOtherAboutRoutes(locale as AppLocale, "about");

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("summary")}
        image={{src: "/images/about-hero.jpg", alt: t("imageAlt")}}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("eyebrow")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <RichCompass
        items={[
          {label: history("eyebrow"), value: history("title"), href: "/about/history"},
          {label: chairman("eyebrow"), value: chairman("title"), href: "/about/chairman"},
          {label: committees("eyebrow"), value: committees("title"), href: "/about/committees"},
        ]}
      />
      <Section labelledBy="about-role-title">
        <SectionHeading eyebrow={t("eyebrow")} title={t("historyTitle")} headingId="about-role-title" variant="split" lead={t("historyIntro")} />
        <div className="rich-items rich-items-cards">
          {roles.map((role, index) => (
            <article key={role}>
              <span className="rich-item-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{t(`${role}.title`)}</h3>
              <p>{t(`${role}.description`)}</p>
            </article>
          ))}
        </div>
      </Section>
      <section aria-labelledby="about-manifesto-title" className="manifesto">
        <div className="shell manifesto-grid">
          <div>
            <Eyebrow light>{t("missionTitle")}</Eyebrow>
            <h2 id="about-manifesto-title">{t("missionBody")}</h2>
          </div>
          <div className="manifesto-copy">
            <h3>{t("foundedTitle")}</h3>
            <p>{t("foundedBody")}</p>
            <Link className="text-link light-link" href="/about/history">
              {t("historyLink")} <Arrow />
            </Link>
          </div>
        </div>
      </section>
      <RichRelatedRoutes items={related} />
    </>
  );
}
```

- [ ] **Step 5: Delete `tests/unit/institutional-pages.test.tsx`**

Its about/chairman/committees coverage is superseded by `tests/unit/wt-pages/about.test.tsx` (this task) and `tests/unit/wt-pages/about-chairman-committees.test.tsx` (Task 14). Deleting it now (rather than leaving a stale file asserting the pre-WP4 shape) avoids a permanently-red test between this task and Task 14.

```bash
git rm tests/unit/institutional-pages.test.tsx
```

- [ ] **Step 6: Run the affected tests and confirm the new one passes and the old one still does**

Run: `npx vitest run tests/unit/wt-pages/about.test.tsx tests/unit/about-page.test.ts`
Expected: PASS for both — `about-page.test.ts` only pins the raw `About.*` message *values* (founding/mission facts, historyLink), all of which are unchanged, only re-homed in the new markup.

- [ ] **Step 7: Commit**

```bash
git add app/\[locale\]/\(public\)/about/page.tsx messages/en.json messages/zh-HK.json tests/unit/wt-pages/about.test.tsx
git commit -m "$(cat <<'EOF'
feat: rewrite /about onto the RichPage shell

PageHero + RichCompass (linking History/Chairman/Committees via each
page's own real eyebrow/title) + the 3 role cards restyled into
rich-items-cards + the existing mission statement re-homed verbatim into a
.manifesto block, alongside the founding facts and historyLink it displaced
from the old second StorySection + a RichRelatedRoutes footer. Adds the one
new cross-page key this group needs, Common.breadcrumbHome.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `/about/history` + `/about/history/[slug]` rewrite — RichCompass over real milestone facts

Both pages share the identical hero/compass treatment (Decision 1). The compass surfaces founding year, milestone count, and latest milestone year — all three derived from `content/milestones.ts` through the existing `milestonesOnly`/`byYearDescending` helpers in `lib/history/milestones.ts`, never hardcoded. `MilestoneTimeline` (list page) and `MediaGallery` (detail page) are kept exactly as they render today.

Reading `tests/unit/history-detail.test.ts` closely first: its `"renders one editorial story and the record gallery in %s"` test only asserts on the h1 (from `PageHero` now), the h2 text `storyTitle` (unchanged — this task keeps `t("storyTitle")` as the section's own heading text), the body paragraphs, and the gallery — none of which this rewrite changes, so that test needs **no changes**. Only the one test asserting the old primitive names in the file source needs replacing.

**Files:**
- Modify: `app/[locale]/(public)/about/history/page.tsx`, `app/[locale]/(public)/about/history/[slug]/page.tsx`, `lib/history/milestones.ts`, `messages/en.json`, `messages/zh-HK.json`
- Modify: `tests/unit/history-page.test.tsx` (2 named tests only), `tests/unit/history-detail.test.ts` (1 named test only), `tests/unit/history-milestones.test.ts` (append one test)
- Create: `tests/unit/wt-pages/about-history.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/history-milestones.test.ts` (inside the existing `describe("milestone derivations", ...)` block, after the last `it`):

```ts
  it("derives founding year, milestone count and latest year from real content only", () => {
    const list = [
      milestone({slug: "a", year: 2001, kind: "milestone"}),
      milestone({slug: "b", year: 2013, kind: "milestone"}),
      milestone({slug: "c", year: 2025, kind: "milestone"}),
      milestone({slug: "d", year: 2026, kind: "member-story"}),
    ];
    expect(historyCompassFacts(list)).toEqual({foundingYear: 2001, milestoneCount: 3, latestYear: 2025});
  });
```

And add `historyCompassFacts` to the file's import line:

```ts
import {byYearDescending, featuredOnly, findBySlug, historyCompassFacts, milestonesOnly} from "@/lib/history/milestones";
```

`tests/unit/wt-pages/about-history.test.tsx` (new file)

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ImgHTMLAttributes, ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {milestones} from "@/content/milestones";
import {historyCompassFacts, milestonesOnly} from "@/lib/history/milestones";

type Locale = "en" | "zh-HK";
const realFacts = historyCompassFacts(milestonesOnly(milestones));

const {translationState, setRequestLocaleSpy} = vi.hoisted(() => {
  const state = {locale: "en" as Locale, messages: {} as Record<string, Record<string, unknown>>};
  return {
    translationState: state,
    setRequestLocaleSpy: vi.fn((locale: Locale) => {
      state.locale = locale;
    }),
  };
});
const buildPageMetadataSpy = vi.hoisted(() => vi.fn((input: unknown) => input));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string, values?: Record<string, string | number>) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), value);
    };
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("@/lib/metadata", () => ({buildPageMetadata: buildPageMetadataSpy}));
vi.mock("next/image", () => ({
  default: ({alt, ...props}: ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

function renderWithIntl(locale: Locale, element: ReactElement) {
  render(<NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>);
}

describe("/about/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the hero and a compass of the real founding year, milestone count and latest year", async () => {
    const {default: HistoryPage} = await import("@/app/[locale]/(public)/about/history/page");
    renderWithIntl("en", await HistoryPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: en.History.title})).toBeVisible();
    const compass = document.querySelector(".rich-compass-grid");
    expect(compass?.textContent).toContain(String(realFacts.foundingYear));
    expect(compass?.textContent).toContain(String(realFacts.milestoneCount));
    expect(compass?.textContent).toContain(String(realFacts.latestYear));
    expect(document.querySelectorAll(".rich-compass-grid>div")).toHaveLength(3);
  });

  it("keeps a RichRelatedRoutes footer to the other three About pages", async () => {
    const {default: HistoryPage} = await import("@/app/[locale]/(public)/about/history/page");
    renderWithIntl("en", await HistoryPage({params: Promise.resolve({locale: "en"})}));

    const related = document.querySelector(".rich-related-grid");
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about", "/about/chairman", "/about/committees",
    ]);
  });

  it("gives the featured detail page the identical hero/compass treatment as the list page", async () => {
    const gallerySlug = "wtia-21st-anniversary-celebration-and-inauguration-gala-dinner";
    const {default: HistoryDetailPage} = await import("@/app/[locale]/(public)/about/history/[slug]/page");
    render(await HistoryDetailPage({params: Promise.resolve({locale: "en", slug: gallerySlug})}));

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    const compass = document.querySelector(".rich-compass-grid");
    expect(compass?.textContent).toContain(String(realFacts.foundingYear));
    expect(compass?.textContent).toContain(String(realFacts.milestoneCount));
    expect(compass?.textContent).toContain(String(realFacts.latestYear));
  });

  it("stays server-only on the RichPage primitives", () => {
    for (const file of ["app/[locale]/(public)/about/history/page.tsx", "app/[locale]/(public)/about/history/[slug]/page.tsx"]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain("PageHero");
      expect(source).toContain("RichCompass");
      expect(source).not.toContain("InstitutionalPageIntro");
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/<main\b/);
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/history-milestones.test.ts tests/unit/wt-pages/about-history.test.tsx`
Expected: FAIL — `historyCompassFacts` does not exist yet, and neither page renders `PageHero`/`RichCompass`/`RichRelatedRoutes`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `History.compass.foundedLabel` | Founding year | 成立年份 |
| `History.compass.foundedValue` | `{year}` | `{year}` |
| `History.compass.milestonesLabel` | Milestones recorded | 已記錄的里程碑 |
| `History.compass.milestonesValue` | `{count, plural, one {# milestone} other {# milestones}}` | `{count} 個里程碑` |
| `History.compass.latestLabel` | Most recent milestone | 最新記錄 |
| `History.compass.latestValue` | `{year}` | `{year}年` |

- [ ] **Step 4: Add `historyCompassFacts` to `lib/history/milestones.ts`**

Append to the file (after `findBySlug`):

```ts
export type HistoryCompassFacts = Readonly<{foundingYear: number; milestoneCount: number; latestYear: number}>;

/**
 * Real facts only: derived from whatever `milestonesOnly` list is handed in, never a
 * hardcoded "since 2001" -- if the archive ever gained an earlier record, this would move
 * with it rather than silently disagreeing with the timeline below it.
 */
export function historyCompassFacts(milestones: readonly MilestoneRecord[]): HistoryCompassFacts {
  const years = milestones.map(({year}) => year);
  return {
    foundingYear: Math.min(...years),
    milestoneCount: milestones.length,
    latestYear: Math.max(...years),
  };
}
```

- [ ] **Step 5: Rewrite `app/[locale]/(public)/about/history/page.tsx`**

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MilestoneTimeline} from "@/components/marketing/milestone-timeline";
import {PageHero} from "@/components/wt/page-hero";
import {RichCompass} from "@/components/wt/rich-compass";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import {milestones} from "@/content/milestones";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {historyCompassFacts, milestonesOnly} from "@/lib/history/milestones";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "History"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about/history",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

// No `dynamic` export: this reads typed content bundled at build time, not a database.
export default async function HistoryPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("History");
  const common = await getTranslations({locale, namespace: "Common"});
  const history = milestonesOnly(milestones);
  const facts = historyCompassFacts(history);
  const related = await buildOtherAboutRoutes(locale as AppLocale, "history");

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("intro")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("eyebrow")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <RichCompass
        items={[
          {label: t("compass.foundedLabel"), value: t("compass.foundedValue", {year: facts.foundingYear})},
          {label: t("compass.milestonesLabel"), value: t("compass.milestonesValue", {count: facts.milestoneCount})},
          {label: t("compass.latestLabel"), value: t("compass.latestValue", {year: facts.latestYear})},
        ]}
      />
      <MilestoneTimeline locale={locale as AppLocale} readMoreLabel={t("readMore")} milestones={history} />
      <RichRelatedRoutes items={related} />
    </>
  );
}
```

- [ ] **Step 6: Rewrite `app/[locale]/(public)/about/history/[slug]/page.tsx`**

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {MediaGallery} from "@/components/marketing/media-gallery";
import {PageHero} from "@/components/wt/page-hero";
import {RichCompass} from "@/components/wt/rich-compass";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import {Section} from "@/components/wt/section";
import {SectionHeading} from "@/components/wt/section-heading";
import {milestones} from "@/content/milestones";
import type {MilestoneRecord} from "@/content/schemas";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {featuredOnly, findBySlug, historyCompassFacts, milestonesOnly} from "@/lib/history/milestones";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string; slug: string}>};

export function generateStaticParams() {
  return featuredOnly(milestonesOnly(milestones)).map(({slug}) => ({slug}));
}

function resolveFeaturedMilestone(slug: string): MilestoneRecord | null {
  const milestone = findBySlug(milestones, slug);
  return milestone && milestone.kind === "milestone" && milestone.featured ? milestone : null;
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const milestone = resolveFeaturedMilestone(slug);
  if (!milestone) return {};

  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: `/about/history/${slug}`,
    title: locale === "zh-HK" ? milestone.titleZh : milestone.titleEn,
    description: (locale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn).slice(0, 160),
  });
}

// No `dynamic` export: like /about/history, this reads typed content bundled at build time.
export default async function HistoryDetailPage({params}: Props) {
  const {locale, slug} = await params;
  const milestone = resolveFeaturedMilestone(slug);
  if (!milestone) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("History");
  const common = await getTranslations({locale, namespace: "Common"});
  // Decision 1: identical hero/compass treatment to the list page, so the same real facts.
  const facts = historyCompassFacts(milestonesOnly(milestones));
  const related = await buildOtherAboutRoutes(locale as AppLocale, "history");

  const title = locale === "zh-HK" ? milestone.titleZh : milestone.titleEn;
  const body = locale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn;
  const paragraphs = body.split("\n\n");
  const images = milestone.images.map((image) => ({
    alt: locale === "zh-HK" ? image.altZh : image.altEn,
    src: image.src,
  }));

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={String(milestone.year)}
        title={title}
        lead={paragraphs[0] ?? body}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: title}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <RichCompass
        items={[
          {label: t("compass.foundedLabel"), value: t("compass.foundedValue", {year: facts.foundingYear})},
          {label: t("compass.milestonesLabel"), value: t("compass.milestonesValue", {count: facts.milestoneCount})},
          {label: t("compass.latestLabel"), value: t("compass.latestValue", {year: facts.latestYear})},
        ]}
      />
      <Section labelledBy="history-story-title">
        <SectionHeading eyebrow={t("eyebrow")} title={t("storyTitle")} headingId="history-story-title" variant="stacked" />
        <div className="max-w-3xl space-y-6 text-lg leading-relaxed text-muted-foreground">
          {paragraphs.slice(1).map((paragraph, index) => (
            // Paragraphs belong to one frozen content record and never reorder.
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {images.length > 0 ? (
          <div className="mt-12">
            <MediaGallery images={images} />
          </div>
        ) : null}
      </Section>
      <RichRelatedRoutes items={related} />
    </>
  );
}
```

- [ ] **Step 7: Update the one obsolete test in `tests/unit/history-page.test.tsx`**

Replace the test named `"uses the pinned %s History strings in one institutional intro before the timeline"` with:

```tsx
  it.each(["en", "zh-HK"] as const)(
    "uses the pinned %s History strings across the hero and compass, before the timeline",
    async (locale) => {
      const {default: HistoryPage} = await import("@/app/[locale]/(public)/about/history/page");
      const page = await HistoryPage({params: Promise.resolve({locale})});
      renderWithIntl(locale, page);

      const expected = approvedHistory[locale];
      expect(setRequestLocaleSpy).toHaveBeenCalledExactlyOnceWith(locale);
      expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
      expect(screen.getByRole("heading", {level: 1, name: expected.title})).toBeVisible();
      expect(screen.getAllByText(expected.eyebrow).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(expected.intro)).toBeVisible();
      expect(screen.getAllByRole("heading", {level: 2}).map(({textContent}) => textContent)).toEqual(["2010"]);
      expect(screen.getByText(locale === "en" ? "Body EN" : "正文")).toBeVisible();
      expect(document.querySelectorAll(".rich-compass-grid>div")).toHaveLength(3);
      expect(document.querySelector("main")).not.toBeInTheDocument();
    },
  );
```

And replace the test named `"keeps the list route and timeline server-only on the new presentation primitive"` with:

```tsx
  it("keeps the list route and timeline server-only on the RichPage shell", () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), "app/[locale]/(public)/about/history/page.tsx"),
      "utf8",
    );
    const timelineSource = readFileSync(
      resolve(process.cwd(), "components/marketing/milestone-timeline.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("PageHero");
    expect(pageSource).toContain("RichCompass");
    expect(pageSource).not.toContain("InstitutionalPageIntro");
    for (const source of [pageSource, timelineSource]) {
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/<main\b/);
      expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
    }
  });
```

No other test in this file changes — `"passes the timeline only kind: milestone entries"` and `"preserves exact localized list metadata inputs without adding an image"` are untouched, and `describe("milestone timeline", ...)` (which tests `MilestoneTimeline` directly, an unchanged component) is untouched.

- [ ] **Step 8: Update the one obsolete test in `tests/unit/history-detail.test.ts`**

Replace the test named `"keeps the detail route server-only and composed from all three Task 4 primitives"` with:

```ts
    it("keeps the detail route server-only, composed from PageHero, RichCompass and MediaGallery", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/[locale]/(public)/about/history/[slug]/page.tsx"),
      "utf8",
    );

    expect(source).toContain("PageHero");
    expect(source).toContain("RichCompass");
    expect(source).toContain("MediaGallery");
    expect(source).not.toContain("InstitutionalPageIntro");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
    expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
  });
```

No other test in this file changes — the milestone-content and gallery-image assertions are untouched by this restyle.

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wt-pages/about-history.test.tsx tests/unit/history-page.test.tsx tests/unit/history-detail.test.ts tests/unit/history-milestones.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add app/\[locale\]/\(public\)/about/history/page.tsx app/\[locale\]/\(public\)/about/history/\[slug\]/page.tsx lib/history/milestones.ts messages/en.json messages/zh-HK.json tests/unit/wt-pages/about-history.test.tsx tests/unit/history-page.test.tsx tests/unit/history-detail.test.ts tests/unit/history-milestones.test.ts
git commit -m "$(cat <<'EOF'
feat: rewrite /about/history and /about/history/[slug] onto the RichPage shell

Decision 1: identical hero/compass treatment for both the list and detail
pages. RichCompass surfaces the real founding year, milestone count and
latest year via a new historyCompassFacts() derivation
(lib/history/milestones.ts), never hardcoded, so if the archive ever
gained an earlier record this would move with it. MilestoneTimeline and
MediaGallery are kept exactly as they render today.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: `/about/chairman` and `/about/committees` rewrite — RichPage shell, no fabricated compass

Neither page gets a RichCompass: Chairman is a single unattributed message and Committees is a fixed set of three cards, so there is nothing real for a quick-link/stat grid to link to,
or a real stat to surface (there is no committee roster, meeting cadence, or count beyond the fixed three the page already lists). Per the design's own explicit instruction, both pages get the lighter shell with **no** `RichCompass` — manufacturing a 3-item grid with no real content behind it would be the same dishonesty `HonestEmpty` exists to prevent elsewhere in this programme. Chairman's blockquote stays prose inside `StorySection` (unchanged component); Committees' three cards convert to `.rich-items-cards`. Both keep the `RichRelatedRoutes` footer, since that is mandated on every page in this group regardless of compass usage.

**Files:**
- Modify: `app/[locale]/(public)/about/chairman/page.tsx`, `app/[locale]/(public)/about/committees/page.tsx`
- Create: `tests/unit/wt-pages/about-chairman-committees.test.tsx`

(`tests/unit/institutional-pages.test.tsx`, which previously covered these two pages, was already deleted in Task 12.)

- [ ] **Step 1: Write the failing test**

`tests/unit/wt-pages/about-chairman-committees.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

type Locale = "en" | "zh-HK";

const {translationState, setRequestLocaleSpy} = vi.hoisted(() => {
  const state = {locale: "en" as Locale, messages: {} as Record<string, Record<string, unknown>>};
  return {
    translationState: state,
    setRequestLocaleSpy: vi.fn((locale: Locale) => {
      state.locale = locale;
    }),
  };
});
const buildPageMetadataSpy = vi.hoisted(() => vi.fn((input: unknown) => input));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return value;
    };
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("@/lib/metadata", () => ({buildPageMetadata: buildPageMetadataSpy}));

function renderWithIntl(locale: Locale, element: ReactElement) {
  render(<NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>);
}

describe("/about/chairman", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the hero and the unattributed message, with no compass and no card grid", async () => {
    const {default: ChairmanPage} = await import("@/app/[locale]/(public)/about/chairman/page");
    renderWithIntl("en", await ChairmanPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: en.Chairman.title})).toBeVisible();
    const quote = screen.getByRole("blockquote");
    expect(within(quote).getByText(en.Chairman.message)).toBeVisible();
    expect(within(quote).getByText(en.Chairman.signature).tagName).toBe("CITE");
    expect(document.querySelector(".rich-compass")).not.toBeInTheDocument();
    expect(document.querySelector(".rich-items-cards")).not.toBeInTheDocument();
    const related = document.querySelector(".rich-related-grid");
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about", "/about/history", "/about/committees",
    ]);
  });

  it("stays server-only, keeping StorySection for the prose message", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/about/chairman/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("StorySection");
    expect(source).not.toContain("RichCompass");
    expect(source).not.toContain("InstitutionalPageIntro");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
  });
});

describe("/about/committees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the hero and exactly the three committee cards, with no compass", async () => {
    const {default: CommitteesPage} = await import("@/app/[locale]/(public)/about/committees/page");
    renderWithIntl("en", await CommitteesPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: en.Committees.title})).toBeVisible();
    const cardsGrid = document.querySelector(".rich-items-cards");
    expect(cardsGrid).toBeInTheDocument();
    expect(within(cardsGrid as HTMLElement).getAllByRole("article")).toHaveLength(3);
    for (const committee of ["executive", "innovation", "membership"] as const) {
      expect(screen.getByRole("heading", {level: 3, name: en.Committees[committee].title})).toBeVisible();
      expect(screen.getByText(en.Committees[committee].description)).toBeVisible();
    }
    expect(document.querySelector(".rich-compass")).not.toBeInTheDocument();
    const related = document.querySelector(".rich-related-grid");
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about", "/about/history", "/about/chairman",
    ]);
  });

  it("stays server-only on rich-items-cards, with no manufactured compass", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/about/committees/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("rich-items-cards");
    expect(source).not.toContain("RichCompass");
    expect(source).not.toContain("InstitutionalPageIntro");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/about-chairman-committees.test.tsx`
Expected: FAIL — both pages still render `InstitutionalPageIntro`, not `PageHero`, and no `.rich-related-grid` exists.

- [ ] **Step 3: Rewrite `app/[locale]/(public)/about/chairman/page.tsx`**

No new message keys — nothing here is new copy.

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {StorySection} from "@/components/marketing/story-section";
import {PageHero} from "@/components/wt/page-hero";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Chairman"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about/chairman",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function ChairmanPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Chairman");
  const common = await getTranslations({locale, namespace: "Common"});
  // No RichCompass: a single unattributed message has nothing to link or count (restraint,
  // the same instinct HonestEmpty applies elsewhere -- don't manufacture a 3-item grid here).
  const related = await buildOtherAboutRoutes(locale as AppLocale, "chairman");

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("summary")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("eyebrow")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <StorySection heading={t("messageTitle")} tone="warm">
        <blockquote className="max-w-3xl border-l-4 border-primary pl-6 text-xl leading-relaxed">
          <p>{t("message")}</p>
          <footer className="mt-6 font-semibold">
            <cite className="not-italic">{t("signature")}</cite>
          </footer>
        </blockquote>
      </StorySection>
      <RichRelatedRoutes items={related} />
    </>
  );
}
```

- [ ] **Step 4: Rewrite `app/[locale]/(public)/about/committees/page.tsx`**

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {PageHero} from "@/components/wt/page-hero";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import {Section} from "@/components/wt/section";
import {SectionHeading} from "@/components/wt/section-heading";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Committees"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about/committees",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function CommitteesPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Committees");
  const common = await getTranslations({locale, namespace: "Common"});
  const committees = ["executive", "innovation", "membership"] as const;
  // No RichCompass: three fixed committees with no roster or cadence to count or link to
  // (restraint, the same instinct HonestEmpty applies elsewhere).
  const related = await buildOtherAboutRoutes(locale as AppLocale, "committees");

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("summary")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("eyebrow")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <Section labelledBy="committees-structure-title">
        <SectionHeading eyebrow={t("eyebrow")} title={t("structureTitle")} headingId="committees-structure-title" variant="stacked" />
        <div className="rich-items rich-items-cards">
          {committees.map((committee, index) => (
            <article key={committee}>
              <span className="rich-item-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{t(`${committee}.title`)}</h3>
              <p>{t(`${committee}.description`)}</p>
            </article>
          ))}
        </div>
      </Section>
      <RichRelatedRoutes items={related} />
    </>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/wt-pages/about-chairman-committees.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/\[locale\]/\(public\)/about/chairman/page.tsx app/\[locale\]/\(public\)/about/committees/page.tsx tests/unit/wt-pages/about-chairman-committees.test.tsx
git commit -m "$(cat <<'EOF'
feat: rewrite /about/chairman and /about/committees onto the RichPage shell

Neither page gets a RichCompass: Chairman is a single unattributed message
and Committees is a fixed set of three cards, neither has anything real to
link or count, so a manufactured 3-item grid would be dishonest the same
way HonestEmpty prevents elsewhere. Committees' three cards restyle into
rich-items-cards; Chairman's blockquote stays inside the unchanged
StorySection component. Both keep the mandated RichRelatedRoutes footer.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: `/programs/{asa,tct,hkict}` rewrite — ProgrammeRecordPage header, ProgramEditions unchanged

The donor's "programme-type eyebrow, audience, one key fact, source-link action" header is built from `PageHero` (eyebrow = programme type) plus a 3-item `RichCompass` (key fact, audience, and the "ask the programme team" `mailto:` action — reinterpreted from the donor's source-link, since none of `content/schemas.ts`'s four programme schemas carries a source-URL field; the real available action per D-6 is a `mailto:`). The "one key fact" reuses `summarizeProgrammes()` (already built in `lib/home/programme-summaries.ts` for the homepage) rather than recomputing edition counts — the homepage card and this page header describe the same fact about the same programme, so they read it from the same place. `ProgramEditions` is kept exactly as each of these three pages already uses it. `ProgramDetail` (the old `InstitutionalPageIntro` + status `StorySection` wrapper) is fully superseded by `PageHero` + a standalone `StorySection` for the still-real "Current status" copy, so it is deleted rather than left with no caller.

**Files:**
- Modify: `app/[locale]/(public)/programs/asa/page.tsx`, `.../hkict/page.tsx`, `.../tct/page.tsx`, `messages/en.json`, `messages/zh-HK.json`
- Delete: `components/marketing/program-detail.tsx`
- Modify: `tests/unit/program-presentation.test.tsx` (remove 1 test, replace 1 test)
- Create: `lib/programs/programme-header.ts`, `tests/unit/programme-header.test.ts`, `tests/unit/wt-pages/programs-editions.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/programme-header.test.ts`

```ts
import {describe, expect, it} from "vitest";

import {summarizeProgrammes} from "@/lib/home/programme-summaries";
import {buildProgrammeHeaderFacts} from "@/lib/programs/programme-header";

function fakeT(key: string, values?: Record<string, string | number>) {
  const templates: Record<string, string> = {
    eventSeriesLabel: "Event series",
    credentialLabel: "Credential",
    editionsFact: "{count} editions since {year}",
    credentialFact: "Issued directly by WTIA",
    mailSubject: "{programme} programme enquiry",
  };
  return Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), templates[key]!);
}

describe("buildProgrammeHeaderFacts", () => {
  it("states an event series's real edition count and latest year, reused from summarizeProgrammes", () => {
    const asa = summarizeProgrammes().find((programme) => programme.id === "asa")!;
    const facts = buildProgrammeHeaderFacts(asa, fakeT, "Asia Smart App Awards");

    expect(facts.typeLabel).toBe("Event series");
    expect(facts.fact).toBe(`${asa.editionCount} editions since ${asa.latestYear}`);
    expect(facts.mailSubject).toBe("Asia Smart App Awards programme enquiry");
  });

  it("states cpai as a credential with no edition count", () => {
    const cpai = summarizeProgrammes().find((programme) => programme.id === "cpai")!;
    const facts = buildProgrammeHeaderFacts(cpai, fakeT, "CPAI");

    expect(facts.typeLabel).toBe("Credential");
    expect(facts.fact).toBe("Issued directly by WTIA");
    expect(facts.mailSubject).toBe("CPAI programme enquiry");
  });
});
```

`tests/unit/wt-pages/programs-editions.test.tsx` (new file)

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ImgHTMLAttributes, ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {asa} from "@/content/programs/asa";
import {summarizeProgrammes} from "@/lib/home/programme-summaries";

type Locale = "en" | "zh-HK";

const {translationState, setRequestLocaleSpy} = vi.hoisted(() => {
  const state = {locale: "en" as Locale, messages: {} as Record<string, Record<string, unknown>>};
  return {
    translationState: state,
    setRequestLocaleSpy: vi.fn((locale: Locale) => {
      state.locale = locale;
    }),
  };
});
const buildPageMetadataSpy = vi.hoisted(() => vi.fn((input: unknown) => input));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string, values?: Record<string, string | number>) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), value);
    };
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("@/lib/metadata", () => ({buildPageMetadata: buildPageMetadataSpy}));
vi.mock("next/image", () => ({
  default: ({alt, ...props}: ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

function renderWithIntl(locale: Locale, element: ReactElement) {
  render(<NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>);
}

describe("/programs/asa (representative of asa/hkict/tct)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the ProgrammeRecordPage header (type eyebrow, key fact, audience, mailto action) and keeps ProgramEditions below", async () => {
    const {default: AsaPage} = await import("@/app/[locale]/(public)/programs/asa/page");
    renderWithIntl("en", await AsaPage({params: Promise.resolve({locale: "en"})}));

    const summary = summarizeProgrammes().find((programme) => programme.id === "asa")!;
    expect(screen.getByRole("heading", {level: 1, name: en.programs.asa.title})).toBeVisible();
    const compass = document.querySelector(".rich-compass-grid");
    expect(compass?.textContent).toContain(String(summary.editionCount));
    expect(compass?.textContent).toContain(String(summary.latestYear));
    expect(compass?.textContent).toContain(en.programs.asa.audience);
    const mailLink = screen.getByRole("link", {name: en.programs.record.askProgrammeTeam});
    expect(mailLink.getAttribute("href")).toMatch(/^mailto:contact@hkwtia\.org\?subject=/);

    expect(screen.getByText(en.programs.record.statusHeading)).toBeVisible();
    expect(screen.getByText(en.programs.asa.status)).toBeVisible();

    expect(screen.getByRole("heading", {level: 2, name: en.programs.record.editionsHeading})).toBeVisible();
    expect(screen.getAllByRole("heading", {level: 3}).map(({textContent}) => textContent)).toEqual(
      asa.editions.map((edition) => edition.labelEn),
    );
  });

  it("stays server-only, without the retired ProgramDetail wrapper", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/programs/asa/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("RichCompass");
    expect(source).toContain("ProgramEditions");
    expect(source).not.toContain("ProgramDetail");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/programme-header.test.ts tests/unit/wt-pages/programs-editions.test.tsx`
Expected: FAIL — `lib/programs/programme-header.ts` doesn't exist, and `/programs/asa` still renders `ProgramDetail`, not `PageHero`/`RichCompass`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `programs.record.eventSeriesLabel` | Event series | 活動系列 |
| `programs.record.credentialLabel` | Credential | 專業資格 |
| `programs.record.compassFactLabel` | Track record | 往績 |
| `programs.record.compassAudienceLabel` | Who it's for | 適合對象 |
| `programs.record.compassActionLabel` | Get in touch | 聯絡方式 |
| `programs.record.askProgrammeTeam` | Ask the programme team | 聯絡計劃團隊 |
| `programs.record.editionsFact` | `{count, plural, one {# edition} other {# editions}} since {year}` | `自 {year} 年起共 {count} 屆` |
| `programs.record.credentialFact` | Issued directly by WTIA | 由 WTIA 直接頒發 |
| `programs.record.mailSubject` | `{programme} programme enquiry` | `查詢「{programme}」計劃` |
| `programs.asa.audience` | Smart application teams and developers competing across Asia. | 參與亞洲賽事的智能應用程式開發團隊。 |
| `programs.hkict.audience` | Hong Kong technology companies and public-sector innovators. | 香港科技企業及公共機構的創新團隊。 |
| `programs.tct.audience` | SME leaders exploring practical, hands-on technology adoption. | 希望實踐科技應用的中小企領袖。 |

- [ ] **Step 4: Implement `lib/programs/programme-header.ts`**

```ts
import type {ProgrammeSummary} from '@/lib/home/programme-summaries';

export type ProgrammeHeaderFacts = Readonly<{typeLabel: string; fact: string; mailSubject: string}>;

// Reuses summarizeProgrammes()'s own editionCount/latestYear/type rather than recomputing
// them: the homepage's programme-showcase card and this page's own header describe the exact
// same fact about the exact same programme, so both read it from one place.
export function buildProgrammeHeaderFacts(
  summary: ProgrammeSummary,
  t: (key: string, values?: Record<string, string | number>) => string,
  programmeName: string,
): ProgrammeHeaderFacts {
  const typeLabel = summary.type === 'credential' ? t('credentialLabel') : t('eventSeriesLabel');
  const fact =
    summary.type === 'credential'
      ? t('credentialFact')
      : t('editionsFact', {count: summary.editionCount ?? 0, year: summary.latestYear ?? ''});
  return {typeLabel, fact, mailSubject: t('mailSubject', {programme: programmeName})};
}
```

- [ ] **Step 5: Rewrite `app/[locale]/(public)/programs/asa/page.tsx`** (hkict and tct follow the identical pattern in Step 6/7)

```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {StorySection} from '@/components/marketing/story-section';
import {
  localiseImages,
  localiseWinners,
  ProgramEditions
} from '@/components/marketing/program-editions';
import {PageHero} from '@/components/wt/page-hero';
import {RichCompass} from '@/components/wt/rich-compass';
import {siteConfig} from '@/config/site';
import {programs} from '@/content/programs';
import {AGENCIES} from '@/content/programs/agencies';
import {asa} from '@/content/programs/asa';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';
import {buildPageMetadata} from '@/lib/metadata';
import {buildProgrammeHeaderFacts} from '@/lib/programs/programme-header';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'asa')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/asa', title: t('title'), description: t('description'), image: program.image});
}

export default async function AsaPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: program.namespace});
  const tr = await getTranslations({locale, namespace: 'programs.record'});
  const common = await getTranslations({locale, namespace: 'Common'});
  const zh = locale === 'zh-HK';

  const summary = summarizeProgrammes().find((item) => item.id === 'asa')!;
  const facts = buildProgrammeHeaderFacts(summary, tr, t('title'));
  const mailto = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(facts.mailSubject)}`;

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={facts.typeLabel}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('title')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <RichCompass
        items={[
          {label: tr('compassFactLabel'), value: facts.fact},
          {label: tr('compassAudienceLabel'), value: t('audience')},
          {label: tr('compassActionLabel'), value: tr('askProgrammeTeam'), href: mailto},
        ]}
      />
      <StorySection heading={tr('statusHeading')} tone="warm">
        <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{t('status')}</p>
      </StorySection>
      <ProgramEditions
        categoryHeading={tr('categoryHeading')}
        editionsHeading={tr('editionsHeading')}
        winnersHeading={tr('winnersHeading')}
        winnersOffSite={tr('winnersOffSite')}
        winnersOffSiteLink={tr('winnersOffSiteLink')}
        winnersUnrecorded={tr('winnersUnrecorded')}
        editions={asa.editions.map((edition) => {
          const lines: string[] = [];
          if (edition.funder.kind === 'named') {
            const agency = zh ? AGENCIES[edition.funder.agency].nameZh : AGENCIES[edition.funder.agency].nameEn;
            lines.push(
              edition.funder.initiative
                ? tr('fundedBy', {agency, initiative: zh ? edition.funder.initiative.zh : edition.funder.initiative.en})
                : tr('fundedByAgency', {agency})
            );
          }
          if (edition.regions.kind !== 'unrecorded') {
            lines.push(tr(edition.regions.kind === 'attended' ? 'regionsAttended' : 'regionsCoOrganised', {count: edition.regions.count}));
          }
          return {
            heading: zh ? edition.labelZh : edition.labelEn,
            lines,
            winners: localiseWinners(edition.winners, zh),
            images: localiseImages(edition.images, zh)
          };
        })}
      />
    </>
  );
}
```

- [ ] **Step 6: Rewrite `app/[locale]/(public)/programs/hkict/page.tsx`**

```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {StorySection} from '@/components/marketing/story-section';
import {
  localiseImages,
  localiseWinners,
  ProgramEditions
} from '@/components/marketing/program-editions';
import {PageHero} from '@/components/wt/page-hero';
import {RichCompass} from '@/components/wt/rich-compass';
import {siteConfig} from '@/config/site';
import {programs} from '@/content/programs';
import {AGENCIES} from '@/content/programs/agencies';
import {hkict} from '@/content/programs/hkict';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';
import {buildPageMetadata} from '@/lib/metadata';
import {buildProgrammeHeaderFacts} from '@/lib/programs/programme-header';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'hkict')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/hkict', title: t('title'), description: t('description'), image: program.image});
}

export default async function HkictPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: program.namespace});
  const tr = await getTranslations({locale, namespace: 'programs.record'});
  const common = await getTranslations({locale, namespace: 'Common'});
  const zh = locale === 'zh-HK';

  const summary = summarizeProgrammes().find((item) => item.id === 'hkict')!;
  const facts = buildProgrammeHeaderFacts(summary, tr, t('title'));
  const mailto = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(facts.mailSubject)}`;

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={facts.typeLabel}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('title')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <RichCompass
        items={[
          {label: tr('compassFactLabel'), value: facts.fact},
          {label: tr('compassAudienceLabel'), value: t('audience')},
          {label: tr('compassActionLabel'), value: tr('askProgrammeTeam'), href: mailto},
        ]}
      />
      <StorySection heading={tr('statusHeading')} tone="warm">
        <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{t('status')}</p>
      </StorySection>
      <ProgramEditions
        categoryHeading={tr('categoryHeading')}
        editionsHeading={tr('editionsHeading')}
        winnersHeading={tr('winnersHeading')}
        winnersOffSite={tr('winnersOffSite')}
        winnersOffSiteLink={tr('winnersOffSiteLink')}
        winnersUnrecorded={tr('winnersUnrecorded')}
        editions={hkict.editions.map((edition) => ({
          heading: String(edition.year),
          lines: [
            tr('organisedFor', {
              agency: zh ? AGENCIES[edition.organisedFor].nameZh : AGENCIES[edition.organisedFor].nameEn
            })
          ],
          winners: localiseWinners(edition.winners, zh),
          images: localiseImages(edition.images, zh)
        }))}
      />
    </>
  );
}
```

- [ ] **Step 7: Rewrite `app/[locale]/(public)/programs/tct/page.tsx`**

```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {StorySection} from '@/components/marketing/story-section';
import {localiseImages, ProgramEditions} from '@/components/marketing/program-editions';
import {PageHero} from '@/components/wt/page-hero';
import {RichCompass} from '@/components/wt/rich-compass';
import {siteConfig} from '@/config/site';
import {programs} from '@/content/programs';
import {tct} from '@/content/programs/tct';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';
import {buildPageMetadata} from '@/lib/metadata';
import {buildProgrammeHeaderFacts} from '@/lib/programs/programme-header';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'tct')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/tct', title: t('title'), description: t('description'), image: program.image});
}

export default async function TctPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: program.namespace});
  const tr = await getTranslations({locale, namespace: 'programs.record'});
  const common = await getTranslations({locale, namespace: 'Common'});
  const zh = locale === 'zh-HK';

  const summary = summarizeProgrammes().find((item) => item.id === 'tct')!;
  const facts = buildProgrammeHeaderFacts(summary, tr, t('title'));
  const mailto = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(facts.mailSubject)}`;

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={facts.typeLabel}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('title')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <RichCompass
        items={[
          {label: tr('compassFactLabel'), value: facts.fact},
          {label: tr('compassAudienceLabel'), value: t('audience')},
          {label: tr('compassActionLabel'), value: tr('askProgrammeTeam'), href: mailto},
        ]}
      />
      <StorySection heading={tr('statusHeading')} tone="warm">
        <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{t('status')}</p>
      </StorySection>
      <ProgramEditions
        categoryHeading={tr('categoryHeading')}
        editionsHeading={tr('editionsHeading')}
        winnersHeading={tr('winnersHeading')}
        winnersOffSite={tr('winnersOffSite')}
        winnersOffSiteLink={tr('winnersOffSiteLink')}
        winnersUnrecorded={tr('winnersUnrecorded')}
        editions={tct.editions.map((edition) => {
          const lines: string[] = [];
          if (edition.funder.kind === 'named') {
            lines.push(tr('fundedByScheme', {scheme: zh ? edition.funder.schemeZh : edition.funder.schemeEn}));
          }
          lines.push(zh ? edition.shapeZh : edition.shapeEn);
          return {
            heading: zh ? edition.labelZh : edition.labelEn,
            lines,
            images: localiseImages(edition.images, zh)
          };
        })}
      />
    </>
  );
}
```

- [ ] **Step 8: Delete `components/marketing/program-detail.tsx`**

```bash
git rm components/marketing/program-detail.tsx
```

- [ ] **Step 9: Update `tests/unit/program-presentation.test.tsx`**

Remove the test named `"renders the route record through one institutional intro and a status story"` entirely (it unit-tested `ProgramDetail`, which no longer exists), and remove the now-unused `ProgramDetail` import and `routeRecord` fixture (both were only used by that one test).

Replace the final test, `"keeps the four routes server-only, metadata-owned, and mapped from the correct typed record"`, with:

```tsx
  it("keeps the four routes server-only, metadata-owned, and mapped from the correct typed record", () => {
    const routes = [
      ["asa", "asa.editions.map"],
      ["cpai", "cpai.syllabus.map"],
      ["hkict", "hkict.editions.map"],
      ["tct", "tct.editions.map"],
    ] as const;

    for (const [id, mapping] of routes) {
      const source = readFileSync(resolve(process.cwd(), `app/[locale]/(public)/programs/${id}/page.tsx`), "utf8");
      expect(source).toContain(`import {${id}} from '@/content/programs/${id}'`);
      expect(source).toContain(`item.id === '${id}'`);
      expect(source).toContain(mapping);
      expect(source).toContain(`pathname: '/programs/${id}'`);
      expect(source).toContain("title: t('title')");
      expect(source).toContain("description: t('description')");
      expect(source).toContain("image: program.image");
      expect(source).toContain("setRequestLocale(locale)");
      expect(source).toContain("PageHero");
      expect(source).toContain("RichCompass");
      expect(source).toContain("heading={tr('statusHeading')}");
      expect(source).toContain("{t('status')}");
      expect(source).not.toContain("ProgramDetail");
      expect(source).not.toMatch(/donor|mock-data|mockData|@\/config\//i);
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/<main\b/);
    }
  });
```

Every other test in this file — the `ProgramEditions`/`ProgramCredential` component behaviour tests (`"states the explicit unrecorded winner variant..."`, `"renders localized edition gallery images..."`, `"keeps TCT as an edition series..."`, `"keeps CPAI facts..."`) — is unchanged, since neither component's own code changes in this task.

- [ ] **Step 10: Run all affected tests and confirm they pass**

Run: `npx vitest run tests/unit/programme-header.test.ts tests/unit/wt-pages/programs-editions.test.tsx tests/unit/program-presentation.test.tsx`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add app/\[locale\]/\(public\)/programs/asa/page.tsx app/\[locale\]/\(public\)/programs/hkict/page.tsx app/\[locale\]/\(public\)/programs/tct/page.tsx components/marketing/program-detail.tsx lib/programs/programme-header.ts messages/en.json messages/zh-HK.json tests/unit/programme-header.test.ts tests/unit/program-presentation.test.tsx tests/unit/wt-pages/programs-editions.test.tsx
git commit -m "$(cat <<'EOF'
feat: rewrite /programs/{asa,hkict,tct} onto the ProgrammeRecordPage header

PageHero (programme-type eyebrow) + RichCompass (key fact reused from
summarizeProgrammes, audience, and a mailto "ask the programme team" action
-- D-6, since no programme schema carries a source-URL field) replace the
old ProgramDetail wrapper, which is deleted as a result. ProgramEditions is
kept exactly as each page already uses it; the real "Current status" copy
moves to a standalone StorySection rather than being dropped.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: `/programs/cpai` rewrite — same header, ProgramCredential kept (not ProgramEditions)

CPAI is a credential, not an event series: `content/schemas.ts`'s `cpaiProgramSchema` has no `editions` field at all, by explicit design (its own comment: "no editions, no winners, no years — a credential page framed as a course schedule is exactly the... framing the claims review warns against"). `summarizeProgrammes()` already marks `cpai` `type: 'credential'` with `editionCount: null` and `latestYear: null` for exactly this reason, so `buildProgrammeHeaderFacts` (Task 15) naturally renders `credentialFact`/`credentialLabel` instead of an edition count — nothing programme-specific needs branching in this page beyond which component renders below the header. `ProgramCredential` is kept unchanged; `ProgramEditions` is never imported here, because there is no edition data to hand it.

**Files:**
- Modify: `app/[locale]/(public)/programs/cpai/page.tsx`, `messages/en.json`, `messages/zh-HK.json`
- Create: `tests/unit/wt-pages/programs-cpai.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/wt-pages/programs-cpai.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ImgHTMLAttributes, ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {cpai} from "@/content/programs/cpai";

type Locale = "en" | "zh-HK";

const {translationState, setRequestLocaleSpy} = vi.hoisted(() => {
  const state = {locale: "en" as Locale, messages: {} as Record<string, Record<string, unknown>>};
  return {
    translationState: state,
    setRequestLocaleSpy: vi.fn((locale: Locale) => {
      state.locale = locale;
    }),
  };
});
const buildPageMetadataSpy = vi.hoisted(() => vi.fn((input: unknown) => input));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string, values?: Record<string, string | number>) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), value);
    };
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("@/lib/metadata", () => ({buildPageMetadata: buildPageMetadataSpy}));
vi.mock("next/image", () => ({
  default: ({alt, ...props}: ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

function renderWithIntl(locale: Locale, element: ReactElement) {
  render(<NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>);
}

describe("/programs/cpai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the credential header (no edition count) and keeps ProgramCredential below", async () => {
    const {default: CpaiPage} = await import("@/app/[locale]/(public)/programs/cpai/page");
    renderWithIntl("en", await CpaiPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: en.programs.cpai.title})).toBeVisible();
    const compass = document.querySelector(".rich-compass-grid");
    expect(compass?.textContent).toContain(en.programs.record.credentialFact);
    expect(compass?.textContent).not.toMatch(/\d+ editions?/);
    expect(compass?.textContent).toContain(en.programs.cpai.audience);
    const mailLink = screen.getByRole("link", {name: en.programs.record.askProgrammeTeam});
    expect(mailLink.getAttribute("href")).toMatch(/^mailto:contact@hkwtia\.org\?subject=/);

    expect(screen.getByRole("heading", {level: 2, name: cpai.courseNameEn})).toBeVisible();
    expect(screen.getByRole("heading", {level: 3, name: en.programs.record.credentialSyllabus})).toBeVisible();
  });

  it("never imports ProgramEditions -- there is no edition data for a credential", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/programs/cpai/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("RichCompass");
    expect(source).toContain("ProgramCredential");
    expect(source).not.toContain("ProgramEditions");
    expect(source).not.toContain("ProgramDetail");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/programs-cpai.test.tsx`
Expected: FAIL — `messages.programs.cpai.audience` is `undefined` and the page still renders the old `ProgramDetail` wrapper.

- [ ] **Step 3: Add the message key**

| Key | EN | ZH |
|---|---|---|
| `programs.cpai.audience` | Professionals completing WTIA's applied AI credential. | 修讀 WTIA 應用人工智能專業資格的在職人士。 |

(`programs.record.*` and `programs.cpai.title`/`description`/`status` already exist or were added in Task 15.)

- [ ] **Step 4: Rewrite `app/[locale]/(public)/programs/cpai/page.tsx`**

```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ProgramCredential} from '@/components/marketing/program-credential';
import {localiseImages} from '@/components/marketing/program-editions';
import {StorySection} from '@/components/marketing/story-section';
import {PageHero} from '@/components/wt/page-hero';
import {RichCompass} from '@/components/wt/rich-compass';
import {siteConfig} from '@/config/site';
import {programs} from '@/content/programs';
import {cpai} from '@/content/programs/cpai';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';
import {buildPageMetadata} from '@/lib/metadata';
import {buildProgrammeHeaderFacts} from '@/lib/programs/programme-header';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'cpai')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/cpai', title: t('title'), description: t('description'), image: program.image});
}

export default async function CpaiPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: program.namespace});
  const tr = await getTranslations({locale, namespace: 'programs.record'});
  const common = await getTranslations({locale, namespace: 'Common'});
  const zh = locale === 'zh-HK';

  // CPAI is a credential: summarizeProgrammes() already marks it type: 'credential' with no
  // editionCount/latestYear, so buildProgrammeHeaderFacts renders the credential branch
  // without any cpai-specific conditional here.
  const summary = summarizeProgrammes().find((item) => item.id === 'cpai')!;
  const facts = buildProgrammeHeaderFacts(summary, tr, t('title'));
  const mailto = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(facts.mailSubject)}`;

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={facts.typeLabel}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('title')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <RichCompass
        items={[
          {label: tr('compassFactLabel'), value: facts.fact},
          {label: tr('compassAudienceLabel'), value: t('audience')},
          {label: tr('compassActionLabel'), value: tr('askProgrammeTeam'), href: mailto},
        ]}
      />
      <StorySection heading={tr('statusHeading')} tone="warm">
        <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{t('status')}</p>
      </StorySection>
      <ProgramCredential
        courseName={zh ? cpai.courseNameZh : cpai.courseNameEn}
        coursePartner={zh ? cpai.coursePartnerZh : cpai.coursePartnerEn}
        coursePartnerHeading={tr('credentialCoursePartner')}
        images={localiseImages(cpai.images, zh)}
        issuer={zh ? cpai.issuerZh : cpai.issuerEn}
        issuerHeading={tr('credentialIssuer')}
        // 「一個課程，兩張認證」: WTIA issues CPAI, CUSCS separately issues its own completion
        // certificate. Naming only the first two states half of it.
        partnerCertificate={zh ? cpai.partnerCertificateZh : cpai.partnerCertificateEn}
        partnerCertificateHeading={tr('credentialPartnerCertificate')}
        syllabus={cpai.syllabus.map((module) => (zh ? module.titleZh : module.titleEn))}
        syllabusHeading={tr('credentialSyllabus')}
      />
    </>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/wt-pages/programs-cpai.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full Group C regression sweep**

Run: `npx vitest run tests/unit/rich-compass.test.tsx tests/unit/rich-related-routes.test.tsx tests/unit/about-related-routes.test.ts tests/unit/about-page.test.ts tests/unit/history-milestones.test.ts tests/unit/history-page.test.tsx tests/unit/history-detail.test.ts tests/unit/programme-header.test.ts tests/unit/program-presentation.test.tsx tests/unit/program-content.test.ts tests/unit/program-schema.test.ts tests/unit/program-contradicted-claims.test.ts tests/unit/index-program-pages.test.ts tests/unit/programme-summaries.test.ts tests/unit/wt-primitives.test.tsx tests/unit/wt-pages/`
Expected: PASS — the last six files listed (`program-content`, `program-schema`, `program-contradicted-claims`, `index-program-pages`, `programme-summaries`, `wt-primitives`) test content/schema/business-logic or already-shipped primitives that this group's rewrite never touches, confirmed unaffected by grep before this plan was written.

- [ ] **Step 7: Commit**

```bash
git add app/\[locale\]/\(public\)/programs/cpai/page.tsx messages/en.json messages/zh-HK.json tests/unit/wt-pages/programs-cpai.test.tsx
git commit -m "$(cat <<'EOF'
feat: rewrite /programs/cpai onto the ProgrammeRecordPage header

Same header pattern as asa/hkict/tct (Task 15), but ProgramCredential is
kept below instead of ProgramEditions -- cpaiProgramSchema carries no
editions field at all, by the schema's own design, so there is nothing for
ProgramEditions to render. summarizeProgrammes() already marks cpai a
credential with no edition count, so buildProgrammeHeaderFacts needs no
cpai-specific branch in this page.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: `/launchpad` — GBA opening (route board + service grid), existing stack restyled (design doc §5, closes E-20's sibling gap on Launch Pad's old hero)

**Files:**
- Create: `components/wt/route-map.tsx`
- Modify: `components/home/gba-gateway.tsx`
- Create: `components/marketing/launchpad-gba-opening.tsx`
- Rewrite: `app/[locale]/(public)/launchpad/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/wt-pages/launchpad-page.test.tsx` (new), `tests/unit/wt-primitives.test.tsx` (extend)
- Regression (must stay green, unmodified): `tests/unit/m6-launchpad-page.test.tsx`, `tests/unit/launchpad-partner-cutover.test.tsx`, `tests/unit/home-gba-gateway.test.tsx`

**Investigation finding, stated explicitly:** the donor visualization named in the design doc ("the same 3-node HK/GZ/SZ route visualization already built for the homepage's GBA Gateway section") is not literally the same CSS. The homepage's `GbaGateway` (`components/home/gba-gateway.tsx:17-24`) renders a **4**-node map (`hk-node`, `gz-node`, `sz-node`, plus a `world-node` arrow) inside `.gba-map`, a full-bleed hero background (`app/styles/wisetech.css:255-257`). The donor class actually named for Launch Pad's two-column layout, `.gba-route-board` + `.route-map` (`app/styles/wisetech.css:281`), styles exactly **3** bare `<span>` children by `nth-child` position — no 4th node, no named node classes. These are two different, real, already-shipped selectors; reusing the homepage's exact 4-node markup unchanged inside `.route-map` would leave one node unstyled (the CSS has no `.route-map .world-node` rule) and break the `nth-child` positions the other three rely on. The fix that actually satisfies "reused, not rebuilt": extract the map's 3-node core into one shared component with a `variant` switch, so the homepage keeps its exact current 4-node rendering (refactor-only, `tests/unit/home-gba-gateway.test.tsx` — which only asserts the CTA link, never the map DOM — stays green untouched) and Launch Pad gets the real 3-node `.route-map` shape the CSS actually defines.

- [ ] **Step 1: Write the failing primitive test**

Add to `tests/unit/wt-primitives.test.tsx` (append; do not remove existing cases):

```tsx
describe("RouteMap", () => {
  it("renders the hero variant with four named, aria-hidden nodes inside .gba-map", async () => {
    const {RouteMap} = await import("@/components/wt/route-map");
    const {container} = render(
      <RouteMap variant="hero" labels={{hk: "HK", gz: "GZ", sz: "SZ", world: "↗"}} />,
    );
    const wrapper = container.querySelector(".gba-map");
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(wrapper?.querySelector(".hk-node")).toHaveTextContent("HK");
    expect(wrapper?.querySelector(".gz-node")).toHaveTextContent("GZ");
    expect(wrapper?.querySelector(".sz-node")).toHaveTextContent("SZ");
    expect(wrapper?.querySelector(".world-node")).toHaveTextContent("↗");
  });

  it("renders the board variant with exactly three unlabelled nodes inside .route-map", async () => {
    const {RouteMap} = await import("@/components/wt/route-map");
    const {container} = render(
      <RouteMap variant="board" labels={{hk: "HK", gz: "GZ", sz: "SZ"}} />,
    );
    const wrapper = container.querySelector(".route-map");
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    const spans = wrapper?.querySelectorAll("span") ?? [];
    expect(spans).toHaveLength(3);
    expect(spans[0]).toHaveTextContent("HK");
    expect(spans[1]).toHaveTextContent("GZ");
    expect(spans[2]).toHaveTextContent("SZ");
    expect(wrapper?.querySelector(".world-node")).toBeNull();
  });
});
```

Confirm `render` is imported at the top of that file already (`@testing-library/react`); if not, add `import {render} from "@testing-library/react";` alongside the existing imports.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-primitives.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/wt/route-map`.

- [ ] **Step 3: Implement `components/wt/route-map.tsx`**

```tsx
export type RouteMapVariant = 'hero' | 'board';

export type RouteMapLabels = Readonly<{hk: string; gz: string; sz: string; world?: string}>;

const wrapperClassName: Record<RouteMapVariant, string> = {hero: 'gba-map', board: 'route-map'};

// Two real donor selectors, not one: app/styles/wisetech.css:255-257 .gba-map (4 nodes, named
// classes, full-bleed hero background) vs :281 .gba-route-board .route-map (3 bare spans styled
// by nth-child position, two-column boxed diagram). Sharing this component keeps both grammars
// correct instead of forcing one page's markup onto the other's CSS.
export function RouteMap({variant, labels}: Readonly<{variant: RouteMapVariant; labels: RouteMapLabels}>) {
  return (
    <div className={wrapperClassName[variant]} aria-hidden="true">
      {variant === 'hero' ? (
        <>
          <span className="hk-node">{labels.hk}</span>
          <span className="gz-node">{labels.gz}</span>
          <span className="sz-node">{labels.sz}</span>
          {labels.world ? <span className="world-node">{labels.world}</span> : null}
        </>
      ) : (
        <>
          <span>{labels.hk}</span>
          <span>{labels.gz}</span>
          <span>{labels.sz}</span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the primitive test and confirm it passes**

Run: `npx vitest run tests/unit/wt-primitives.test.tsx`
Expected: PASS

- [ ] **Step 5: Refactor `components/home/gba-gateway.tsx` to use `RouteMap` (pure extraction, no markup change)**

Replace the inline `<div className="gba-map" aria-hidden="true">...</div>` block with:

```tsx
import {RouteMap} from '@/components/wt/route-map';
```

and, inside the returned JSX, replace:

```tsx
      <div className="gba-map" aria-hidden="true">
        <span className="hk-node">HK</span>
        <span className="gz-node">GZ</span>
        <span className="sz-node">SZ</span>
        <span className="world-node">↗</span>
      </div>
```

with:

```tsx
      <RouteMap variant="hero" labels={{hk: 'HK', gz: 'GZ', sz: 'SZ', world: '↗'}} />
```

- [ ] **Step 6: Run the homepage regression test and confirm it still passes**

Run: `npx vitest run tests/unit/home-gba-gateway.test.tsx`
Expected: PASS (unchanged — the test only asserts the CTA link, never the map DOM, so this refactor is invisible to it).

- [ ] **Step 7: Write the failing test for the new Launch Pad opening**

Create `tests/unit/wt-pages/launchpad-page.test.tsx`:

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublicCohorts = vi.hoisted(() => vi.fn());
const listPublishedPartners = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/cohorts", () => ({cohortRepository: {listPublicCohorts}}));
vi.mock("@/lib/db/repos/landing-partners", () => ({landingPartnersRepository: {listPublished: listPublishedPartners}}));

describe("Launch Pad page — GBA opening", () => {
  beforeEach(() => {
    listPublicCohorts.mockReset().mockResolvedValue([]);
    listPublishedPartners.mockReset().mockResolvedValue([]);
  });

  it("renders the page hero, the 3-node route board, and 4 descriptive service cards with no CTA", async () => {
    const {default: LaunchPadPage} = await import("@/app/[locale]/(public)/launchpad/page");
    render(await LaunchPadPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole("heading", {level: 1, name: bundles.en.LaunchPad.title})).toBeInTheDocument();
    expect(screen.getByRole("navigation", {name: /breadcrumb/i})).toBeInTheDocument();

    const board = document.querySelector(".gba-route-board");
    expect(board).not.toBeNull();
    expect(board?.querySelectorAll(".route-map span")).toHaveLength(3);

    const cards = document.querySelectorAll(".service-grid > article");
    expect(cards).toHaveLength(4);
    expect(document.querySelectorAll(".service-grid > a")).toHaveLength(0);
    expect(screen.getByText(bundles.en.LaunchPad.services.marketEntry.title)).toBeInTheDocument();
    expect(screen.getByText(bundles.en.LaunchPad.services.softLanding.title)).toBeInTheDocument();
    expect(screen.getByText(bundles.en.LaunchPad.services.buyerMatching.title)).toBeInTheDocument();
    expect(screen.getByText(bundles.en.LaunchPad.services.delegations.title)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/launchpad-page.test.tsx`
Expected: FAIL — no breadcrumb nav, no `.gba-route-board`, no `.service-grid` exist yet.

- [ ] **Step 9: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Common.breadcrumbHome` | Home | 主頁 |
| `LaunchPad.breadcrumbCurrent` | Launch Pad | 創科起動 |
| `LaunchPad.gbaOpening.eyebrow` | GBA Gateway | 大灣區通道 |
| `LaunchPad.gbaOpening.title` | Hong Kong expertise. GBA opportunity. Global ambition. | 香港專長，大灣區機遇，全球視野。 |
| `LaunchPad.gbaOpening.copy` | A practical route for market entry, soft landing, delegations, buyer matching and long-term regional partnerships. | 提供市場進入、落地支援、考察團、買家配對及長期區域合作的實務路徑。 |
| `LaunchPad.gbaOpening.map.hk` | HK | HK |
| `LaunchPad.gbaOpening.map.gz` | GZ | GZ |
| `LaunchPad.gbaOpening.map.sz` | SZ | SZ |
| `LaunchPad.services.marketEntry.title` | Market entry | 市場進入 |
| `LaunchPad.services.marketEntry.copy` | Structured guidance on registration, distribution and first commercial contracts across the Greater Bay Area. | 就大灣區內的註冊、分銷及首批商業合約提供有系統的指引。 |
| `LaunchPad.services.softLanding.title` | Soft landing | 落地支援 |
| `LaunchPad.services.softLanding.copy` | Shared workspace introductions, local compliance orientation and practical first-90-day support for an incoming team. | 為初到當地的團隊提供共用工作空間介紹、本地合規指導及實務的首 90 天支援。 |
| `LaunchPad.services.buyerMatching.title` | Buyer matching | 買家配對 |
| `LaunchPad.services.buyerMatching.copy` | Warm introductions to landing partners and public buyers actively sourcing Hong Kong technology. | 主動引薦落地夥伴及正在物色香港科技的公營買家。 |
| `LaunchPad.services.delegations.title` | Delegations | 考察團 |
| `LaunchPad.services.delegations.copy` | Organised study visits and delegation itineraries connecting cohorts with counterparts in Guangzhou and Shenzhen. | 籌辦考察行程，讓學員與廣州、深圳的對口單位交流。 |
| `LaunchPad.clinic.label` | Need help? | 需要協助？ |

- [ ] **Step 10: Implement `components/marketing/launchpad-gba-opening.tsx`**

```tsx
import {CardGrid} from '@/components/wt/card-grid';
import {PageHero} from '@/components/wt/page-hero';
import {RouteMap} from '@/components/wt/route-map';
import {Shell} from '@/components/wt/shell';
import type {WtServiceCard} from '@/components/wt/types';

export type LaunchpadGbaOpeningLabels = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  breadcrumbHome: string;
  breadcrumbLabel: string;
  breadcrumbCurrent: string;
  opening: Readonly<{eyebrow: string; title: string; copy: string; map: Readonly<{hk: string; gz: string; sz: string}>}>;
  services: readonly WtServiceCard[];
}>;

// design doc §5 /launchpad: PageHero + .gba-route-board/.route-map (3-node HK/GZ/SZ board,
// reusing RouteMap's 'board' variant -- see components/wt/route-map.tsx for why this differs
// from the homepage's 4-node .gba-map) + .service-grid, 4 descriptive cards with no href
// (explicitly no CTA to a feature that doesn't exist).
export function LaunchpadGbaOpening({labels}: Readonly<{labels: LaunchpadGbaOpeningLabels}>) {
  return (
    <>
      <PageHero
        eyebrow={labels.eyebrow}
        title={labels.title}
        lead={labels.lead}
        breadcrumb={{homeHref: '/', homeLabel: labels.breadcrumbHome, current: labels.breadcrumbCurrent}}
        breadcrumbLabel={labels.breadcrumbLabel}
      />
      <section className="section">
        <Shell className="gba-route-board">
          <div>
            <p className="eyebrow">{labels.opening.eyebrow}</p>
            <h2>{labels.opening.title}</h2>
            <p>{labels.opening.copy}</p>
          </div>
          <RouteMap variant="board" labels={labels.opening.map} />
        </Shell>
        <CardGrid variant="service" items={labels.services} />
      </section>
    </>
  );
}
```

- [ ] **Step 11: Rewrite `app/[locale]/(public)/launchpad/page.tsx`**

Keep every existing data read, label object, and translation key call byte-identical (`tests/unit/m6-launchpad-page.test.tsx` and `tests/unit/launchpad-partner-cutover.test.tsx` assert on the literal translation-key strings and on the exact `listPublicCohorts`/`listPublished` call shapes — none of that changes). Only the hero and container markup change.

```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {CohortCalendar} from '@/components/marketing/cohort-calendar';
import {CohortApplicationForm} from '@/components/marketing/cohort-application-form';
import {FundingResults, FundingWizard} from '@/components/marketing/funding-wizard';
import {LandingPartnerMap} from '@/components/marketing/landing-partner-map';
import {LaunchpadGbaOpening} from '@/components/marketing/launchpad-gba-opening';
import {ClosingBand} from '@/components/wt/closing-band';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import type {AppLocale} from '@/i18n/routing';
import {cohortRepository} from '@/lib/db/repos/cohorts';
import {landingPartnersRepository} from '@/lib/db/repos/landing-partners';
import {getFundingResults, parseFundingAnswers} from '@/lib/launchpad/funding';
import {applyToCohortAction} from '@/lib/launchpad/member-actions';
import type {Actor} from '@/lib/membership/lifecycle';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>};

export const dynamic = "force-dynamic";
const anonymous: Actor = {kind: "anonymous", userId: null};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'LaunchPad'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/launchpad', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function LaunchPadPage({params, searchParams = Promise.resolve({})}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  const appLocale = locale as AppLocale;
  setRequestLocale(appLocale);
  // CLAUDE.md: public pages degrade rather than 500. The WP-0 visual baseline caught
  // /launchpad returning 500 with an empty DATABASE_URL because this call, unlike the
  // landing-partners read below, had no fallback.
  const [t, common, cohorts] = await Promise.all([
    getTranslations({locale: appLocale, namespace: 'LaunchPad'}),
    getTranslations({locale: appLocale, namespace: 'Common'}),
    cohortRepository.listPublicCohorts(anonymous).catch((): Awaited<ReturnType<typeof cohortRepository.listPublicCohorts>> => []),
  ]);
  const partners = await landingPartnersRepository.listPublished({limit: 100}).catch(() => []);
  const answers = parseFundingAnswers(query);
  const fundingResults = getFundingResults(query, appLocale);
  const calendarLabels = {title: t('calendar.title'), empty: t('calendar.empty'), starts: t('calendar.starts'), ends: t('calendar.ends'), noEnd: t('calendar.noEnd'), capacity: t('calendar.capacity'), fee: t('calendar.fee'), statuses: {planning: t('calendar.statuses.planning'), open: t('calendar.statuses.open'), active: t('calendar.statuses.active'), completed: t('calendar.statuses.completed'), archived: t('calendar.statuses.archived')}};
  const partnerLabels = {title: t('partners.title'), empty: t('partners.empty'), market: t('partners.market'), region: t('partners.region')};
  const fundingLabels = {formLabel: t('funding.formLabel'), instructions: t('funding.instructions'), submit: t('funding.submit'), questions: {sector: {label: t('funding.questions.sector.label'), options: {trade: t('funding.questions.sector.options.trade'), 'advanced-training': t('funding.questions.sector.options.advancedTraining'), 'smart-production': t('funding.questions.sector.options.smartProduction'), 'life-health': t('funding.questions.sector.options.lifeHealth'), 'ai-data-science': t('funding.questions.sector.options.aiDataScience'), 'advanced-manufacturing-new-energy': t('funding.questions.sector.options.advancedManufacturing'), 'research-development': t('funding.questions.sector.options.researchDevelopment')}}, stage: {label: t('funding.questions.stage.label'), options: {'business-registered-non-subvented': t('funding.questions.stage.options.businessRegistered'), 'incorporated-non-subvented': t('funding.questions.stage.options.incorporated'), 'incorporated-subvented': t('funding.questions.stage.options.subvented')}}, market: {label: t('funding.questions.market.label'), options: {'hong-kong': t('funding.questions.market.options.hongKong'), 'covered-economy': t('funding.questions.market.options.coveredEconomy'), global: t('funding.questions.market.options.global')}}, employees: {label: t('funding.questions.employees.label'), options: {standard: t('funding.questions.employees.options.standard'), 'trainee-hk-pr': t('funding.questions.employees.options.traineeHongKongPermanentResident')}}, revenue: {label: t('funding.questions.revenue.label'), options: {'under-100m': t('funding.questions.revenue.options.under100m'), 'investment-100m-project-150m': t('funding.questions.revenue.options.investment100mProject150m'), 'eligible-rd-expenditure': t('funding.questions.revenue.options.eligibleRdExpenditure')}}}};
  const fundingResultsLabels = {heading: t('funding.results.heading'), eligible: t('funding.results.eligible'), ineligible: t('funding.results.ineligible'), source: t('funding.results.source'), asOf: t('funding.results.asOf')};
  const openCohorts = cohorts.filter((cohort) => cohort.status === 'open').map((cohort) => ({id: cohort.id, name: appLocale === 'zh-HK' ? cohort.nameZhHk : cohort.nameEn, status: cohort.status}));
  const applicationLabels = {title: t('application.title'), cohort: t('application.cohort'), market: t('application.market'), readiness: t('application.readiness'), consent: t('application.consent'), submit: t('application.submit'), submitting: t('application.submitting'), success: t('application.success'), invalid: t('application.invalid'), unauthorized: t('application.unauthorized'), signIn: t('application.signIn'), error: t('application.error')};
  const openingLabels = {
    eyebrow: t('eyebrow'), title: t('title'), lead: t('description'),
    breadcrumbHome: common('breadcrumbHome'), breadcrumbLabel: common('breadcrumbLabel'), breadcrumbCurrent: t('breadcrumbCurrent'),
    opening: {eyebrow: t('gbaOpening.eyebrow'), title: t('gbaOpening.title'), copy: t('gbaOpening.copy'), map: {hk: t('gbaOpening.map.hk'), gz: t('gbaOpening.map.gz'), sz: t('gbaOpening.map.sz')}},
    services: [
      {title: t('services.marketEntry.title'), copy: t('services.marketEntry.copy')},
      {title: t('services.softLanding.title'), copy: t('services.softLanding.copy')},
      {title: t('services.buyerMatching.title'), copy: t('services.buyerMatching.copy')},
      {title: t('services.delegations.title'), copy: t('services.delegations.copy')},
    ],
  };

  return (
    <>
      <LaunchpadGbaOpening labels={openingLabels} />
      <Section tone="paper">
        <SectionHeading eyebrow={t('program.title')} title={t('program.title')} variant="stacked" />
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('program.intro')}</p>
        <div className="mt-6 space-y-4">
          <p className="text-lg font-medium">{t('program.outcomeTitle')}</p>
          <p className="text-muted-foreground">{t('program.outcomeDescription')}</p>
        </div>
      </Section>
      <Section tone="bright">
        <SectionHeading eyebrow={t('calendar.title')} title={t('calendar.title')} variant="stacked" />
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('calendar.intro')}</p>
        <div className="mt-6"><CohortCalendar cohorts={cohorts} locale={appLocale} labels={calendarLabels}/></div>
      </Section>
      <Section tone="paper">
        <SectionHeading eyebrow={t('partners.title')} title={t('partners.title')} variant="stacked" />
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('partners.intro')}</p>
        <div className="mt-6"><LandingPartnerMap partners={partners} locale={appLocale} labels={partnerLabels}/></div>
      </Section>
      <Section tone="bright">
        <SectionHeading eyebrow={t('funding.title')} title={t('funding.title')} variant="stacked" />
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('funding.intro')}</p>
        <div className="mt-6 space-y-10"><FundingWizard locale={appLocale} answers={answers} labels={fundingLabels}/><FundingResults results={fundingResults} labels={fundingResultsLabels}/></div>
      </Section>
      {openCohorts.length > 0 ? (
        <Section tone="paper">
          <CohortApplicationForm action={applyToCohortAction} cohorts={openCohorts} labels={applicationLabels} locale={appLocale}/>
        </Section>
      ) : null}
      <ClosingBand
        eyebrow={t('clinic.label')}
        title={t('clinic.title')}
        copy={t('clinic.description')}
        actions={[{href: '/contact', label: t('clinicCta')}]}
      />
    </>
  );
}
```

Note: `components/marketing/section.tsx` (the old marketing `Section`) is **not** deleted — WP-3 Task 15 already confirmed `/membership` still imports it; only this page's own import switches to the new `components/wt/section.tsx`.

- [ ] **Step 12: Run the new test and confirm it passes**

Run: `npx vitest run tests/unit/wt-pages/launchpad-page.test.tsx`
Expected: PASS

- [ ] **Step 13: Run the full regression sweep**

Run: `npx vitest run tests/unit/m6-launchpad-page.test.tsx tests/unit/launchpad-partner-cutover.test.tsx tests/unit/home-gba-gateway.test.tsx tests/unit/wt-primitives.test.tsx tests/unit/wt-pages/launchpad-page.test.tsx tests/unit/messages.test.ts`
Expected: PASS. (`messages.test.ts` confirms the new `Common.breadcrumbHome`/`LaunchPad.*` keys are in exact en/zh-HK parity.)

Run: `npm run audit:strings`
Expected: PASS — every new visible string in `launchpad-gba-opening.tsx` and the rewritten page is a `{labels.x}`/`{t(...)}` expression, never a literal JSX text node.

- [ ] **Step 14: Commit**

```bash
git add components/wt/route-map.tsx components/home/gba-gateway.tsx components/marketing/launchpad-gba-opening.tsx "app/[locale]/(public)/launchpad/page.tsx" messages/en.json messages/zh-HK.json tests/unit/wt-primitives.test.tsx tests/unit/wt-pages/launchpad-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: give Launch Pad a GBA route-board opening and inner-page shell

RouteMap extracts the homepage GBA Gateway's node visualization into a
shared primitive with a hero (4-node, .gba-map) and board (3-node,
.route-map) variant -- the two real, distinct donor selectors this needed,
not one markup shape forced onto both. Launch Pad now opens with PageHero,
the donor's .gba-route-board + 3-node .route-map, and a 4-card .service-grid
(Market entry / Soft landing / Buyer matching / Delegations, no CTAs to
unbuilt features) before the existing calendar/partner-map/funding-wizard/
application-form stack, restyled in place with no logic change.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: `/news`, `/news/[slug]` — status-labelled grid, research-quality block, subscribe band (design doc §5, Decision 2)

**Files:**
- Modify: `components/marketing/news-card.tsx`, `components/marketing/build-log-card.tsx`
- Create: `components/marketing/news-quality-panel.tsx`
- Rewrite: `app/[locale]/(public)/news/page.tsx`
- Modify: `app/styles/wisetech.css`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/wt-pages/news-page.test.tsx` (new)
- Regression (must stay green, unmodified): `tests/unit/news-page-locale.test.tsx`, `tests/unit/news-localized-bodies.test.tsx`, `tests/unit/build-log-pages.test.tsx`

**Investigation finding, stated explicitly:** no dedicated "insights grid" or "subscribe band" CSS class exists anywhere in `app/styles/wisetech.css` for this page — the design doc names a behavior (`status-label` per card, a research-quality block, a subscribe band) but not a donor class, unlike `.gba-route-board`/`.inner-card-grid` elsewhere in this spec. Two different resolutions, chosen for two different reasons:
- **The post grid** reuses `.archive-grid` (`app/styles/wisetech.css:280`) — a real, already-shipped, page-agnostic 2-column card grid (span/h2/p/a), built by WP-3 for the homepage's Archive Stories section and never coupled to that page's data. This is a genuine reuse of an existing class, not an invention.
- **The research-quality block and subscribe band** get one small new CSS rule each, following the exact precedent WP-3 Task 11 set for `.method-card` (`app/styles/wisetech.css:245-246`): a donor-styled addition scoped to the one section that needs it, built from the same design tokens (`--wt-line`, `--wt-paper-bright`) rather than inventing a competing visual language.
- **The subscribe band** literally reuses `FooterNewsletter` (`components/layout/footer-newsletter.tsx`) — the component itself, not just its mailto pattern — inside a new dark wrapper matching `.site-footer`'s own background, per the design doc's explicit "reusing... don't reinvent" instruction.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/wt-pages/news-page.test.tsx`:

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublishedNews = vi.hoisted(() => vi.fn());
const listPublishedBuildLogs = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/db/repos/public-posts", () => ({listPublishedNews, listPublishedBuildLogs}));

const newsRow = {slug: "n1", title: "News item", publishedAt: new Date("2026-08-01T00:00:00.000Z"), author: "WTIA"};
const buildLogRow = {slug: "b1", titleEn: "Build log item", titleZh: "開發日誌項目", publishedAt: new Date("2026-08-02T00:00:00.000Z"), author: "WTIA"};

describe("News page — status labels, research quality, subscribe", () => {
  beforeEach(() => {
    listPublishedNews.mockReset().mockResolvedValue([newsRow]);
    listPublishedBuildLogs.mockReset().mockResolvedValue([buildLogRow]);
  });

  it("renders one grid with a distinguishing status label per card, the quality panel, and the subscribe band", async () => {
    const {default: NewsPage} = await import("@/app/[locale]/(public)/news/page");
    render(await NewsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("navigation", {name: /breadcrumb/i})).toBeInTheDocument();
    const grid = document.querySelector(".archive-grid");
    expect(grid?.querySelectorAll(":scope > article")).toHaveLength(2);
    expect(screen.getAllByText(bundles.en.News.statusNews)).toHaveLength(1);
    expect(screen.getAllByText(bundles.en.News.statusBuildLog)).toHaveLength(1);
    expect(document.querySelector(".news-quality-panel")).not.toBeNull();
    expect(screen.getByText(bundles.en.News.quality.title)).toBeInTheDocument();
    expect(document.querySelector(".news-subscribe-band .footer-newsletter")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/news-page.test.tsx`
Expected: FAIL — no `.archive-grid`, no status labels, no `.news-quality-panel`, no `.news-subscribe-band` exist yet.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `News.breadcrumbCurrent` | News | 新聞 |
| `News.statusNews` | News | 新聞 |
| `News.statusBuildLog` | Build Log | 開發日誌 |
| `News.quality.eyebrow` | Editorial standards | 編採標準 |
| `News.quality.title` | How WTIA reports | WTIA 的報道方式 |
| `News.quality.body` | Every article is staff-authored, dated and attributed. Build Log entries describe engineering work actually shipped to this platform, each linked to its own published evidence on the AI-Ops page. | 每篇文章均由職員撰寫、註明日期及作者。開發日誌記錄本平台已實際推出的工程工作，並連結至 AI-Ops 頁面上相應的公開實證。 |
| `News.subscribe.eyebrow` | Stay informed | 掌握動態 |
| `News.subscribe.title` | Get WTIA news by email | 以電郵接收 WTIA 新聞 |
| `News.subscribe.emailLabel` | Email address | 電郵地址 |
| `News.subscribe.placeholder` | you@example.com | you@example.com |
| `News.subscribe.submit` | Subscribe | 訂閱 |
| `News.subscribe.success` | Thanks — check the draft email we opened for you. | 多謝！請查看我們為你開啟的電郵草稿。 |
| `News.subscribe.error` | Enter a valid email address. | 請輸入有效的電郵地址。 |
| `News.subscribe.mailSubject` | Subscribe to WTIA news | 訂閱 WTIA 新聞 |
| `News.subscribe.mailBody` | Please add {email} to the WTIA news list. | 請將 {email} 加入 WTIA 新聞訂閱名單。 |

- [ ] **Step 4: Add the two scoped CSS rules**

Append to `app/styles/wisetech.css` (near `.archive-grid`, following the exact precedent of the `.impact-metrics .method-card` addition):

```css
.news-quality-panel { border: 1px solid var(--wt-line); border-radius: 13px; background: var(--wt-paper-bright); padding: 34px; margin-top: 40px; }
.news-quality-panel h2 { margin: 14px 0 10px; font-family: var(--font-serif); font-size: 26px; font-weight: 500; }
.news-quality-panel p { color: #59666a; font-size: 13px; line-height: 1.65; }
.news-subscribe-band { background: #363839; padding-block: clamp(64px,8vw,120px); }
.news-subscribe-band .footer-newsletter a { color: rgba(255,255,255,.7); }
```

- [ ] **Step 5: Add a `kind` prop to `NewsCard` and `BuildLogCard` rendering a `StatusLabel`, and use `.archive-grid`'s article grammar**

`components/marketing/news-card.tsx`:

```tsx
import Link from "next/link";

import {StatusLabel} from "@/components/wt/status-label";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

/** Listing card for a staff-authored news post. Build logs use BuildLogCard. */
export function NewsCard({
  locale,
  slug,
  title,
  publishedAt,
  author,
  statusLabel,
}: Readonly<{
  locale: AppLocale;
  slug: string;
  title: string;
  publishedAt: Date | string;
  author?: string;
  statusLabel: string;
}>) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(publishedAt instanceof Date ? publishedAt : new Date(publishedAt));

  return (
    <article>
      <StatusLabel>{statusLabel}</StatusLabel>
      <h2>
        <Link href={localizedPath(locale, `/news/${slug}`)}>{title}</Link>
      </h2>
      <p>
        <span>{date}</span>
        {author ? <><span aria-hidden="true"> · </span><span>{author}</span></> : null}
      </p>
    </article>
  );
}
```

`components/marketing/build-log-card.tsx`:

```tsx
import Link from "next/link";

import {StatusLabel} from "@/components/wt/status-label";
import type {AppLocale} from "@/i18n/routing";
import type {PublishedBuildLogSummary} from "@/lib/db/repos/public-posts";
import {localizedPath} from "@/lib/urls";

export function BuildLogCard({
  locale,
  post,
  statusLabel,
}: Readonly<{
  locale: AppLocale;
  post: PublishedBuildLogSummary;
  statusLabel: string;
}>) {
  const title = locale === "zh-HK" ? post.titleZh : post.titleEn;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(post.publishedAt);

  return (
    <article>
      <StatusLabel>{statusLabel}</StatusLabel>
      <h2>
        <Link href={localizedPath(locale, `/news/${post.slug}`)}>{title}</Link>
      </h2>
      <p>
        <span>{date}</span>
        <span aria-hidden="true"> · </span>
        <span>{post.author}</span>
      </p>
    </article>
  );
}
```

(`.archive-grid` supplies the `<article>` border/padding/`h2`/`p` typography; `StatusLabel` keeps its own `.status-label` treatment layered on top, matching the cascade already established at `app/styles/wisetech.css:83,194`.)

- [ ] **Step 6: Implement `components/marketing/news-quality-panel.tsx`**

```tsx
export type NewsQualityPanelLabels = Readonly<{eyebrow: string; title: string; body: string}>;

export function NewsQualityPanel({labels}: Readonly<{labels: NewsQualityPanelLabels}>) {
  return (
    <div className="news-quality-panel">
      <p className="eyebrow">{labels.eyebrow}</p>
      <h2>{labels.title}</h2>
      <p>{labels.body}</p>
    </div>
  );
}
```

- [ ] **Step 7: Rewrite `app/[locale]/(public)/news/page.tsx`**

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {BuildLogCard} from "@/components/marketing/build-log-card";
import {NewsCard} from "@/components/marketing/news-card";
import {NewsQualityPanel} from "@/components/marketing/news-quality-panel";
import {FooterNewsletter} from "@/components/layout/footer-newsletter";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import type {AppLocale} from "@/i18n/routing";
import {listPublishedBuildLogs, listPublishedNews} from "@/lib/db/repos/public-posts";
import {buildPageMetadata} from "@/lib/metadata";

export const dynamic = "force-dynamic";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "News"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/news",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function NewsPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: "News"}),
    getTranslations({locale, namespace: "Common"}),
  ]);
  const appLocale = locale as AppLocale;
  // A database outage degrades to the empty state rather than a 500.
  const [news, buildLogs] = await Promise.all([
    listPublishedNews(appLocale).catch(() => []),
    listPublishedBuildLogs().catch(() => []),
  ]);

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("description")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("breadcrumbCurrent")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <Section tone="paper">
        {news.length > 0 || buildLogs.length > 0 ? (
          <div className="archive-grid">
            {news.map((post) => (
              <NewsCard
                author={post.author}
                key={post.slug}
                locale={appLocale}
                publishedAt={post.publishedAt}
                slug={post.slug}
                statusLabel={t("statusNews")}
                title={post.title}
              />
            ))}
            {buildLogs.map((post) => (
              <BuildLogCard key={post.slug} locale={appLocale} post={post} statusLabel={t("statusBuildLog")}/>
            ))}
          </div>
        ) : (
          <HonestEmpty variant="inner" title={t("emptyTitle")} copy={t("emptyDescription")} />
        )}
        <NewsQualityPanel labels={{eyebrow: t("quality.eyebrow"), title: t("quality.title"), body: t("quality.body")}} />
      </Section>
      <div className="news-subscribe-band">
        <div className="shell">
          <FooterNewsletter labels={{
            eyebrow: t("subscribe.eyebrow"),
            title: t("subscribe.title"),
            emailLabel: t("subscribe.emailLabel"),
            placeholder: t("subscribe.placeholder"),
            submit: t("subscribe.submit"),
            success: t("subscribe.success"),
            error: t("subscribe.error"),
            mailSubject: t("subscribe.mailSubject"),
            mailBody: t("subscribe.mailBody"),
          }} />
        </div>
      </div>
    </>
  );
}
```

`components/marketing/empty-state.tsx` is not deleted — grep confirms no other page imports it as of this task, but the design programme's convention (per WP-3 Task 15) is only to delete a component in the same task that proves it has no other importer; that check belongs to whichever task turns out to be the last consumer, not this one.

- [ ] **Step 8: Run the new test and confirm it passes**

Run: `npx vitest run tests/unit/wt-pages/news-page.test.tsx`
Expected: PASS

- [ ] **Step 9: Run the full regression sweep**

Run: `npx vitest run tests/unit/news-page-locale.test.tsx tests/unit/news-localized-bodies.test.tsx tests/unit/build-log-pages.test.tsx tests/unit/wt-pages/news-page.test.tsx tests/unit/messages.test.ts tests/unit/sitemap.test.ts`
Expected: PASS. `tests/unit/build-log-pages.test.tsx`'s `screen.getByRole("link", {name: "..."})` assertions still resolve because the new `StatusLabel` sibling never enters the `<Link>`'s accessible name; `tests/unit/news-page-locale.test.tsx`'s `toContain("繁體消息")` and `sitemap.test.ts`'s slug/locale assertions read `listPublishedNews`/`listPublishedBuildLogs` unchanged.

Run: `npm run audit:strings`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add components/marketing/news-card.tsx components/marketing/build-log-card.tsx components/marketing/news-quality-panel.tsx "app/[locale]/(public)/news/page.tsx" app/styles/wisetech.css messages/en.json messages/zh-HK.json tests/unit/wt-pages/news-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: give the News list a status-labelled grid, quality panel, and subscribe band

Per Decision 2, no filter-chip taxonomy: News and Build Log cards share
one .archive-grid (WP-3's already-shipped, page-agnostic 2-column grid),
distinguished only by a StatusLabel sibling of each card's heading link.
A new NewsQualityPanel states the editorial standard in place of a
taxonomy the data doesn't support, and the subscribe band reuses
FooterNewsletter itself -- not a re-implementation of its mailto pattern --
inside a new dark .news-subscribe-band matching the footer's own tone.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: `/contact` — email fix, six-card grid, prepared-email topic composer (design doc §5, Decision 8, closes the `siteConfig.contact.email` inconsistency)

**Files:**
- Create: `components/wt/inner-card-grid.tsx`
- Create: `components/marketing/prepared-email-form.tsx`
- Rewrite: `app/[locale]/(public)/contact/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/wt-pages/contact-page.test.tsx` (new), `tests/unit/prepared-email-form.test.tsx` (new)
- Regression (must stay green, unmodified): `tests/unit/contact-concierge-launcher.test.tsx`

**Investigation finding, stated explicitly:** `tests/unit/contact-concierge-launcher.test.tsx:38` asserts `expect(en).not.toMatch(/<form\b/)` against the full rendered page, and `:97` asserts `expect(contactSource).not.toContain("<form")` against the page's own source. The design doc's "prepared-email form" must therefore not render an HTML `<form>` element at all. This is achievable exactly as specified — "no persistence, no server action" — with a `<select>` whose `onChange` updates a composed `mailto:` link's `href`; no submission event, no `<form>` wrapper, is needed for that behavior. `PreparedEmailForm` below is written to this constraint on purpose, not as a workaround.

- [ ] **Step 1: Write the failing component test**

Create `tests/unit/prepared-email-form.test.tsx`:

```tsx
import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {PreparedEmailForm} from "@/components/marketing/prepared-email-form";

const labels = {
  topicLabel: "What is this about?",
  composeAction: "Compose email",
  topics: {portal: "Member portal", membership: "Membership", events: "Events", programmes: "Programmes", partnership: "Partnership", privacy: "Privacy", media: "Media"},
  subjects: {portal: "Portal enquiry", membership: "Membership enquiry", events: "Events enquiry", programmes: "Programmes enquiry", partnership: "Partnership enquiry", privacy: "Privacy enquiry", media: "Media enquiry"},
  bodies: {portal: "Portal body", membership: "Membership body", events: "Events body", programmes: "Programmes body", partnership: "Partnership body", privacy: "Privacy body", media: "Media body"},
} as const;

describe("PreparedEmailForm", () => {
  it("renders no <form> element and composes a mailto link for the initial topic", () => {
    const {container} = render(<PreparedEmailForm labels={labels} initialTopic="membership" />);

    expect(container.querySelector("form")).toBeNull();
    const compose = screen.getByRole("link", {name: labels.composeAction});
    expect(compose.getAttribute("href")).toBe(
      `mailto:contact@hkwtia.org?subject=${encodeURIComponent(labels.subjects.membership)}&body=${encodeURIComponent(labels.bodies.membership)}`,
    );
  });

  it("falls back to 'portal' for an unknown or missing initial topic", () => {
    render(<PreparedEmailForm labels={labels} initialTopic="not-a-real-topic" />);
    const compose = screen.getByRole("link", {name: labels.composeAction});
    expect(compose.getAttribute("href")).toContain(encodeURIComponent(labels.subjects.portal));
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/prepared-email-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/marketing/prepared-email-form.tsx`**

```tsx
"use client";

import {useState} from "react";

import {siteConfig} from "@/config/site";

export const CONTACT_TOPICS = ["portal", "membership", "events", "programmes", "partnership", "privacy", "media"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export type PreparedEmailFormLabels = Readonly<{
  topicLabel: string;
  composeAction: string;
  topics: Readonly<Record<ContactTopic, string>>;
  subjects: Readonly<Record<ContactTopic, string>>;
  bodies: Readonly<Record<ContactTopic, string>>;
}>;

function isContactTopic(value: string): value is ContactTopic {
  return (CONTACT_TOPICS as readonly string[]).includes(value);
}

/**
 * D-6, matching the newsletter's own mailto pattern (components/layout/footer-newsletter.tsx):
 * no persistence, no server action. Deliberately no <form> element -- the compose action is a
 * plain link whose href is recomputed on every topic change, so there is nothing to submit and
 * nothing for next.config.ts's `form-action 'self'` CSP directive to block.
 */
export function PreparedEmailForm({labels, initialTopic}: Readonly<{labels: PreparedEmailFormLabels; initialTopic?: string}>) {
  const defaultTopic: ContactTopic = initialTopic && isContactTopic(initialTopic) ? initialTopic : "portal";
  const [topic, setTopic] = useState<ContactTopic>(defaultTopic);
  const mailto = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(labels.subjects[topic])}&body=${encodeURIComponent(labels.bodies[topic])}`;

  return (
    <div className="prepared-email-form">
      <label htmlFor="contact-topic-select">{labels.topicLabel}</label>
      <select
        id="contact-topic-select"
        value={topic}
        onChange={(event) => {
          const {value} = event.target;
          if (isContactTopic(value)) setTopic(value);
        }}
      >
        {CONTACT_TOPICS.map((value) => (
          <option key={value} value={value}>{labels.topics[value]}</option>
        ))}
      </select>
      <a className="button" href={mailto}>{labels.composeAction}</a>
    </div>
  );
}
```

- [ ] **Step 4: Run the component test and confirm it passes**

Run: `npx vitest run tests/unit/prepared-email-form.test.tsx`
Expected: PASS

- [ ] **Step 5: Write the failing page test**

Create `tests/unit/wt-pages/contact-page.test.tsx`:

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
} as const;

import ContactPage from "@/app/[locale]/(public)/contact/page";

async function renderContact(topic?: string) {
  return render(await ContactPage({
    params: Promise.resolve({locale: "en"}),
    searchParams: Promise.resolve(topic ? {topic} : {}),
  }));
}

describe("Contact page — six-card grid and prepared-email composer", () => {
  it("renders six .inner-card links including /about and /news", async () => {
    await renderContact();
    const cards = document.querySelectorAll("a.inner-card");
    expect(cards).toHaveLength(6);
    const hrefs = [...cards].map((card) => card.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/events", "/membership", "/showcase", "/launchpad", "/about", "/news"]));
  });

  it("seeds the topic composer from ?topic= and defaults to 'portal'", async () => {
    await renderContact("events");
    const compose = screen.getByRole("link", {name: bundles.en.Contact.emailTopics.composeAction});
    expect(compose.getAttribute("href")).toContain(encodeURIComponent(bundles.en.Contact.emailTopics.events.subject));
  });
});
```

- [ ] **Step 6: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/contact-page.test.tsx`
Expected: FAIL — no `.inner-card` elements exist yet, no `topic` handling.

- [ ] **Step 7: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Contact.breadcrumbCurrent` | Contact | 聯絡我們 |
| `Contact.viewLabel` | View | 查看 |
| `Contact.routes.about.title` | About WTIA | 關於 WTIA |
| `Contact.routes.about.description` | Meet the association, its leadership and its committees. | 認識協會、其領導層及各委員會。 |
| `Contact.routes.news.title` | News | 新聞 |
| `Contact.routes.news.description` | Read staff-authored news and engineering build logs. | 閱讀職員撰寫的新聞及工程開發日誌。 |
| `Contact.emailTopics.topicLabel` | What is this about? | 你想查詢什麼？ |
| `Contact.emailTopics.composeAction` | Compose email | 撰寫電郵 |
| `Contact.emailTopics.portal.label` | Member portal | 會員平台 |
| `Contact.emailTopics.portal.subject` | Member portal enquiry | 會員平台查詢 |
| `Contact.emailTopics.portal.body` | Hello WTIA, I have a question about the member portal. | 你好 WTIA，我想查詢會員平台的問題。 |
| `Contact.emailTopics.membership.label` | Membership | 會員計劃 |
| `Contact.emailTopics.membership.subject` | Membership enquiry | 會員計劃查詢 |
| `Contact.emailTopics.membership.body` | Hello WTIA, I have a question about membership tiers and eligibility. | 你好 WTIA，我想查詢會員級別及申請資格。 |
| `Contact.emailTopics.events.label` | Events | 活動 |
| `Contact.emailTopics.events.subject` | Events enquiry | 活動查詢 |
| `Contact.emailTopics.events.body` | Hello WTIA, I have a question about an upcoming event. | 你好 WTIA，我想查詢即將舉行的活動。 |
| `Contact.emailTopics.programmes.label` | Programmes | 計劃項目 |
| `Contact.emailTopics.programmes.subject` | Programmes enquiry | 計劃項目查詢 |
| `Contact.emailTopics.programmes.body` | Hello WTIA, I have a question about one of your programmes. | 你好 WTIA，我想查詢其中一項計劃項目。 |
| `Contact.emailTopics.partnership.label` | Partnership | 夥伴合作 |
| `Contact.emailTopics.partnership.subject` | Partnership enquiry | 夥伴合作查詢 |
| `Contact.emailTopics.partnership.body` | Hello WTIA, our organisation would like to discuss a partnership. | 你好 WTIA，我們機構希望商討合作事宜。 |
| `Contact.emailTopics.privacy.label` | Privacy | 私隱 |
| `Contact.emailTopics.privacy.subject` | Privacy enquiry | 私隱查詢 |
| `Contact.emailTopics.privacy.body` | Hello WTIA, I have a question about how my information is handled. | 你好 WTIA，我想查詢我的個人資料處理方式。 |
| `Contact.emailTopics.media.label` | Media | 傳媒 |
| `Contact.emailTopics.media.subject` | Media enquiry | 傳媒查詢 |
| `Contact.emailTopics.media.body` | Hello WTIA, I am writing on behalf of a media outlet. | 你好 WTIA，我代表傳媒機構聯絡。 |

- [ ] **Step 8: Implement `components/wt/inner-card-grid.tsx`**

```tsx
import {Arrow} from '@/components/wt/arrow';
import {Link} from '@/i18n/navigation';

export type InnerCardGridItem = Readonly<{href: string; title: string; copy: string}>;

export function InnerCardGrid({items, actionLabel}: Readonly<{items: readonly InnerCardGridItem[]; actionLabel: string}>) {
  return (
    <div className="inner-card-grid">
      {items.map((item, index) => (
        <Link key={item.href} className="inner-card" href={item.href}>
          <span className="inner-card-index">{String(index + 1).padStart(2, '0')}</span>
          <h3>{item.title}</h3>
          <p>{item.copy}</p>
          <b><span>{actionLabel}</span><Arrow /></b>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Rewrite `app/[locale]/(public)/contact/page.tsx`**

```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ContactConciergeLauncher} from '@/components/marketing/contact-concierge-launcher';
import {PreparedEmailForm, CONTACT_TOPICS} from '@/components/marketing/prepared-email-form';
import {InnerCardGrid} from '@/components/wt/inner-card-grid';
import {PageHero} from '@/components/wt/page-hero';
import {Section} from '@/components/wt/section';
import {siteConfig} from '@/config/site';
import {localizedPath} from '@/lib/urls';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Contact'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/contact', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function ContactPage({params, searchParams = Promise.resolve({})}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: 'Contact'}),
    getTranslations({locale, namespace: 'Common'}),
  ]);
  const appLocale = locale as AppLocale;
  const rawTopic = query.topic;
  const initialTopic = typeof rawTopic === 'string' ? rawTopic : undefined;

  const routeCards = [
    {href: '/events', title: t('routes.events.title'), copy: t('routes.events.description')},
    {href: '/membership', title: t('routes.membership.title'), copy: t('routes.membership.description')},
    {href: '/showcase', title: t('routes.showcase.title'), copy: t('routes.showcase.description')},
    {href: '/launchpad', title: t('routes.launchpad.title'), copy: t('routes.launchpad.description')},
    {href: '/about', title: t('routes.about.title'), copy: t('routes.about.description')},
    {href: '/news', title: t('routes.news.title'), copy: t('routes.news.description')},
  ].map((route) => ({...route, href: localizedPath(appLocale, route.href)}));

  const emailLabels = {
    topicLabel: t('emailTopics.topicLabel'),
    composeAction: t('emailTopics.composeAction'),
    topics: Object.fromEntries(CONTACT_TOPICS.map((topic) => [topic, t(`emailTopics.${topic}.label`)])) as Record<string, string>,
    subjects: Object.fromEntries(CONTACT_TOPICS.map((topic) => [topic, t(`emailTopics.${topic}.subject`)])) as Record<string, string>,
    bodies: Object.fromEntries(CONTACT_TOPICS.map((topic) => [topic, t(`emailTopics.${topic}.body`)])) as Record<string, string>,
  } as Parameters<typeof PreparedEmailForm>[0]['labels'];

  return (
    <>
      <PageHero
        eyebrow={t('eyebrow')}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('breadcrumbCurrent')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <Section tone="paper">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <address className="not-italic text-muted-foreground">
            <h2 className="font-serif text-2xl font-semibold text-foreground">{t('channelsTitle')}</h2>
            <a className="block font-medium text-foreground underline-offset-4 hover:underline" href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>
            {siteConfig.contact.phone === undefined ? null : (
              <a className="block font-medium text-foreground underline-offset-4 hover:underline" href={`tel:${siteConfig.contact.phone.replace(/\s/g, '')}`}>{siteConfig.contact.phone}</a>
            )}
            <p>{t('address')}</p>
          </address>

          <div>
            <PreparedEmailForm labels={emailLabels} initialTopic={initialTopic} />
          </div>
        </div>
      </Section>

      <Section tone="bright">
        <h2 id="contact-routes-title" className="font-serif text-3xl font-semibold">{t('routesTitle')}</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('routesDescription')}</p>
        <div className="mt-6">
          <InnerCardGrid items={routeCards} actionLabel={t('viewLabel')} />
        </div>
      </Section>

      <Section tone="paper">
        <div className="glass-card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-semibold">{t('conciergeTitle')}</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">{t('conciergeDescription')}</p>
          </div>
          <ContactConciergeLauncher label={t('conciergeLauncher')} />
        </div>
      </Section>
    </>
  );
}
```

- [ ] **Step 10: Run the new tests and confirm they pass**

Run: `npx vitest run tests/unit/wt-pages/contact-page.test.tsx tests/unit/prepared-email-form.test.tsx`
Expected: PASS

- [ ] **Step 11: Run the full regression sweep**

Run: `npx vitest run tests/unit/contact-concierge-launcher.test.tsx tests/unit/wt-pages/contact-page.test.tsx tests/unit/prepared-email-form.test.tsx tests/unit/messages.test.ts`
Expected: PASS. `tests/unit/contact-concierge-launcher.test.tsx` passes unmodified: `siteConfig.contact.email` still renders `href="mailto:contact@hkwtia.org"`; `<select>`/`<a>` never emit a `<form>` tag anywhere in the tree or in the page's own source; `routes.events/membership/showcase/launchpad.title` are unchanged (only `about`/`news` are additive); `toMatchObject` on `Contact` stays a partial match.

Run: `npm run audit:strings`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add components/wt/inner-card-grid.tsx components/marketing/prepared-email-form.tsx "app/[locale]/(public)/contact/page.tsx" messages/en.json messages/zh-HK.json tests/unit/wt-pages/contact-page.test.tsx tests/unit/prepared-email-form.test.tsx
git commit -m "$(cat <<'EOF'
feat: fix the Contact email inconsistency and add six route cards plus a topic composer

Contact now reads siteConfig.contact.email instead of a hardcoded literal,
matching how the phone field is already handled. Adds /about and /news to
the route-card grid (Decision 8, now six via a new InnerCardGrid primitive)
and a PreparedEmailForm that composes a mailto: link per ?topic=, built
without an HTML <form> element so no submission or CSP form-action policy
is ever in play -- matching the newsletter's own no-persistence pattern.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: `/ai-transparency`, `/privacy` — `PageHero` swap only (design doc §5, no logic changes)

**Files:**
- Modify: `app/[locale]/(public)/ai-transparency/page.tsx`, `app/[locale]/(public)/privacy/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/wt-pages/policy-pages.test.tsx` (new)
- Regression (must stay green, unmodified): `tests/unit/policy-pages.test.ts`

This is the smallest task in the group, exactly as the design doc frames it: swap the old `components/marketing/page-hero.tsx` import for `components/wt/page-hero.tsx`, add a breadcrumb, and change nothing else. `PolicySections` and `parsePolicySections` are untouched.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/wt-pages/policy-pages.test.tsx`:

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
} as const;

function messageAt(namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles.en);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) =>
    Object.assign((key: string) => String(messageAt(namespace, key)), {raw: (key: string) => messageAt(namespace, key)})),
  setRequestLocale: vi.fn(),
}));

describe.each([
  ["AiTransparency", () => import("@/app/[locale]/(public)/ai-transparency/page")],
  ["Privacy", () => import("@/app/[locale]/(public)/privacy/page")],
])("%s page hero", (namespace, importPage) => {
  it("renders a PageHero with a breadcrumb landmark and the existing eyebrow/title/description", async () => {
    const {default: Page} = await importPage();
    render(await Page({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: bundles.en[namespace as "AiTransparency" | "Privacy"].title})).toBeInTheDocument();
    expect(screen.getByText(bundles.en[namespace as "AiTransparency" | "Privacy"].eyebrow)).toBeInTheDocument();
    expect(screen.getByRole("navigation", {name: /breadcrumb/i})).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/policy-pages.test.tsx`
Expected: FAIL — no breadcrumb `<nav>` landmark exists yet (both pages still use the old `components/marketing/page-hero.tsx`).

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `AiTransparency.breadcrumbCurrent` | AI transparency | AI 透明度 |
| `Privacy.breadcrumbCurrent` | Privacy | 私隱 |

- [ ] **Step 4: Swap the `PageHero` import and props in `app/[locale]/(public)/ai-transparency/page.tsx`**

```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {parsePolicySections, PolicySections} from '@/components/marketing/policy-sections';
import {PageHero} from '@/components/wt/page-hero';
import type {AppLocale} from '@/i18n/routing';
import {Link} from '@/i18n/navigation';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'AiTransparency'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/ai-transparency', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function AiTransparencyPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: 'AiTransparency'}),
    getTranslations({locale, namespace: 'Common'}),
  ]);

  return (
    <>
      <PageHero
        eyebrow={t('eyebrow')}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('breadcrumbCurrent')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <PolicySections sections={parsePolicySections(t.raw('sections'))} />
      <section className="container mx-auto max-w-3xl px-6 pb-16">
        <Link className="font-semibold text-primary" href="/ai-ops">{t('aiOpsLink')}</Link>
      </section>
    </>
  );
}
```

- [ ] **Step 5: Swap the `PageHero` import and props in `app/[locale]/(public)/privacy/page.tsx`**

```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {parsePolicySections, PolicySections} from '@/components/marketing/policy-sections';
import {PageHero} from '@/components/wt/page-hero';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Privacy'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/privacy', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function PrivacyPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: 'Privacy'}),
    getTranslations({locale, namespace: 'Common'}),
  ]);

  return (
    <>
      <PageHero
        eyebrow={t('eyebrow')}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('breadcrumbCurrent')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <PolicySections sections={parsePolicySections(t.raw('sections'))} />
    </>
  );
}
```

- [ ] **Step 6: Run the new test and confirm it passes**

Run: `npx vitest run tests/unit/wt-pages/policy-pages.test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full regression sweep**

Run: `npx vitest run tests/unit/policy-pages.test.ts tests/unit/wt-pages/policy-pages.test.tsx tests/unit/messages.test.ts`
Expected: PASS — `tests/unit/policy-pages.test.ts` reads `parsePolicySections(bundle.Privacy.sections)`/`bundle.AiTransparency.sections` directly from the JSON bundles, untouched by this task's prop/import changes, and still finds `contact@hkwtia.org` inside `Privacy`'s existing body copy (unrelated to the `siteConfig.contact.email` fix in Task 19, which only touches the `/contact` page's own rendering).

Run: `npm run audit:strings`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/[locale]/(public)/ai-transparency/page.tsx" "app/[locale]/(public)/privacy/page.tsx" messages/en.json messages/zh-HK.json tests/unit/wt-pages/policy-pages.test.tsx
git commit -m "$(cat <<'EOF'
feat: move AI transparency and Privacy onto the shared PageHero

Straightforward swap from the old components/marketing/page-hero.tsx to
components/wt/page-hero.tsx, adding a breadcrumb landmark to each. No
change to PolicySections, parsePolicySections, or either page's copy.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: `/ai-ops` — extract the page-level `PageHero`, shrink `AiOpsDashboardLabels`, adopt `.impact-metrics` (design doc §5, Decision 3)

**Files:**
- Modify: `components/marketing/aiops/dashboard.tsx`, `components/marketing/aiops/metric-grid.tsx`
- Modify: `app/[locale]/(public)/ai-ops/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Rewrite: `tests/unit/aiops-components.test.tsx`
- Test: `tests/unit/wt-pages/ai-ops-page.test.tsx` (new)
- Regression (must stay green, unmodified as far as possible): `tests/unit/aiops-page.test.tsx`

**Investigation finding, stated explicitly:** `tests/unit/aiops-components.test.tsx` currently unit-tests `AiOpsDashboard` with a full `AiOpsDashboardLabels` fixture that includes `eyebrow`/`title`/`description`, and asserts `screen.getByRole("heading", {name: labels.title})`, `screen.getByText(labels.eyebrow)`, `screen.getByText(labels.description)` directly against the component. Decision 3 requires exactly the opposite contract — those three fields move out of `AiOpsDashboardLabels` to the page level — so this test **must** be rewritten as part of this task; it is not one of the untouched regressions. `tests/unit/aiops-page.test.tsx`, by contrast, never asserts the header directly (confirmed by reading it in full) and needs no changes beyond continuing to pass.

- [ ] **Step 1: Write the failing page test for the extracted hero**

Create `tests/unit/wt-pages/ai-ops-page.test.tsx`:

```tsx
import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const translated: Record<string, string> = {
  metaTitle: "t", metaDescription: "t", eyebrow: "AI-Ops in public", title: "Operational AI, measured in public",
  description: "Hourly, privacy-safe evidence.", currentMonth: "Current Hong Kong month", empty: "No metrics are available for this month yet",
  unavailable: "Metrics are temporarily unavailable", breadcrumbCurrent: "AI-Ops", breadcrumbHome: "Home", breadcrumbLabel: "Breadcrumb",
};

vi.mock("@/lib/db/repos/aiops-public", () => ({aiOpsPublicRepository: {readLatestTwelveMonths: vi.fn().mockResolvedValue(null)}}));
vi.mock("@/lib/db/repos/public-posts", () => ({publicPostsRepository: {listPublishedBuildLogs: vi.fn().mockResolvedValue([])}}));
vi.mock("next-intl/server", () => ({
  // Keyed lookup, not a namespace-wide constant: this page's PageHero call reads both
  // Common.breadcrumbHome and Common.breadcrumbLabel, and they must resolve to different strings.
  getTranslations: vi.fn(async () => (key: string) => translated[key] ?? key),
  setRequestLocale: vi.fn(),
}));

import AiOpsPage from "@/app/[locale]/(public)/ai-ops/page";

describe("AI-Ops page — extracted PageHero", () => {
  it("renders one page-level h1 with a breadcrumb, and the dashboard starts at the metrics", async () => {
    render(await AiOpsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: translated.title})).toBeInTheDocument();
    expect(screen.getByText(translated.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole("navigation", {name: /breadcrumb/i})).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/ai-ops-page.test.tsx`
Expected: FAIL — `AiOpsPage` does not yet render a `PageHero`/breadcrumb; the `<h1>` is still built inline inside `AiOpsDashboard`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `AiOps.breadcrumbCurrent` | AI-Ops | AI-Ops |

- [ ] **Step 4: Shrink `AiOpsDashboardLabels` and remove the inline header in `components/marketing/aiops/dashboard.tsx`**

```tsx
import type {AppLocale} from "@/i18n/routing";
import type {AiOpsDashboardState} from "@/lib/aiops/dashboard";
import type {PublishedBuildLogSummary} from "@/lib/db/repos/public-posts";
import {ArchitectureDiagram} from "./architecture-diagram";
import {EvidenceLinks} from "./evidence-links";
import {MetricGrid} from "./metric-grid";
import {RenewalChart} from "./renewal-chart";

// Decision 3: eyebrow/title/description move to the page-level PageHero
// (app/[locale]/(public)/ai-ops/page.tsx). This type keeps only what the metrics content
// itself needs.
export type AiOpsDashboardLabels = Readonly<{currentMonth:string;partialMonth:string;lastUpdated:string;fresh:string;stale:string;empty:string;unavailable:string;notEnoughData:string;conversations:string;resolved:string;firstResponse:string;csat:string;escalation:string;failure:string;hoursSaved:string;llmCost:string;responses:string;samples:string;hours:string;resolutionTarget:string;csatTarget:string;renewalHeading:string;overallRenewal:string;firstYearRenewal:string;overallTarget:string;firstYearTarget:string;renewalChartTitle:string;renewalChartDescription:string;month:string;paid:string;due:string;rate:string;methodologyHeading:string;methodologyDescription:string;architectureHeading:string;architectureDescription:string;approvalGate:string;publicationGate:string;evidenceHeading:string;buildLogs:string;source:string;commits:string;deployment:string;acceptance:string;noBuildLogs:string}>;
type Evidence=Readonly<{id:"source"|"commits"|"deployment"|"acceptance";href:string}>;

export function AiOpsDashboard({locale,state,buildLogs,evidence,labels}:Readonly<{locale:AppLocale;state:AiOpsDashboardState;buildLogs:readonly PublishedBuildLogSummary[];evidence:readonly Evidence[];labels:AiOpsDashboardLabels}>){
  const detail=state.status==="unavailable"?labels.unavailable:state.status==="empty"?labels.empty:state.status==="fresh"?labels.fresh:labels.stale;
  const current=state.current;
  const updated=current?new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Hong_Kong"}).format(current.refreshedAt):null;
  return <div className="container mx-auto space-y-8 px-6 py-16">
    <header className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span>{labels.currentMonth}</span>
      {current?.isPartialMonth?<span>{labels.partialMonth}</span>:null}
      {updated?<span>{labels.lastUpdated}: {updated}</span>:null}
      <span>{detail}</span>
    </header>
    {current?<><MetricGrid metric={current} locale={locale} labels={labels}/><div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span>{labels.resolutionTarget}</span><span>{labels.csatTarget}</span></div><RenewalChart months={state.months} locale={locale} labels={labels}/></>:null}
    <section className="glass-card space-y-3 p-6"><h2 className="font-serif text-2xl font-semibold">{labels.methodologyHeading}</h2><p className="text-muted-foreground">{labels.methodologyDescription}</p></section>
    <ArchitectureDiagram labels={labels}/>
    <EvidenceLinks locale={locale} buildLogs={buildLogs} evidence={evidence} labels={labels}/>
  </div>;
}
```

- [ ] **Step 5: Adopt `.impact-metrics` styling in `components/marketing/aiops/metric-grid.tsx`**

```tsx
import type {AiOpsMonthlyMetric} from "@/lib/aiops/contracts";
import type {AiOpsDashboardLabels} from "./dashboard";
function number(locale: string, options: Intl.NumberFormatOptions) { return new Intl.NumberFormat(locale, options); }
function rate(value: number | null, locale: string, missing: string) { return value === null ? missing : number(locale, {style:"percent",minimumFractionDigits:1,maximumFractionDigits:1}).format(value); }
// design doc §5 /ai-ops: metric cards adopt the exact classes the homepage's Impact Evidence
// section already uses (app/styles/wisetech.css:240-246 .impact-metrics), reusing its
// strong/span/small grammar rather than the old glass-card boxes.
export function MetricGrid({metric,locale,labels}: Readonly<{metric: AiOpsMonthlyMetric;locale:string;labels:AiOpsDashboardLabels}>) { const whole=number(locale,{maximumFractionDigits:0}); const decimal=number(locale,{minimumFractionDigits:2,maximumFractionDigits:2}); const cost=number(locale === "en" ? "en-HK" : locale,{style:"currency",currency:"USD",minimumFractionDigits:6,maximumFractionDigits:6}); const cards=[[labels.conversations,whole.format(metric.conversationCount),null],[labels.resolved,rate(metric.agentResolvedRate,locale,labels.notEnoughData),`${whole.format(metric.resolvedConversationCount)} / ${whole.format(metric.terminalConversationCount)}`],[labels.escalation,rate(metric.escalationRate,locale,labels.notEnoughData),`${whole.format(metric.escalatedConversationCount)} / ${whole.format(metric.terminalConversationCount)}`],[labels.failure,rate(metric.failureRate,locale,labels.notEnoughData),`${whole.format(metric.failedConversationCount)} / ${whole.format(metric.terminalConversationCount)}`],[labels.firstResponse,metric.medianFirstResponseMs===null?labels.notEnoughData:`${whole.format(metric.medianFirstResponseMs)} ms`,`${whole.format(metric.firstResponseSampleCount)} ${labels.samples}`],[labels.csat,metric.csatAverage===null?labels.notEnoughData:`${decimal.format(metric.csatAverage)} / 5`,`${whole.format(metric.csatResponseCount)} ${labels.responses}`],[labels.hoursSaved,`${decimal.format(metric.staffHoursSaved)} ${labels.hours}`,null],[labels.llmCost,cost.format(metric.llmCostUsd),null]] as const; return <div className="impact-metrics" aria-label={labels.currentMonth}>{cards.map(([title,value,note])=><div key={title}><strong>{value}</strong><span>{title}</span>{note?<small>{note}</small>:null}</div>)}</div>; }
```

- [ ] **Step 6: Extract the `PageHero` in `app/[locale]/(public)/ai-ops/page.tsx`**

```tsx
import type {Metadata} from "next";
import {getTranslations,setRequestLocale} from "next-intl/server";
import {AiOpsDashboard,type AiOpsDashboardLabels} from "@/components/marketing/aiops/dashboard";
import {PageHero} from "@/components/wt/page-hero";
import {AI_OPS_EXTERNAL_EVIDENCE} from "@/config/aiops-evidence";
import type {AppLocale} from "@/i18n/routing";
import {buildAiOpsDashboardState,unavailableAiOpsDashboardState} from "@/lib/aiops/dashboard";
import {aiOpsPublicRepository} from "@/lib/db/repos/aiops-public";
import {publicPostsRepository} from "@/lib/db/repos/public-posts";
import {buildPageMetadata} from "@/lib/metadata";
type Props={params:Promise<{locale:string}>}; export const revalidate=300;
// Decision 3: eyebrow/title/description are page-level PageHero content now, not part of
// AiOpsDashboardLabels -- see components/marketing/aiops/dashboard.tsx.
const keys=["currentMonth","partialMonth","lastUpdated","fresh","stale","empty","unavailable","notEnoughData","conversations","resolved","firstResponse","csat","escalation","failure","hoursSaved","llmCost","responses","samples","hours","resolutionTarget","csatTarget","renewalHeading","overallRenewal","firstYearRenewal","overallTarget","firstYearTarget","renewalChartTitle","renewalChartDescription","month","paid","due","rate","methodologyHeading","methodologyDescription","architectureHeading","architectureDescription","approvalGate","publicationGate","evidenceHeading","buildLogs","source","commits","deployment","acceptance","noBuildLogs"] as const;
async function labels(locale:string):Promise<AiOpsDashboardLabels>{const t=await getTranslations({locale,namespace:"AiOps"});return Object.fromEntries(keys.map(key=>[key,t(key)])) as AiOpsDashboardLabels}
function safe(rows:Awaited<ReturnType<typeof publicPostsRepository.listPublishedBuildLogs>>){return rows.filter(row=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)&&!/[\r\n@]/.test(`${row.titleEn}${row.titleZh}${row.author}`))}
export async function generateMetadata({params}:Props):Promise<Metadata>{const {locale}=await params;const t=await getTranslations({locale,namespace:"AiOps"});return buildPageMetadata({locale:locale as AppLocale,pathname:"/ai-ops",title:t("metaTitle"),description:t("metaDescription")})}
export default async function AiOpsPage({params}:Props){
  const {locale}=await params;setRequestLocale(locale);
  const [rows,published,uiLabels,heroT,common]=await Promise.all([
    aiOpsPublicRepository.readLatestTwelveMonths().catch(()=>null),
    publicPostsRepository.listPublishedBuildLogs().catch(()=>[]),
    labels(locale),
    getTranslations({locale,namespace:"AiOps"}),
    getTranslations({locale,namespace:"Common"}),
  ]);
  const state=rows?buildAiOpsDashboardState(rows,new Date()):unavailableAiOpsDashboardState();
  return <>
    <PageHero
      eyebrow={heroT("eyebrow")}
      title={heroT("title")}
      lead={heroT("description")}
      breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: heroT("breadcrumbCurrent")}}
      breadcrumbLabel={common("breadcrumbLabel")}
    />
    <AiOpsDashboard locale={locale as AppLocale} state={state} buildLogs={safe(published)} evidence={AI_OPS_EXTERNAL_EVIDENCE} labels={uiLabels}/>
  </>;
}
```

- [ ] **Step 7: Rewrite `tests/unit/aiops-components.test.tsx` for the shrunk contract**

Remove `eyebrow`, `title`, `description` from the `labels` fixture and delete the three assertions that check for them (`getByRole("heading", {name: labels.title})`, `getByText(labels.eyebrow)`, `getByText(labels.description)`). Change the two metric-title lookups from heading queries to text queries, matching the new `.impact-metrics` `span` grammar:

```tsx
// was: expect(screen.getByRole("heading", {name: "Agent resolved"}).parentElement!)
// now:
expect(screen.getByText("Agent resolved").parentElement!.querySelector("small") ?? screen.getByText("Agent resolved").parentElement!).toBeTruthy();
expect(within(screen.getByText("Agent resolved").parentElement!).getByText("80.0%")).toBeInTheDocument();
```

and:

```tsx
// was: expect(screen.getByRole("heading", {name: "Escalation rate"})).toBeVisible();
// was: expect(screen.getByRole("heading", {name: "Failure rate"})).toBeVisible();
// now:
expect(screen.getByText("Escalation rate")).toBeVisible();
expect(screen.getByText("Failure rate")).toBeVisible();
```

Apply the same fixture edit to `dashboard(state)`'s `labels` object at the top of the file (drop the three keys) and to the `AiOpsDashboardLabels` import usage — the object literal no longer needs `eyebrow`/`title`/`description` entries. All other assertions (renewal chart, architecture diagram, evidence links) are untouched.

- [ ] **Step 8: Run the tests and confirm the new one passes, and the rewritten one passes**

Run: `npx vitest run tests/unit/wt-pages/ai-ops-page.test.tsx tests/unit/aiops-components.test.tsx`
Expected: PASS

- [ ] **Step 9: Run the full regression sweep**

Run: `npx vitest run tests/unit/aiops-page.test.tsx tests/unit/aiops-dashboard.test.ts tests/unit/aiops-evidence.test.ts tests/unit/aiops-metrics-repository.test.ts tests/unit/aiops-public-repository.test.ts tests/unit/wt-pages/ai-ops-page.test.tsx tests/unit/aiops-components.test.tsx tests/unit/messages.test.ts`
Expected: PASS. `tests/unit/aiops-page.test.tsx`'s "matches the complete approved Traditional Chinese AI-Ops copy" test still passes unmodified: it pins `Object.values(chinese)` from `messages/zh-HK.json`'s `AiOps` object, whose key set and order this task never touches (only the `keys` array `page.tsx` reads from it changes; the bundle itself is untouched apart from the one additive `breadcrumbCurrent` key, added at the end so it doesn't shift `Object.values` for the *existing* keys the test enumerates — confirm the new key lands after `noBuildLogs` in both bundles before running this check).

Run: `npm run audit:strings`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add components/marketing/aiops/dashboard.tsx components/marketing/aiops/metric-grid.tsx "app/[locale]/(public)/ai-ops/page.tsx" messages/en.json messages/zh-HK.json tests/unit/aiops-components.test.tsx tests/unit/wt-pages/ai-ops-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: extract AI-Ops' page header into PageHero and adopt .impact-metrics

Per Decision 3, AiOpsDashboardLabels drops eyebrow/title/description --
those now live in a page-level PageHero call -- and AiOpsDashboard starts
one level lower, at its freshness status line and metrics. MetricGrid's
eight tiles adopt the exact .impact-metrics classes the homepage's Impact
Evidence section already uses. tests/unit/aiops-components.test.tsx is
rewritten for the shrunk contract; tests/unit/aiops-page.test.tsx, which
never asserted the header directly, needed no changes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: `(public)/not-found.tsx` — move under the public route group, inherit the shell (design doc §5, Decision 4)

**Files:**
- Create: `app/[locale]/(public)/not-found.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/wt-pages/public-not-found.test.tsx` (new)
- Regression (must stay green, unmodified): none of the existing suite references `app/[locale]/not-found.tsx` by path, but this task must not touch that file at all — confirmed by `grep -rl "app/\[locale\]/not-found" tests/` returning nothing, so there is no existing pin to preserve; this task adds the first one.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/wt-pages/public-not-found.test.tsx`:

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
} as const;

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) =>
    (key: string) => {
      const root = namespace.split(".").reduce<Record<string, unknown>>((v, p) => (v[p] as Record<string, unknown>), bundles.en);
      return String(root[key]);
    }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: React.ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("Public (public)/not-found page", () => {
  it("renders inside the public shell's own hero primitive, with home and events actions", async () => {
    const {default: PublicNotFound} = await import("@/app/[locale]/(public)/not-found");
    render(await PublicNotFound());

    expect(screen.getByRole("heading", {level: 1, name: bundles.en.NotFound.title})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.NotFound.homeAction})).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", {name: bundles.en.NotFound.eventsAction})).toHaveAttribute("href", "/events");
  });

  it("leaves the root-level locale-less fallback file untouched", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/not-found.tsx"), "utf8");
    expect(source).toContain("t('contact')");
    expect(source).toContain("t('home')");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/public-not-found.test.tsx`
Expected: FAIL — `app/[locale]/(public)/not-found.tsx` does not exist yet (the second assertion in the file passes already, since the root file is untouched from the start; the first `it` block is what fails).

- [ ] **Step 3: Add the message keys**

New keys only — `NotFound.title`/`NotFound.description`/`NotFound.home`/`NotFound.contact` are reused byte-for-byte by the still-unmodified root `app/[locale]/not-found.tsx`, so this task adds new keys rather than repurposing those four.

| Key | EN | ZH |
|---|---|---|
| `NotFound.eyebrow` | Not found | 找不到頁面 |
| `NotFound.homeAction` | Go to the homepage | 返回首頁 |
| `NotFound.eventsAction` | Find an event | 尋找活動 |

- [ ] **Step 4: Create `app/[locale]/(public)/not-found.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {PageHero} from '@/components/wt/page-hero';

/**
 * Decision 4: app/[locale]/not-found.tsx (the root-level file, unchanged by this task) is
 * wrapped only by app/[locale]/layout.tsx -- no SiteHeader, SiteFooter, ConciergeWidget, and
 * neither wisetech.css nor wisetech-shell.css, all four mounted exclusively by
 * app/[locale]/(public)/layout.tsx. This route-group-scoped not-found.tsx is what every real
 * dead link inside the public site actually renders from now on; the root file remains as the
 * bare fallback for a request whose [locale] segment itself doesn't resolve at all, where no
 * shell could be mounted regardless (there is no locale to render SiteHeader's nav in).
 */
export default async function PublicNotFound() {
  // Locale-independent by design: Next.js renders a route group's not-found.tsx outside the
  // normal params flow, so there is no {locale} to read here the way every other page in this
  // programme does. English is deliberately correct for readers who fell out of any locale
  // path (the same "no locale segment" caveat the root file's own not-found.tsx already lives
  // with); a locale-aware Concierge or nav link the reader clicks from here still lands them on
  // a fully localized page.
  const t = await getTranslations({locale: 'en', namespace: 'NotFound'});

  return (
    <PageHero
      variant="inner"
      eyebrow={t('eyebrow')}
      title={t('title')}
      lead={t('description')}
      actions={[
        {href: '/', label: t('homeAction')},
        {href: '/events', label: t('eventsAction')},
      ]}
    />
  );
}
```

- [ ] **Step 5: Run the new test and confirm it passes**

Run: `npx vitest run tests/unit/wt-pages/public-not-found.test.tsx`
Expected: PASS

- [ ] **Step 6: Confirm the root-level file is genuinely untouched and the whole suite is green**

Run: `git diff --stat app/[locale]/not-found.tsx`
Expected: empty output (no changes staged or unstaged to that file).

Run: `npx vitest run tests/unit/wt-pages/public-not-found.test.tsx tests/unit/messages.test.ts tests/unit/route-ownership.test.ts tests/unit/next-route-exports.test.ts`
Expected: PASS.

Run: `npm run audit:strings`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS — confirms `PublicNotFound`'s no-arg signature satisfies Next's `not-found.tsx` convention for a route group (no `params`/`searchParams` are passed to a `not-found.tsx` module).

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/(public)/not-found.tsx" messages/en.json messages/zh-HK.json tests/unit/wt-pages/public-not-found.test.tsx
git commit -m "$(cat <<'EOF'
feat: give the public site its own not-found page inside the site shell

app/[locale]/(public)/not-found.tsx is new, inheriting SiteHeader,
SiteFooter, ConciergeWidget and the donor stylesheets automatically via
the (public) route group -- what a real dead link inside the site now
renders, instead of the bare, unstyled root fallback. The root-level
app/[locale]/not-found.tsx is untouched and stays as the fallback for a
request whose locale segment doesn't resolve at all.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: Verify `tests/e2e/public-route-matrix.spec.ts` and `tests/e2e/wisetech-pr5-public-journeys.spec.ts` against the rewritten pages

**Files:** potentially `tests/e2e/public-route-matrix.spec.ts`, `tests/e2e/wisetech-pr5-public-journeys.spec.ts` — modified only if Step 1/2 below actually finds a break.

Design spec §7 calls for these two suites' selectors to be "updated for the new markup." Reading both files in full against what Tasks 1–22 actually changed: neither pins a class or structural selector this plan touches.

- `public-route-matrix.spec.ts` only asserts HTTP status `<400`, no environment-variable error banner, and exactly one visible `<h1>` per route/locale — every rewritten page in this plan keeps exactly one `<h1>` (each `wt-pages/*.test.tsx` added in Tasks 4–22 asserts this directly via `PageHero`/the page's own single heading), so this file is expected to need no changes.
- `wisetech-pr5-public-journeys.spec.ts`'s four tests check: (1) the `Events`/`Showcase` unavailable/empty heading **text** and URL-with-fragment survives a locale switch — Tasks 4 and 7 never change the `unavailableTitle`/`emptyTitle` message *values*, only add new keys around them; (2) the Membership catalog's unavailable notice, scoped to `main#main-content`'s own `role="status"` — Task 9 keeps `HonestEmpty` rendering the same one status region in that landmark; (3) the Contact Concierge launcher scoped to `main#main-content`, by its unchanged accessible name "Ask WiseTech" — Task 19 leaves `ContactConciergeLauncher` untouched; (4) `EventDetail`/`LegacyNetwork` rendered directly via `tsxRequire`, bypassing the page entirely — Task 6 explicitly keeps `EventDetail` unmodified. None of the four exercises a selector this plan's rewrites touch.

This task exists to **verify that analysis against the real, merged code** rather than take it on faith, and to fix anything the analysis missed — not to preemptively rewrite either file.

- [ ] **Step 1: Run both suites after all of Tasks 1–22 have landed**

Run: `npx playwright test tests/e2e/public-route-matrix.spec.ts tests/e2e/wisetech-pr5-public-journeys.spec.ts`
Expected: PASS, all cases, both locales.

- [ ] **Step 2: If either suite fails, fix the break at its root, not by loosening the assertion**

If a route now renders more than one `<h1>` or a non-2xx/3xx status, that is a real regression in the page task that introduced it — fix the page, not this test. If a heading-text or scoped-`role="status"` assertion fails because a task's rewrite genuinely changed that visible copy on purpose, update the specific string this test expects to match the new, intentional copy (do not broaden the selector or remove the scoping). Re-run Step 1 after any fix until both suites pass.

- [ ] **Step 3: Commit (only if Step 2 required a change; otherwise this task makes no commit)**

```bash
git add tests/e2e/public-route-matrix.spec.ts tests/e2e/wisetech-pr5-public-journeys.spec.ts
git commit -m "$(cat <<'EOF'
test: reconcile the public route-matrix and journeys e2e specs with WP-4

Both suites were verified against every page rewritten in Tasks 1-22; this
commit only exists if that verification found a real break to fix.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Whole-branch regression gate and PR

**Files:** none created — this task only runs verification across everything Tasks 1–23 touched, checks out the two auto-regenerated files, and opens the PR.

Every prior task already runs its own focused test slice; this task is the final, whole-programme gate before opening a PR, mirroring the same closing pattern WP-3 used. `next dev`/`next build` auto-regenerate `AGENTS.md` and `next-env.d.ts` on every run in this repo — always `git checkout -- AGENTS.md next-env.d.ts` before committing anything from a build/dev run, per this repo's own established convention.

- [ ] **Step 1: Confirm the worktree is clean of the two auto-regenerated files**

Run: `git status --porcelain -- AGENTS.md next-env.d.ts`
Expected: if either shows as modified, run `git checkout -- AGENTS.md next-env.d.ts` before proceeding.

- [ ] **Step 2: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS, 0 failures — every task's own focused test file plus every regression file every task named ("must stay green, unmodified") passes in the same run.

- [ ] **Step 3: Run the full TypeScript check**

Run: `npm run typecheck`
Expected: PASS, no errors — confirms every new `components/wt/*`/`components/marketing/*` primitive's prop types line up with every page that calls it (in particular, the `PageHero` `breadcrumbLabel` prop from Task 1 and the `RichCompass`/`RichRelatedRoutes` prop shapes from Tasks 10–11 are used consistently across Tasks 12–16, and `EventCard`/`EventCalendarView`'s shared `PublicEventProjection` shape is used consistently across Tasks 3–6).

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS — in particular this catches unused imports left behind by any task's restyle (e.g. a page that no longer imports the retired `components/marketing/page-hero.tsx` or `InstitutionalPageIntro`/`ProgramDetail`/`empty-state.tsx` after its rewrite).

- [ ] **Step 5: Run the visible-string audit**

Run: `npm run audit:strings`
Expected: PASS — every new label this plan added (Events, Showcase, Membership, About/History/Chairman/Committees, Programs, LaunchPad, News, Contact, AiTransparency/Privacy, AiOps, NotFound, Common) is read through `t(...)`/`labels.x`, never a literal JSX text node.

- [ ] **Step 6: Confirm `messages/en.json` and `messages/zh-HK.json` stay in exact key parity**

Run: `npx vitest run tests/unit/messages.test.ts`
Expected: PASS — this is also covered by Step 2, called out on its own because it is the single test most likely to catch a key added to one bundle and forgotten in the other across 22 tasks' worth of message-table edits.

- [ ] **Step 7: Run the full Playwright accessibility suite**

Run: `npx playwright test tests/e2e/accessibility.spec.ts`
Expected: PASS — confirms none of the new inner pages introduces a color-contrast or landmark regression (this plan's `PageHero` breadcrumb change, in particular, replaces a `<div>` with a `<nav aria-label>` on every page that adopts it, so this is the first whole-suite check that lands after that change is live everywhere).

- [ ] **Step 8: Confirm no auto-regenerated file crept back in, then review the diff**

Run: `git checkout -- AGENTS.md next-env.d.ts && git status`
Expected: `AGENTS.md`/`next-env.d.ts` show no diff; every other changed file matches what Tasks 1–23 described touching.

- [ ] **Step 9: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: WP-4 inner-page patterns (Events, Showcase, Membership, About, Programs, Launch Pad, News, Contact, AI-Ops, not-found)" --body "$(cat <<'EOF'
## Summary

- Two cross-cutting fixes every other task depends on: `PageHero`'s breadcrumb is now a `<nav aria-label>` landmark (closing errata E-11's deferral), and the concierge launcher is wrapped in the donor's `.concierge` positioning div so the six donor rules keyed to that class (event-action-bar lift, narrow-viewport hide) stop being inert.
- `/events`, `/events/[slug]`: donor hero/quick-tabs/activity-strip/EventCard grid, a cards-vs-calendar view switch, and the donor detail-hero/facts/action-bar grammar — `EventDetail`/`StructuredData`/registration logic untouched.
- `/showcase`, `/showcase/[slug]`, `/membership`: directory-prompts/solution-needs/solution-verification/solution-pathways, an E-29 search-input-id fix, and a plan-grid/dimensions/pricing-note membership rewrite — all three real reads (`showcaseRepository`, `membershipPlansRepository`) unchanged.
- `/about` (+3 subpages, +`/about/history/[slug]`), `/programs/{asa,hkict,tct,cpai}`: two new shared primitives (`RichCompass`, `RichRelatedRoutes`) and a shared `ProgrammeRecordPage` header pattern, deliberately withholding a compass on Chairman/Committees where there is nothing real to link or count.
- `/launchpad`, `/news`, `/contact`, `/ai-transparency`, `/privacy`, `/ai-ops`, and a new route-group `not-found.tsx`: a shared `RouteMap` primitive serving both the homepage's 4-node and Launch Pad's 3-node GBA visualizations, a status-labelled News grid, a `<form>`-free prepared-email composer on Contact (required by an existing pinned test), and an extracted `PageHero` for AI-Ops.
- Every task's own investigation is recorded inline where the design spec's language didn't match the real codebase (no `format` field on events, no `.first-90` class, two distinct GBA route-map shapes, CPAI has no editions field) — each resolved by surfacing the real data/class instead of fabricating one.

## Test plan

- [ ] `npx vitest run` — full unit suite green
- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npm run audit:strings` — clean
- [ ] `npx playwright test tests/e2e/accessibility.spec.ts` — 19/19 passing
- [ ] `AGENTS.md`/`next-env.d.ts` unmodified in the diff

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL back once created.
