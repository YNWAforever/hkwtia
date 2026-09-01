# WiseTech PR5 Public Journeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Cut public WiseTech-pattern journeys over to the existing HKWTIA server-side authorities, including the smallest additive Event hero-media relation, without importing donor content or changing durable authenticated flows.

**Architecture:** Pages remain thin Server Components: they call repository-owned public readers and hand display-safe, locale-specific projections to presentation components. Pure parsers and catalog adapters receive injected clocks/readers so their behavior is deterministic and credential-free under Vitest. The only schema work is the nullable Event-to-media relation; application rollback removes consumers while leaving that additive database shape intact.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, next-intl, Drizzle ORM/Postgres, Zod, Vitest, Testing Library, Playwright, Radix Dialog.

## Global Constraints

- Treat the frozen WiseTech donor only as presentation evidence: do not copy donor runtime, database data, assets, logos, forms, authentication, routers, providers, or historical partner logos.
- Every database read remains in lib/db/repos and every public consumer receives a display-safe projection; pages and Client Components never import Drizzle schema/database objects.
- A repository/read/projection failure fails closed; it never activates a static, donor, or hard-coded fallback.
- Do not execute db:migrate, seed/import rows, inspect/configure providers, deploy, merge, publish a pull request, or perform PR6/PR7 work.
- Do not change Neon Auth, Join/onboarding, checkout, Stripe webhooks/payment state, cohort application, funding parser/results, Showcase lead ownership, or Concierge API/runtime guardrails.
- Do not create inquiry schema/forms/actions, a second directory/lead flow/assistant runtime, Event registration-window/event-format/CTA-state columns, or browser-side database access.
- English and Traditional Chinese are first-class; zh-HK routes map to /zh and locale switches retain pathname, serialized query, and hash.
- New interactive controls are keyboard reachable, visibly focused, at least the established 44px target convention, semantically labelled, and do not convey availability solely by color.
- Only approved own-origin registry images may render. A URL exactly matching /api/media/<uuid> must use unoptimized image delivery; do not add a remote image host.
- Preserve unrelated working-tree changes. Stage and commit only the explicit files for each task; never run a broad add.

## File Structure

- Modify lib/db/schema-core.ts, drizzle/0023_wisetech_event_hero.sql, drizzle/meta/0023_snapshot.json, and drizzle/meta/_journal.json: nullable Event hero-media foreign key, index, and committed-only generated artifacts.
- Modify lib/db/repos/events.ts, lib/db/repos/media.ts, lib/admin/event-form-input.ts, lib/admin/event-action-core.ts, lib/admin/event-actions.ts, components/admin/event-form.tsx, and both Event admin pages: transactional active-media validation and Event-aware archive protection.
- Create lib/events/public.ts and lib/events/registration-action.ts; modify Event repository/pages, components/marketing/event-detail.tsx, components/portal/event-registration-form.tsx, lib/portal/event-action-core.ts, and portal Event page: deterministic public status/read projections and explicit registration outcomes while retaining portal registration.
- Modify lib/public-shell/announcement.ts, components/layout/announcement-bar.tsx, public layout, homepage, and new focused marketing components: localize the persisted safe projection into a lifecycle-free AnnouncementBar DTO and render the guarded partner wall.
- Modify lib/db/repos/public-posts.ts, lib/home/home-highlights.ts, News pages, app/sitemap.ts, and add a safe News detail component: distinct localized News versus unchanged Build Log contracts.
- Modify Launch Pad page, LandingPartnerMap typing if required, synthetic-content audit/script test, and delete config/landing-partners.ts plus config/landing-partners.json atomically.
- Create lib/db/repos/membership-plans.ts and lib/membership/public-catalog.ts; modify membership page and TierComparison: repository-only reconciled catalog with server-only price-ID eligibility.
- Modify Showcase index/detail presentation and tests only; retain repository, view beacon, structured data, and requestIntroAction owners.
- Create lib/ai/concierge-open.ts and components/marketing/contact-concierge-launcher.tsx; modify ConciergeWidget, Contact page, messages, and tests: code-owned same-window dialog opening and durable contact route cards.
- Create tests/e2e/wisetech-pr5-public-journeys.spec.ts and focused unit suites named below. Do not add credentials, migration execution, database mutation, provider calls, or external-state assertions.

---

### Task 1: Add the nullable Event hero relation and keep admin/media lifecycle authoritative

**Files:**

- Modify: lib/db/schema-core.ts:607-622, lib/db/repos/events.ts, lib/db/repos/media.ts, lib/admin/event-form-input.ts, lib/admin/event-action-core.ts, lib/admin/event-actions.ts, components/admin/event-form.tsx, app/[locale]/(admin)/admin/events-mgmt/page.tsx, app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx, messages/en.json, messages/zh-HK.json.
- Create: drizzle/0023_wisetech_event_hero.sql, drizzle/meta/0023_snapshot.json, tests/unit/wisetech-pr5-event-hero-schema.test.ts, tests/unit/event-hero-admin-and-media.test.ts.
- Modify: drizzle/meta/_journal.json, tests/unit/admin-events.test.ts, tests/unit/admin-media.test.ts, tests/unit/m7-media-schema-contract.test.ts.

**Interfaces:**

- Consumes: mediaRepository.listActiveForAdmin(actor), the existing EventMutationDependencies transaction boundary, and events/media rows from lib/db/server-schema.
- Produces: Event with heroMediaId: string | null; Event form input with heroMediaId: string | null; EventMutationDependencies transaction lockActiveMedia(id); MediaMutationDependencies transaction countEventHeroReferences(id).

- [ ] **Step 1: Write the failing schema, admin-input, and archive-lock tests**

    import {getTableConfig} from "drizzle-orm/pg-core";
    import {events} from "@/lib/db/schema-core";
    import {eventFormInput} from "@/lib/admin/event-form-input";

    it("defines a nullable Event hero FK and index", () => {
      const config = getTableConfig(events);
      expect(config.columns.find((column) => column.name === "hero_media_id")?.notNull).toBe(false);
      const foreignKey = config.foreignKeys.find((candidate) =>
        candidate.reference().columns.some((column) => column.name === "hero_media_id"));
      expect(foreignKey?.reference().foreignColumns.map((column) => column.name)).toEqual(["id"]);
      expect(foreignKey?.onDelete).toBe("set null");
      expect(config.indexes.map((entry) => entry.config.name)).toContain("events_hero_media_idx");
    });

    it("normalizes an empty heroMediaId and rejects archived media inside the write transaction", async () => {
      const form = new FormData();
      form.set("slug", "public-event");
      form.set("titleEn", "Public event");
      form.set("descriptionEn", "Event description");
      form.set("startsAt", "2030-01-01T18:00");
      form.set("heroMediaId", "");
      expect(eventFormInput(form)).toMatchObject({heroMediaId: null});
      await expect(createEvent(staff, {...createInput, heroMediaId}, inactiveMediaDependencies))
        .rejects.toMatchObject({issues: [expect.objectContaining({path: ["heroMediaId"]})]});
    });

    it("rejects archiving media referenced by an Event hero", async () => {
      await expect(setMediaArchived(staff, heroMediaId, true, eventReferencedMediaDependencies))
        .rejects.toMatchObject({issues: [expect.objectContaining({message: "MEDIA_IN_USE"})]});
    });

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run: npm.cmd test -- tests/unit/wisetech-pr5-event-hero-schema.test.ts tests/unit/event-hero-admin-and-media.test.ts

    Expected: FAIL because events.heroMediaId, the form field, Event-media transaction lock, and Event archive reference count do not exist.

- [ ] **Step 3: Add the additive schema artifacts and transactional interfaces**

    In lib/db/schema-core.ts, extend the existing Event table and its indexes:

    heroMediaId: uuid("hero_media_id").references(() => media.id, {onDelete: "set null"}),
    ...
    index("events_hero_media_idx").on(table.heroMediaId),

    Generate the committed artifacts with the repository's credential-free Drizzle workflow only; inspect them without applying them:

    Run: npm.cmd exec drizzle-kit generate -- --config=drizzle.config.ts --name=wisetech_event_hero

    Expected: creates 0023_wisetech_event_hero.sql, 0023_snapshot.json, and journal idx/tag 23 without connecting to or migrating a database. The SQL must contain:

    ALTER TABLE "events" ADD COLUMN "hero_media_id" uuid;
    ALTER TABLE "events" ADD CONSTRAINT "events_hero_media_id_media_id_fk"
      FOREIGN KEY ("hero_media_id") REFERENCES "public"."media"("id")
      ON DELETE set null ON UPDATE no action;
    CREATE INDEX "events_hero_media_idx" ON "events" USING btree ("hero_media_id");

    Do not call npm.cmd run db:migrate and do not add a backfill.

    Add heroMediaId to the Event Zod input schemas. Extend the mutation dependency so create/update lock a media row in the same transaction before insert/update:

    lockActiveMedia: (id: string) => Promise<Readonly<{id: string; archivedAt: Date | null}> | null>;

    const heroMediaId = parsed.heroMediaId;
    if (heroMediaId !== null) {
      const mediaRow = await transaction.lockActiveMedia(heroMediaId);
      if (!mediaRow || mediaRow.archivedAt !== null) {
        throw new z.ZodError([{code: "custom", path: ["heroMediaId"], message: "EVENT_HERO_MEDIA_INVALID"}]);
      }
    }

    Make eventFormInput map String(formData.get("heroMediaId") ?? "").trim() to null or a UUID candidate. Include heroMediaId in preservedFields and EventForm Values. The admin pages must load only mediaRepository.listActiveForAdmin(actor), pass values to a select name="heroMediaId", and expose no URL input.

    In lib/db/repos/media.ts, add a countEventHeroReferences dependency backed by count from events where events.heroMediaId equals the locked media id. Sum listing, general-partner, and Event references before MEDIA_IN_USE. This is a same-transaction archive decision.

- [ ] **Step 4: Run the focused tests and inspect the migration as an artifact**

    Run: npm.cmd test -- tests/unit/wisetech-pr5-event-hero-schema.test.ts tests/unit/event-hero-admin-and-media.test.ts tests/unit/admin-events.test.ts tests/unit/admin-media.test.ts tests/unit/m7-media-schema-contract.test.ts

    Expected: PASS; the migration/snapshot/journal assert nullable FK to media(id), ON DELETE SET NULL, and events_hero_media_idx, with no database connection or migration execution.

    Run: npm.cmd exec drizzle-kit check -- --config=drizzle.config.ts

    Expected: PASS against committed schema artifacts without applying migration 0023.

- [ ] **Step 5: Refactor and commit the cohesive schema/admin/media slice**

    Keep active-media lookup and Event write validation in repositories/actions, not admin pages. Keep field-level localized validation via runEventFormAction. Do not include Event hero URLs in form state.

    git add lib/db/schema-core.ts drizzle/0023_wisetech_event_hero.sql drizzle/meta/0023_snapshot.json drizzle/meta/_journal.json lib/db/repos/events.ts lib/db/repos/media.ts lib/admin/event-form-input.ts lib/admin/event-action-core.ts lib/admin/event-actions.ts components/admin/event-form.tsx app/[locale]/(admin)/admin/events-mgmt/page.tsx app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx messages/en.json messages/zh-HK.json tests/unit/wisetech-pr5-event-hero-schema.test.ts tests/unit/event-hero-admin-and-media.test.ts tests/unit/admin-events.test.ts tests/unit/admin-media.test.ts tests/unit/m7-media-schema-contract.test.ts
    git commit -m "feat: add guarded event hero media"

### Task 2: Build deterministic public Event status, safe hero projections, and registration outcomes

**Files:**

- Create: lib/events/public.ts, lib/events/registration-action.ts, tests/unit/event-public-status.test.ts, tests/unit/event-public-page.test.tsx, tests/unit/event-registration-public-action.test.ts, tests/unit/event-private-media-render.test.tsx.
- Modify: lib/db/repos/events.ts, app/[locale]/(public)/events/page.tsx, app/[locale]/(public)/events/[slug]/page.tsx, components/marketing/event-detail.tsx, components/portal/event-registration-form.tsx, lib/portal/event-action-core.ts, app/[locale]/(member)/portal/events/page.tsx, lib/home/home-highlights.ts, app/sitemap.ts, messages/en.json, messages/zh-HK.json, tests/unit/public-event-repository.test.ts, tests/unit/admin-events.test.ts, tests/unit/event-action-state.test.ts, tests/unit/event-detail-seo.test.ts, tests/unit/home-highlights.test.ts, tests/unit/sitemap.test.ts.

**Interfaces:**

- Consumes: Event.heroMediaId from Task 1 and media rows only through eventsRepository joins; requireActor() only inside a Server Action.
- Produces:

    export type PublicEventStatus = "open" | "past";
    export function parsePublicEventStatus(value: string | string[] | undefined): PublicEventStatus;
    export function eventBoundary(event: Readonly<{startsAt: Date; endsAt: Date | null}>): Date;
    export type PublicEventProjection = Readonly<{
      id: string; slug: string; title: string; description: string;
      startsAt: string; endsAt: string | null; venue: string | null;
      capacity: number | null; hero: Readonly<{url: string; alt: string}> | null;
    }>;
    export type RegistrationActionState = Readonly<{
      code?: "registered" | "waitlist" | "already_registered" | "already_waitlisted" | "unauthenticated" | "ineligible" | "closed" | "error";
      message?: string;
    }>;

- [ ] **Step 1: Write failing parser, repository, action-state, and private-media rendering tests**

    it.each([
      [undefined, "open"], ["", "open"], ["future", "open"],
      [["past", "open"], "open"], ["past", "past"],
    ])("parses %o as %s", (input, expected) => {
      expect(parsePublicEventStatus(input)).toBe(expected);
    });

    it("drives the public page reader and selected control from one scalar status", async () => {
      const rendered = await renderEventsPage({status: "past"});
      expect(eventsRepository.listPublic).toHaveBeenCalledWith(
        anonymous,
        expect.objectContaining({status: "past", asOf: expect.any(Date)}),
      );
      expect(rendered).toContain('aria-current="page"');
      expect(rendered).toContain('href="/events?status=open"');
      expect(rendered).toContain('href="/events?status=past"');
    });

    it("uses endsAt or startsAt inclusively for open and exact ordering", async () => {
      const rows = await listPublicEvents(anonymous, {
        status: "open", asOf: new Date("2030-01-01T10:00:00.000Z"), source,
      });
      expect(rows.map((row) => row.slug)).toEqual(["ends-at-now", "later-a", "later-z"]);
    });

    it("never projects member-only or archived hero media", async () => {
      expect(await eventsRepository.getPublicBySlug("member-only", "en", {asOf, source})).toBeNull();
      await expect(eventsRepository.getPublicBySlug("archived-hero", "en", {asOf, source}))
        .resolves.toMatchObject({hero: null});
    });

    it("maps only known registration results and never leaks an unknown error", async () => {
      await expect(runPublicEventRegistrationAction({}, form, {register: async () => { throw new Error("secret"); }, messages}))
        .resolves.toEqual({code: "error", message: messages.error});
    });

    it("does not resurrect static Event detail URLs when the repository fails", async () => {
      eventsRepository.listPublic.mockRejectedValue(new Error("db"));
      const urls = (await sitemap()).map((entry) => entry.url);
      expect(sitemapSource).not.toContain("@/content/events");
      expect(urls).not.toContain(absoluteUrl("/events/static-fixture-slug"));
    });

    expect(rendered).toContain('unoptimized');
    expect(rendered).not.toContain("https://donor.example");

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run: npm.cmd test -- tests/unit/event-public-status.test.ts tests/unit/event-public-page.test.tsx tests/unit/event-registration-public-action.test.ts tests/unit/event-private-media-render.test.tsx tests/unit/public-event-repository.test.ts tests/unit/event-action-state.test.ts

    Expected: FAIL because the status parser/read model/action codes and safe hero renderer do not exist.

- [ ] **Step 3: Implement the public Event contract without widening authorities**

    In lib/events/public.ts implement a pure parser that returns past only for exactly one scalar "past"; all absent, empty, unknown, and arrays return open:

    export function parsePublicEventStatus(value: string | string[] | undefined): PublicEventStatus {
      return value === "past" ? "past" : "open";
    }
    export function eventBoundary(event: Readonly<{startsAt: Date; endsAt: Date | null}>): Date {
      return event.endsAt ?? event.startsAt;
    }

    Extend eventsRepository with locale-aware, display-safe listPublic and getPublicBySlug readers accepting injected asOf/source. SQL and in-memory readers must both enforce published true and memberOnly false. Open is boundary >= asOf sorted boundary ascending, slug ascending, id ascending. Past is boundary < asOf sorted boundary descending, slug ascending, id ascending. Left join media and project hero only when media.archivedAt is null; no media/audit/storage fields cross the boundary.

    Give app/[locale]/(public)/events/page.tsx searchParams: Promise<Record<string, string | string[] | undefined>>. Await params and searchParams together, compute status = parsePublicEventStatus(query.status), inject one asOf = new Date(), and call eventsRepository.listPublic(anonymous, {status, asOf}).catch(() => null). Render localized Open and Past controls as canonical /events?status=open and /events?status=past links with aria-current on the selected value and an #events-results target. Missing, empty, unknown, or multi-valued status selects Open in both the reader call and visible control. A null read renders the localized unavailable state; an empty array renders the localized empty state for the selected status. Do not keep any static Event fallback.

    Update listFeaturedPublicEvents and all sitemap consumers to use the same visibility/boundary semantics, so member-only Events cannot appear in index, detail, metadata, static parameters, highlights, or structured data. In app/sitemap.ts remove the @/content/events import and the union with static Event slugs; Event detail entries come only from the successful eventsRepository public read. A repository failure therefore emits no Event detail URL while retaining unrelated static route entries.

    In the detail component, render localized title/description, Hong Kong date/time, venue, optional hero, and capacity only as supplied; do not calculate a remaining count. Use isPrivateMediaDeliveryUrl(hero.url) for unoptimized own-origin private delivery rather than duplicating its route matcher. For other approved own-origin media use the existing image policy.

    The repository registration lock must select startsAt and endsAt and check, in this exact order under the lock: event existence/publication with EVENT_NOT_FOUND; boundary before injected clock with EVENT_REGISTRATION_CLOSED; eligible membership with MEMBERSHIP_INACTIVE; duplicate; then capacity/write. Actor resolution precedes the repository transition and returns UNAUTHORIZED. Only registered, waitlist, already_registered, and already_waitlisted are successful dispositions.

    Create lib/events/registration-action.ts as the public Server Action adapter. It calls requireActor(), then eventsRepository.register(actor, {eventId: formData.get("eventId")}, dependencies). Map UNAUTHORIZED to unauthenticated, MEMBERSHIP_INACTIVE to ineligible, EVENT_REGISTRATION_CLOSED to closed, and EVENT_NOT_FOUND to the generic localized error state. All unknown thrown values also become {code: "error", message: messages.error}; never serialize the thrown value. Preserve the portal page by changing its existing inline action to consume the same mapper and its richer state labels.

    Render the public registration form only for a non-past public Event. It maps each code to localized text; waitlist has distinct wording; unauthenticated/ineligible links only target the existing localized sign-in or /membership destination, without a return query.

- [ ] **Step 4: Run focused tests**

    Run: npm.cmd test -- tests/unit/event-public-status.test.ts tests/unit/event-public-page.test.tsx tests/unit/event-registration-public-action.test.ts tests/unit/event-private-media-render.test.tsx tests/unit/public-event-repository.test.ts tests/unit/admin-events.test.ts tests/unit/event-action-state.test.ts tests/unit/event-detail-seo.test.ts tests/unit/home-highlights.test.ts tests/unit/sitemap.test.ts

    Expected: PASS with scalar ?status=past driving the repository and selected control, every invalid/multi-valued status selecting Open, boundary equality open, exact sort ties, public member-only exclusion, localized empty/unavailable states, under-lock closure ordering, every action code, sanitized unknown errors, portal behavior retained, no @/content/events sitemap fallback, and no Event detail URL after a repository failure.

- [ ] **Step 5: Refactor and commit**

    Keep the parser pure and do not duplicate status comparisons across pages. Keep action labels in messages; use semantic status/alert text without color-only meaning.

    git add lib/events/public.ts lib/events/registration-action.ts lib/db/repos/events.ts app/[locale]/(public)/events/page.tsx app/[locale]/(public)/events/[slug]/page.tsx components/marketing/event-detail.tsx components/portal/event-registration-form.tsx lib/portal/event-action-core.ts app/[locale]/(member)/portal/events/page.tsx lib/home/home-highlights.ts app/sitemap.ts messages/en.json messages/zh-HK.json tests/unit/event-public-status.test.ts tests/unit/event-public-page.test.tsx tests/unit/event-registration-public-action.test.ts tests/unit/event-private-media-render.test.tsx tests/unit/public-event-repository.test.ts tests/unit/admin-events.test.ts tests/unit/event-action-state.test.ts tests/unit/event-detail-seo.test.ts tests/unit/home-highlights.test.ts tests/unit/sitemap.test.ts
    git commit -m "feat: add public event journeys"

### Task 3: Activate guarded announcements and the rights-gated homepage partner wall

**Files:**

- Create: components/marketing/home-partner-wall.tsx, tests/unit/public-layout-announcement.test.tsx, tests/unit/home-partner-wall.test.tsx.
- Modify: lib/public-shell/announcement.ts, components/layout/announcement-bar.tsx, app/[locale]/(public)/layout.tsx, app/[locale]/(public)/page.tsx, messages/en.json, messages/zh-HK.json, tests/unit/announcement.test.tsx, tests/unit/homepage.test.tsx, tests/unit/partner-media-locking.test.ts.

**Interfaces:**

- Consumes: announcementsRepository.getActive(asOf): Promise<ScheduledAnnouncementProjection | null> and partnersRepository.listPublished(locale, {limit: 12}).
- Produces: a locale-specific, lifecycle-free AnnouncementBarView and a PartnerProjection-only HomePartnerWall input.

- [ ] **Step 1: Write failing layout and partner-wall contracts**

    it("passes the active safe announcement to AnnouncementBar and hides it on a read failure", async () => {
      announcementsRepository.getActive.mockResolvedValueOnce(activeProjection);
      expect(await renderPublicLayout("en")).toContain(activeProjection.title.en);
      expect(await renderPublicLayout("en")).toContain(activeProjection.ctaLabel.en);
      announcementsRepository.getActive.mockRejectedValueOnce(new Error("db"));
      expect(await renderPublicLayout("en")).not.toContain("announcement");
      announcementsRepository.getActive.mockResolvedValueOnce({...activeProjection, title: {en: "", "zh-HK": ""}} as never);
      expect(await renderPublicLayout("en")).not.toContain(activeProjection.ctaLabel.en);
    });

    it("reads no more than twelve approved partners and hides on empty/error", async () => {
      expect(partnersRepository.listPublished).toHaveBeenCalledWith("zh-HK", {limit: 12});
      expect(render(<HomePartnerWall partners={[]} />).container).toBeEmptyDOMElement();
    });

    it("uses localized alt text, safe HTTPS links, and unoptimized private-media delivery", () => {
      expect(rendered).toContain('alt="核准標誌"');
      expect(rendered).toContain('rel="noreferrer"');
      expect(rendered).toContain("unoptimized");
    });

- [ ] **Step 2: Run focused tests and record RED**

    Run: npm.cmd test -- tests/unit/public-layout-announcement.test.tsx tests/unit/home-partner-wall.test.tsx tests/unit/announcement.test.tsx tests/unit/homepage.test.tsx tests/unit/partner-media-locking.test.ts

    Expected: FAIL because the layout passes null, no partner wall exists, and the persisted projection does not match AnnouncementBar.

- [ ] **Step 3: Reconcile the projection and render only repository-approved records**

    Keep ScheduledAnnouncementProjection as the repository's validated safe row. Add a server-side localization step that strips startsAt, endsAt, and priority before the Client Component boundary:

    export type AnnouncementBarView = Readonly<{
      id: string;
      href: PublicRoute;
      text: string;
      ctaLabel: string;
    }>;

    export function toAnnouncementBarView(
      projection: ScheduledAnnouncementProjection,
      locale: AppLocale,
    ): AnnouncementBarView | null {
      const text = projection.title[locale]?.trim();
      const ctaLabel = projection.ctaLabel[locale]?.trim();
      if (!text || !ctaLabel || !publicRoutes.includes(projection.href)) return null;
      return {id: projection.id, href: projection.href, text, ctaLabel};
    }

    Keep getActiveAnnouncement as the sole selection owner: unarchived, publishedAt <= asOf, startsAt <= asOf < endsAt, priority descending, startsAt descending, id ascending. In PublicLayout call announcementsRepository.getActive(new Date()).catch(() => null), then localize the non-null projection with toAnnouncementBarView. AnnouncementBar accepts only AnnouncementBarView and renders its title plus CTA label; lifecycle fields never cross the Server/Client boundary. A null or invalid result renders no bar and preserves the shell.

    In HomePage, independently load partnersRepository.listPublished(appLocale, {limit: 12}).catch(() => null). Render HomePartnerWall only for a nonempty projection. Do not let this failure alter loadHomeHighlights.

    HomePartnerWall accepts only readonly PartnerProjection[]. For each row use name, logoUrl, logoAlt, and optional already-validated HTTPS websiteUrl. Website links are target="_blank" rel="noopener noreferrer"; never fetch them server-side. Use an empty alt only for deliberately decorative treatment; otherwise preserve curated localized alt. Use isPrivateMediaDeliveryUrl for /api/media/<uuid> and set unoptimized.

- [ ] **Step 4: Run focused tests**

    Run: npm.cmd test -- tests/unit/public-layout-announcement.test.tsx tests/unit/home-partner-wall.test.tsx tests/unit/announcement.test.tsx tests/unit/homepage.test.tsx tests/unit/partner-media-locking.test.ts

    Expected: PASS; one deterministic active bar, no hard-coded fallback, all publication/rights/date/media/archive gates preserved by the repository, and isolated wall failures.

- [ ] **Step 5: Commit**

    git add lib/public-shell/announcement.ts components/layout/announcement-bar.tsx app/[locale]/(public)/layout.tsx app/[locale]/(public)/page.tsx components/marketing/home-partner-wall.tsx messages/en.json messages/zh-HK.json tests/unit/public-layout-announcement.test.tsx tests/unit/home-partner-wall.test.tsx tests/unit/announcement.test.tsx tests/unit/homepage.test.tsx tests/unit/partner-media-locking.test.ts
    git commit -m "feat: activate public announcements and partners"

### Task 4: Localize News end-to-end while isolating sitemap locale failures

**Files:**

- Create: components/marketing/news-detail.tsx, tests/unit/public-news-locale.test.ts, tests/unit/news-page-locale.test.tsx.
- Modify: lib/db/repos/public-posts.ts, lib/home/home-highlights.ts, app/[locale]/(public)/page.tsx, app/[locale]/(public)/news/page.tsx, app/[locale]/(public)/news/[slug]/page.tsx, app/sitemap.ts, tests/unit/public-posts-repository.test.ts, tests/unit/sitemap.test.ts, tests/unit/sitemap-milestones.test.ts, tests/unit/wisetech-localized-news-schema-contract.test.ts, tests/unit/home-highlights.test.ts.

**Interfaces:**

- Consumes: AppLocale, unchanged listPublishedBuildLogs/getPublishedBuildLogBySlug, and posts.bodyMdx/bodyMdxZhHk.
- Produces:

    export type PublishedNewsSummary = Readonly<{
      slug: string; title: string; publishedAt: Date; author: string;
    }>;
    export type PublishedNewsDetail = PublishedNewsSummary & Readonly<{body: string}>;
    listPublishedNews(locale: AppLocale, asOf?: Date, options?: PublicReadOptions)
    getPublishedNewsBySlug(locale: AppLocale, slug: string, asOf?: Date)

- [ ] **Step 1: Write failing locale, renderer, and sitemap isolation tests**

    it("omits null and ECMAScript-blank Chinese bodies without English fallback", async () => {
      expect(await repository.listPublishedNews("zh-HK", asOf)).toEqual([]);
      await expect(repository.getPublishedNewsBySlug("zh-HK", "english-only", asOf)).resolves.toBeNull();
    });

    it("uses localized News body but leaves Build Log bodyMdx readers unchanged", async () => {
      expect(news.body).toBe("繁體內容");
      expect(buildLog.bodyMdx).toBe("single operational body");
    });

    it.each([
      ["en", englishNews, "zh-HK"],
      ["zh-HK", chineseNews, "en"],
    ] as const)("retains successful %s News URLs when the other locale fails", async (successfulLocale, row, failedLocale) => {
      publicPosts.listPublishedNews.mockImplementation((locale) =>
        locale === successfulLocale ? Promise.resolve([row]) : Promise.reject(new Error(failedLocale)));
      const entries = await sitemap();
      expect(entries.map((entry) => entry.url)).toContain(
        absoluteUrl(localizedPath(successfulLocale, `/news/${row.slug}`)),
      );
      expect(entries.find((entry) => entry.url.endsWith(`/news/${row.slug}`))?.alternates)
        .toBeUndefined();
    });

    it("omits untranslated Chinese News and suppresses its alternate", async () => {
      publicPosts.listPublishedNews.mockImplementation((locale) =>
        locale === "en" ? Promise.resolve([englishOnlyNews]) : Promise.resolve([]));
      const entries = await sitemap();
      expect(entries.map((entry) => entry.url)).toContain(absoluteUrl("/news/english-only"));
      expect(entries.map((entry) => entry.url)).not.toContain(absoluteUrl("/zh/news/english-only"));
      expect(entries.find((entry) => entry.url.endsWith("/news/english-only"))?.alternates)
        .toBeUndefined();
    });

    it("keeps Build Logs in both locales with mutual alternates", async () => {
      publicPosts.listPublishedBuildLogs.mockResolvedValue([buildLog]);
      const entries = (await sitemap()).filter((entry) => entry.url.endsWith("/news/build-log"));
      expect(entries).toHaveLength(2);
      expect(entries.every((entry) => entry.alternates?.languages?.en && entry.alternates.languages["zh-HK"]))
        .toBe(true);
    });

- [ ] **Step 2: Run focused tests and record RED**

    Run: npm.cmd test -- tests/unit/public-news-locale.test.ts tests/unit/news-page-locale.test.tsx tests/unit/public-posts-repository.test.ts tests/unit/sitemap.test.ts tests/unit/sitemap-milestones.test.ts

    Expected: FAIL because News has Build Log-shaped fields and both locales share one reader/fallback path.

- [ ] **Step 3: Create distinct localized News and Build Log contracts**

    Keep Build Log methods and SQL unchanged: kind buildlog, body_mdx, both localized titles, shared two-locale exception.

    For News, choose titleEn/bodyMdx for en and titleZh/bodyMdxZhHk for zh-HK. Reuse the exact ECMAScript whitespace SQL character set already pinned by tests/unit/wisetech-localized-news-schema-contract.test.ts for SQL eligibility, and validate the returned body with the same JavaScript trim rule:

    const isChineseNewsBody = (value: string | null): value is string =>
      typeof value === "string" && value.trim().length > 0;

    Return one normalized title/body, never both language bodies. Preserve kind=news, archive, publishedAt <= injected asOf, slug validation, ordering publishedAt descending then slug ascending, and limits. Chinese detail returns null for an English-only News row so page/metadata call notFound.

    Change homepage News reader to pass the requested locale. News index cards consume post.title, the News detail uses NewsDetail and safe structured-content renderer, and BuildLogDetail remains only for Build Logs. Neither renderer executes MDX.

    In sitemap independently read News for en and zh-HK. Emit one locale URL per successful locale result. Emit News alternates only for a slug in both successful locale sets. Build Logs continue to emit both locale URLs and mutual alternates even though their body is single-source.

- [ ] **Step 4: Run focused tests**

    Run: npm.cmd test -- tests/unit/public-news-locale.test.ts tests/unit/news-page-locale.test.tsx tests/unit/public-posts-repository.test.ts tests/unit/sitemap.test.ts tests/unit/sitemap-milestones.test.ts tests/unit/home-highlights.test.ts

    Expected: PASS; Chinese blank/null exclusion, localized homepage/index/detail/metadata, Chinese 404, both one-locale sitemap failure directions, untranslated-Chinese omission, alternate suppression whenever either News locale is unavailable, and Build Log two-locale mutual-alternate behavior.

- [ ] **Step 5: Commit**

    git add lib/db/repos/public-posts.ts lib/home/home-highlights.ts app/[locale]/(public)/page.tsx app/[locale]/(public)/news/page.tsx app/[locale]/(public)/news/[slug]/page.tsx app/sitemap.ts components/marketing/news-detail.tsx tests/unit/public-news-locale.test.ts tests/unit/news-page-locale.test.tsx tests/unit/public-posts-repository.test.ts tests/unit/sitemap.test.ts tests/unit/sitemap-milestones.test.ts tests/unit/wisetech-localized-news-schema-contract.test.ts tests/unit/home-highlights.test.ts
    git commit -m "feat: localize public news projections"

### Task 5: Atomically cut Launch Pad to the published landing-partner repository

**Files:**

- Modify: app/[locale]/(public)/launchpad/page.tsx, components/marketing/landing-partner-map.tsx, scripts/audit-synthetic-content.ts, tests/unit/audit-synthetic-content.test.ts, tests/unit/m6-schema-contract.test.ts.
- Delete: config/landing-partners.ts, config/landing-partners.json.
- Create: tests/unit/launchpad-partner-cutover.test.tsx.

**Interfaces:**

- Consumes: landingPartnersRepository.listPublished({limit: 100}): Promise<readonly LandingPartnerProjection[]>.
- Produces: Launch Pad partner view using only id, organizationEn, organizationZhHk, market, region; the reversible M6 hide statement includes only M6_PARTNER_IDS.

- [ ] **Step 1: Write failing cutover and audit tests**

    it("loads exactly the public repository projection and never imports static partners", async () => {
      expect(landingPartnersRepository.listPublished).toHaveBeenCalledWith({limit: 100});
      expect(pageSource).not.toContain("config/landing-partners");
      expect(existsSync("config/landing-partners.ts")).toBe(false);
      expect(existsSync("config/landing-partners.json")).toBe(false);
    });

    it("does not disclose contact or notes and renders one localized empty state on zero/error", async () => {
      expect(rendered).not.toContain("contact");
      expect(rendered).not.toContain("negotiation");
    });

    it("hides only M6 partner rows by clearing published_at with a parameterized UUID array", () => {
      expect(HIDE_STATEMENTS).toContainEqual(expect.objectContaining({
        table: "landing_partners",
        sql: "UPDATE landing_partners SET published_at = NULL, updated_at = now() WHERE id = ANY($1::uuid[]) RETURNING id",
      }));
    });

- [ ] **Step 2: Run focused tests and record RED**

    Run: npm.cmd test -- tests/unit/launchpad-partner-cutover.test.tsx tests/unit/audit-synthetic-content.test.ts tests/unit/m6-schema-contract.test.ts

    Expected: FAIL because Launch Pad imports static authority and the audit omits landing-partner publication state.

- [ ] **Step 3: Replace the source atomically**

    In LaunchPadPage request partners independently:

    const partners = await landingPartnersRepository.listPublished({limit: 100}).catch(() => []);

    Pass only that projection to LandingPartnerMap. Preserve cohorts, open-cohort application gate, parseFundingAnswers, getFundingResults, and all existing search parameters exactly. Empty/error both use the already-localized partner empty state; neither path imports or falls back to static JSON.

    Delete both config files in the same commit as the import removal. In scripts/audit-synthetic-content.ts, update the documented public-data rationale and add exactly:

    {
      table: "landing_partners",
      sql: "UPDATE landing_partners SET published_at = NULL, updated_at = now() WHERE id = ANY($1::uuid[]) RETURNING id",
      matchType: "uuid",
    },

    The statement receives M6_PARTNER_IDS through the existing marker matching and is only reachable under --hide. Do not run --hide.

- [ ] **Step 4: Run focused tests**

    Run: npm.cmd test -- tests/unit/launchpad-partner-cutover.test.tsx tests/unit/audit-synthetic-content.test.ts tests/unit/m6-schema-contract.test.ts

    Expected: PASS without database mutation; repository-only partner map, exact limit, private-field omission, empty-safe failure behavior, deleted static files, and parameterized audit update.

- [ ] **Step 5: Commit**

    git add app/[locale]/(public)/launchpad/page.tsx components/marketing/landing-partner-map.tsx scripts/audit-synthetic-content.ts tests/unit/launchpad-partner-cutover.test.tsx tests/unit/audit-synthetic-content.test.ts tests/unit/m6-schema-contract.test.ts
    git rm -- config/landing-partners.ts config/landing-partners.json
    git commit -m "feat: source launchpad partners from repository"

### Task 6: Reconcile the marketing membership catalog from persisted rows

**Files:**

- Create: lib/db/repos/membership-plans.ts, lib/membership/public-catalog.ts, tests/unit/membership-public-catalog.test.ts, tests/unit/membership-page-catalog.test.tsx.
- Modify: app/[locale]/(public)/membership/page.tsx, components/marketing/tier-comparison.tsx, messages/en.json, messages/zh-HK.json, tests/unit/membership-links.test.tsx, tests/unit/membership-tier-content.test.ts.

**Interfaces:**

- Consumes: PLAN_CODES, PLAN_CATALOG, exact STRIPE_STARTUP_PRICE_ID and STRIPE_CORPORATE_PRICE_ID values read as narrow server-side inputs, and membership_plans repository rows.
- Produces:

    export type PersistedMembershipPlan = Readonly<{
      code: string; audience: string; billingBehavior: string; seatAllowance: number;
      active: boolean; annualPriceHkd: number | null; monthlyPriceHkd: number | null;
      stripePriceReference: string | null;
    }>;
    export type PublicMembershipPrice =
      | Readonly<{kind: "free"}>
      | Readonly<{kind: "review"}>
      | Readonly<{kind: "paid"; options: readonly Readonly<{
          amount: string; cadence: "annual" | "monthly";
        }>[]}>;

    export type PublicMembershipTier = Readonly<{
      code: PlanCode;
      price: PublicMembershipPrice;
      cta: Readonly<{href: "/join?plan=community" | "/join?plan=startup" | "/join?plan=corporate" | "/contact"; kind: "join" | "contact"}>;
    }>;
    export function buildPublicMembershipCatalog(input: Readonly<{
      locale: AppLocale; rows: readonly PersistedMembershipPlan[];
      priceIds: Readonly<{startup: string; corporate: string}>;
    }>): readonly PublicMembershipTier[];

- [ ] **Step 1: Write failing catalog and page tests**

    it("keeps canonical order and omits duplicate, unknown, inactive, malformed, and mismatched rows", () => {
      expect(buildPublicMembershipCatalog({locale: "en", rows, priceIds}).map((tier) => tier.code))
        .toEqual(["community", "startup", "corporate", "patron"]);
    });

    it.each([-1, 2147483648, 1.5])("rejects non-Postgres-integer value %i", (price) => {
      expect(buildPublicMembershipCatalog({locale: "en", rows: [startup({annualPriceHkd: price})], priceIds})).toEqual([]);
    });

    it("enforces all four plan rules and server-only price-ID equality", () => {
      expect(validCommunity).toMatchObject({price: {kind: "free"}, cta: {href: "/join?plan=community"}});
      expect(validPatron).toMatchObject({price: {kind: "review"}, cta: {href: "/contact"}});
      expect(serializedTier).not.toContain("stripePriceReference");
      expect(serializedTier).not.toContain("stripeSecretKey");
    });

    it("shows one localized unavailable state when no valid tier remains", async () => {
      expect(await renderMembership([])).toContain("Membership is currently unavailable");
    });

- [ ] **Step 2: Run focused tests and record RED**

    Run: npm.cmd test -- tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/membership-links.test.tsx tests/unit/membership-tier-content.test.ts

    Expected: FAIL because the page derives tiers/prices from message files and no repository/catalog adapter exists.

- [ ] **Step 3: Implement the repository and server-only public adapter**

    Create lib/db/repos/membership-plans.ts with import "server-only"; it selects only code, audience, billingBehavior, seatAllowance, active, annualPriceHkd, monthlyPriceHkd, stripePriceReference in database order and validates no public shape there.

    Create lib/membership/public-catalog.ts with import "server-only". Use a narrow environment function that reads only price IDs, without calling billingEnv or requiring Stripe secrets:

    export function publicPriceIds(environment: NodeJS.ProcessEnv = process.env) {
      return {
        startup: (environment.STRIPE_STARTUP_PRICE_ID ?? "").trim(),
        corporate: (environment.STRIPE_CORPORATE_PRICE_ID ?? "").trim(),
      };
    }

    For every PLAN_CODES item require exactly one matching persisted row; code, active, audience, billingBehavior, and seatAllowance must equal PLAN_CATALOG. A price is valid only if Number.isInteger(value) and value >= 0 and value <= 2147483647.

    Apply the exact per-plan rules:

    - community: each annual/monthly value is null or zero; CTA /join?plan=community.
    - startup and corporate: annual is positive; monthly is null or positive; matching configured nonempty code price ID is required; non-null stripePriceReference equals that ID; CTA is its exact /join?plan=<code>.
    - patron: annual/monthly are null or nonnegative, but never become an advertised price/cadence; CTA is /contact.

    Derive one paid option for the valid annual value and, when present, one paid option for the valid monthly value, formatting each with Intl.NumberFormat(locale, {style: "currency", currency: "HKD"}). The cadence literal comes from the persisted field that supplied the value. Free/review tiers carry only their semantic kind and receive localized labels in the page. Do not invent cadence, prices, IDs, or numeric message strings. Omit invalid rows; if no rows survive, MembershipPage renders one localized unavailable message. TierComparison receives only PublicMembershipTier plus localized names/descriptions/benefits/action labels and uses tier.cta.href.

- [ ] **Step 4: Run focused tests**

    Run: npm.cmd test -- tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/membership-links.test.tsx tests/unit/membership-tier-content.test.ts tests/unit/messages.test.ts

    Expected: PASS for int range, every canonical rule, exact price-ID/reference equality, valid cadence derivation, patron contact CTA, invalid omission, secret absence, and single unavailable state.

- [ ] **Step 5: Commit**

    git add lib/db/repos/membership-plans.ts lib/membership/public-catalog.ts app/[locale]/(public)/membership/page.tsx components/marketing/tier-comparison.tsx messages/en.json messages/zh-HK.json tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/membership-links.test.tsx tests/unit/membership-tier-content.test.ts
    git commit -m "feat: reconcile public membership catalog"

### Task 7: Apply Showcase presentation changes without disturbing its durable owners

**Files:**

- Modify: app/[locale]/(public)/showcase/page.tsx, app/[locale]/(public)/showcase/[slug]/page.tsx, components/marketing/showcase-card.tsx, components/marketing/showcase-detail.tsx, messages/en.json, messages/zh-HK.json, tests/unit/m5-public-showcase.test.tsx, tests/unit/showcase-page-degrades.test.tsx, tests/unit/showcase-logo-render.test.tsx, tests/unit/locale-switcher.test.tsx.
- Create: tests/unit/wisetech-pr5-showcase-presentation.test.tsx.

**Interfaces:**

- Consumes: parseShowcaseFilters, ShowcaseFilters, showcaseRepository.listPublished/getPublishedBySlug, toPublicListing, ShowcaseViewBeacon, softwareApplicationJsonLd, requestIntroAction.
- Produces: presentation-only localized explanatory copy and an authorized direct portal-listing CTA using the existing canonical route.

- [ ] **Step 1: Write failing regression/presentation tests**

    it("retains every parsed filter and fragment through the real LocaleSwitcher", () => {
      pathState.current = "/showcase";
      searchState.current = new URLSearchParams("q=ai&category=software");
      window.history.replaceState(null, "", "/showcase?q=ai&category=software#results");
      render(<LocaleSwitcher locale="en" {...labels} />);
      fireEvent.click(screen.getByRole("button", {name: labels.switchToChineseLabel}));
      expect(routerReplace).toHaveBeenCalledWith(
        "/showcase?q=ai&category=software#results",
        {locale: "zh-HK"},
      );
    });

    it("keeps public projection, beacon, structured data, and existing intro owner", async () => {
      expect(source).toContain("ShowcaseViewBeacon");
      expect(source).toContain("softwareApplicationJsonLd");
      expect(source).toContain("requestIntroAction");
      expect(source).not.toContain("prisma");
    });

    it("degrades to the existing localized empty state on repository failure", async () => {
      showcaseRepository.listPublished.mockRejectedValue(new Error("db"));
      expect(await renderIndex()).toContain("No showcase listings");
    });

- [ ] **Step 2: Run focused tests and record RED**

    Run: npm.cmd test -- tests/unit/wisetech-pr5-showcase-presentation.test.tsx tests/unit/m5-public-showcase.test.tsx tests/unit/showcase-page-degrades.test.tsx tests/unit/showcase-logo-render.test.tsx

    Expected: FAIL for the new presentation/portal CTA assertions while existing owner regressions pass.

- [ ] **Step 3: Change only presentation**

    Restyle the index/detail using existing public listing fields and localized explanatory copy. Preserve query-driven filters and current empty behavior. Add a localized direct CTA only to the existing authorized portal listing destination through localizedPath(locale, "/portal/company/listing"); do not create a directory, endpoint, or lead form.

    Keep these detail lines present and owner-identical:

    <ShowcaseViewBeacon slug={listing.slug} />
    <RequestIntroForm action={requestIntroAction} locale={locale} slug={listing.slug} labels={labels} />
    <StructuredData data={softwareApplicationJsonLd(listing, locale)} />

    Do not expose private listing/media fields, infer relationship claims from donor logos, or alter validation/rate-limit/idempotency in lead-request-action.ts.

- [ ] **Step 4: Run focused tests**

    Run: npm.cmd test -- tests/unit/wisetech-pr5-showcase-presentation.test.tsx tests/unit/m5-public-showcase.test.tsx tests/unit/showcase-page-degrades.test.tsx tests/unit/showcase-logo-render.test.tsx tests/unit/locale-switcher.test.tsx

    Expected: PASS with filter/query/hash retention, repository failure behavior, public projection, beacon, structured data, lead contracts, and the existing portal CTA.

- [ ] **Step 5: Commit**

    git add app/[locale]/(public)/showcase/page.tsx app/[locale]/(public)/showcase/[slug]/page.tsx components/marketing/showcase-card.tsx components/marketing/showcase-detail.tsx messages/en.json messages/zh-HK.json tests/unit/wisetech-pr5-showcase-presentation.test.tsx tests/unit/m5-public-showcase.test.tsx tests/unit/showcase-page-degrades.test.tsx tests/unit/showcase-logo-render.test.tsx tests/unit/locale-switcher.test.tsx
    git commit -m "feat: refresh showcase public presentation"

### Task 8: Redesign Contact around durable routes and one Concierge dialog contract

**Files:**

- Create: lib/ai/concierge-open.ts, components/marketing/contact-concierge-launcher.tsx, tests/unit/contact-concierge-launcher.test.tsx.
- Modify: components/ai/concierge-widget.tsx, app/[locale]/(public)/contact/page.tsx, messages/en.json, messages/zh-HK.json, tests/unit/concierge-widget.test.tsx, tests/unit/concierge-layouts.test.ts.

**Interfaces:**

- Consumes: existing mounted ConciergeWidget and its controlled Radix Dialog.
- Produces:

    export const CONCIERGE_OPEN_EVENT = "hkwtia:concierge-open";
    export function openConcierge(): void {
      window.dispatchEvent(new Event(CONCIERGE_OPEN_EVENT));
    }

- [ ] **Step 1: Write failing Contact/Concierge tests**

    it("renders durable contact channels and four localized route cards without an inquiry form", async () => {
      expect(rendered).toContain('mailto:contact@hkwtia.org');
      expect(rendered).toContain('tel:+85229899164');
      expect(rendered).toContain("/events");
      expect(rendered).toContain("/membership");
      expect(rendered).toContain("/showcase");
      expect(rendered).toContain("/launchpad");
      expect(rendered).not.toContain("<form");
    });

    it("opens the one existing widget via a no-payload same-window event", async () => {
      render(<ConciergeWidget {...props} />);
      window.dispatchEvent(new Event(CONCIERGE_OPEN_EVENT));
      expect(await screen.findByRole("dialog")).toBeVisible();
      expect(screen.getByRole("textbox", {name: props.labels.messageLabel})).toHaveFocus();
    });

    it("keeps one existing API runtime while the launcher stays presentation-only", async () => {
      expect(widgetSource).toContain('removeEventListener(CONCIERGE_OPEN_EVENT');
      expect(launcherSource).not.toContain("fetch(");
      expect(launcherSource).not.toContain("/api/ai/concierge");
      expect(widgetSource.match(/\/api\/ai\/concierge/g)).toHaveLength(1);
    });

- [ ] **Step 2: Run focused tests and record RED**

    Run: npm.cmd test -- tests/unit/contact-concierge-launcher.test.tsx tests/unit/concierge-widget.test.tsx

    Expected: FAIL because no shared open event/listener or route-card launcher exists.

- [ ] **Step 3: Add the shared same-window opener**

    Define the event constant in lib/ai/concierge-open.ts. ContactConciergeLauncher is a client component with one native button:

    <button
      type="button"
      aria-label={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary px-4 py-2"
      onClick={openConcierge}
    >
      {label}
    </button>

    In ConciergeWidget add a useEffect that installs a same-window listener while mounted:

    useEffect(() => {
      const handleOpen = () => setOpen(true);
      window.addEventListener(CONCIERGE_OPEN_EVENT, handleOpen);
      return () => window.removeEventListener(CONCIERGE_OPEN_EVENT, handleOpen);
    }, []);

    Do not attach payload data, fetch/post from the launcher, mount another widget, or make an API. Leave onOpenAutoFocus, Dialog Root, Escape, Radix focus containment/restoration, Turnstile, cancellation, feedback, escalation, and /api/ai/concierge untouched.

    Contact retains its verified mailto, tel, and localized physical address. Add four localized cards using localizedPath for /events, /membership, /showcase, and /launchpad plus the launcher.

- [ ] **Step 4: Run focused tests**

    Run: npm.cmd test -- tests/unit/contact-concierge-launcher.test.tsx tests/unit/concierge-widget.test.tsx tests/unit/concierge-layouts.test.ts tests/unit/concierge-security.test.ts

    Expected: PASS with no inquiry persistence or new API, one retained /api/ai/concierge runtime, same-window no-payload event, focus entry/restoration, Escape/close regression, and retained Concierge protections.

- [ ] **Step 5: Commit**

    git add lib/ai/concierge-open.ts components/marketing/contact-concierge-launcher.tsx components/ai/concierge-widget.tsx app/[locale]/(public)/contact/page.tsx messages/en.json messages/zh-HK.json tests/unit/contact-concierge-launcher.test.tsx tests/unit/concierge-widget.test.tsx tests/unit/concierge-layouts.test.ts
    git commit -m "feat: connect contact journeys to concierge"

### Task 9: Add bilingual credential-free browser coverage and cross-surface locale regressions

**Files:**

- Create: tests/e2e/wisetech-pr5-public-journeys.spec.ts.
- Modify: tests/unit/locale-switcher.test.tsx, tests/unit/messages.test.ts.

**Interfaces:**

- Consumes: completed public routes and LocaleSwitcher pathname/query/hash behavior.
- Produces: credential-free Playwright coverage that does not mutate a database or treat missing isolated infrastructure as a pass.

- [ ] **Step 1: Confirm the completed unit contracts are a green dependency gate**

    Run: npm.cmd test -- tests/unit/locale-switcher.test.tsx tests/unit/messages.test.ts tests/unit/event-private-media-render.test.tsx tests/unit/home-partner-wall.test.tsx

    Expected: PASS because Tasks 1-8 already introduced the behavior and bilingual keys. A failure is a dependency regression to fix in its owning task, not an expected RED for this test-only coverage task.

- [ ] **Step 2: Write credential-free browser coverage over real routes and deterministic presentation fixtures**

    test("preserves Event status and Showcase filters across locale switches", async ({page}) => {
      await page.goto("/events?status=past#results");
      await page.getByRole("button", {name: "Switch to Chinese"}).first().click();
      await expect(page).toHaveURL(/\/zh\/events\?status=past#results$/);
      await page.goto("/showcase?q=ai&category=software#results");
      await page.getByRole("button", {name: "Switch to Chinese"}).first().click();
      await expect(page).toHaveURL(/\/zh\/showcase\?q=ai&category=software#results$/);
    });

    test("renders own-origin private media without the Next optimizer", async ({page}) => {
      const html = renderToStaticMarkup(createElement(EventDetail, eventFixtureWithPrivateHero));
      await page.setContent(html);
      await expect(page.locator('img[src="/api/media/10000000-0000-4000-8000-000000000001"]'))
        .toHaveCount(1);
      await expect(page.locator('img[src*="/_next/image"]')).toHaveCount(0);
    });

    Build eventFixtureWithPrivateHero and a HomePartnerWall fixture from their display-safe public projection types. Render both pure presentation components with createElement/renderToStaticMarkup, then load their HTML with page.setContent; assert each exact /api/media/<uuid> src remains own-origin and no optimizer URL or remote donor host appears. This is a test-only fixture in the Playwright process, not a production route/API.

    Use managed public routes for the rest: Membership and repository-backed surfaces stay honest/usable when local credentials are absent; Contact launcher opens the existing dialog, focuses the message textbox, closes with Escape, and restores focus. Do not skip these credential-free cases, authenticate, register an Event, apply to a cohort, submit an introduction, create data, mutate a database, or call providers.

- [ ] **Step 3: Extend only the cross-surface unit coverage**

    Extend the existing LocaleSwitcher harness with a mutable pathState so Event status and Showcase filter values prove pathname, serialized query, and hash retention through the real component. Verify messages contain matching en and zh-HK keys for Event status/action outcomes, availability states, partner wall, membership catalog, Contact cards, and Concierge launcher labels.

- [ ] **Step 4: Run the exact credential-free browser command**

    Run: npm.cmd run test:e2e -- tests/e2e/wisetech-pr5-public-journeys.spec.ts

    Expected: PASS on the managed local server without database, provider, or identity credentials. If the managed server itself cannot start, report that environment condition as a blocker; do not skip or convert it into a pass.

- [ ] **Step 5: Commit**

    git add tests/e2e/wisetech-pr5-public-journeys.spec.ts tests/unit/locale-switcher.test.tsx tests/unit/messages.test.ts
    git commit -m "test: cover wisetech public journeys"

### Task 10: Run cross-cutting verification and record boundaries honestly

**Files:**

- Modify: docs/integration/wisetech-delivery-gates.md only if the existing document has a PR5 verification-evidence section; otherwise create docs/integration/wisetech-pr5-verification.md.
- Test: recorded per-task focused suites from Tasks 1-9, then one cross-surface aggregate and repository-wide scripts.

**Interfaces:**

- Consumes: each completed task’s unit/browser test contracts and committed migration artifacts.
- Produces: a local verification record with commands, timestamps, exit codes, totals, baseline failures if any, and named external gates; it makes no claim about migrations, providers, Preview, UAT, production, merges, or deployments.

- [ ] **Step 1: Confirm per-task evidence, then run a cross-surface focused aggregate**

    Confirm the Task 1-9 implementer/reviewer records contain the exact RED and GREEN commands required in their owning tasks, including public-post/sitemap, Launch Pad audit, Concierge protection, membership link/tier/message, and Showcase regression suites. Do not replace or omit that evidence.

    Run: npm.cmd test -- tests/unit/wisetech-pr5-event-hero-schema.test.ts tests/unit/event-hero-admin-and-media.test.ts tests/unit/event-public-status.test.ts tests/unit/event-public-page.test.tsx tests/unit/event-registration-public-action.test.ts tests/unit/event-private-media-render.test.tsx tests/unit/public-layout-announcement.test.tsx tests/unit/home-partner-wall.test.tsx tests/unit/public-news-locale.test.ts tests/unit/news-page-locale.test.tsx tests/unit/launchpad-partner-cutover.test.tsx tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/wisetech-pr5-showcase-presentation.test.tsx tests/unit/contact-concierge-launcher.test.tsx tests/unit/locale-switcher.test.tsx

    Expected: PASS. Capture the exact timestamp, exit code, and Vitest totals for this cross-surface subset, and preserve the recorded exact per-task focused results in the verification record.

- [ ] **Step 2: Run the donor/fallback and migration-artifact safety checks**

    Run: rg -n -i "wisetech|YNWAforever|landing-partners|inquiry|remotePatterns|body_mdx_zh_hk|STRIPE_SECRET_KEY" app components lib config scripts tests

    Expected: every hit is an approved evidence/config/test reference; no donor asset/runtime import, static Landing Partner fallback, inquiry schema/action, remote image allowlist, Chinese English-body fallback, or client-visible Stripe secret/value appears.

    Run: npm.cmd test -- tests/unit/wisetech-pr5-event-hero-schema.test.ts tests/unit/m7-media-schema-contract.test.ts

    Expected: PASS with committed-only schema/migration/snapshot/journal evidence. Do not run a migration or connect to a database.

- [ ] **Step 3: Run repository-wide credential-free checks**

    Run: npm.cmd run audit:strings
    Expected: PASS.

    Run: npm.cmd test
    Expected: PASS or an explicitly recorded pre-existing/environment failure with affected suite and unchanged evidence.

    Run: npm.cmd run lint
    Expected: PASS or an explicitly recorded pre-existing/environment failure.

    Run: npm.cmd run typecheck
    Expected: PASS or an explicitly recorded pre-existing/environment failure.

    Run: npm.cmd run build
    Expected: PASS or an explicitly recorded pre-existing/environment failure.

    Run: npm.cmd audit --omit=dev --audit-level=high
    Expected: exit code 0 with high vulnerabilities equal to 0.

- [ ] **Step 4: Run the exact browser command and inspect the final diff**

    Run: npm.cmd run test:e2e -- tests/e2e/wisetech-pr5-public-journeys.spec.ts

    Expected: PASS under the credential-free isolated setup, or a clearly named environment blocker.

    Run: git diff --check

    Expected: no whitespace errors.

    Run: git status --short

    Expected: only intended PR5 files and the selected verification record; do not push, merge, deploy, run migrations, or mutate providers.

- [ ] **Step 5: Write the evidence record**

    Record each command’s timestamp, exit code, and totals. List these as NOT PASSED until separately evidenced: isolated migration/rollback execution, authenticated Event/cohort/Showcase UAT, R2 delivery/revocation and jurisdiction, approved translations/content/partner rights, accessibility/Lighthouse Preview review, Preview/UAT and rollback rehearsal, GitHub required checks, and production approval/deployment/observation. Do not state or imply those external conditions passed.

- [ ] **Step 6: Verify and commit only the evidence record**

    Run: git diff --check

    Expected: no whitespace errors.

    Stage the single selected verification document, then commit:

    git add docs/integration/wisetech-pr5-verification.md
    git commit -m "docs: record PR5 verification"

    If docs/integration/wisetech-delivery-gates.md was used instead, stage that exact path in place of wisetech-pr5-verification.md. Do not stage generated runtime files or unrelated changes.

## Self-Review

- Spec coverage: Tasks 1-2 cover Event media/schema/admin/archive, public status/order, detail, and registration lock/action outcomes. Task 3 covers deterministic announcements and rights-gated partners. Task 4 covers News projections, shared namespace separation, homepage, and independent sitemap locale failures. Task 5 is the atomic Launch Pad source cutover/audit change. Task 6 covers repository-only membership pricing/eligibility. Tasks 7-8 preserve Showcase and Concierge owners while changing presentation. Tasks 9-10 cover bilingual, accessibility, credential-free browser verification, artifact checks, audit, and external gates.
- Type consistency: public Event, News, membership, announcement, and Concierge signatures are defined before their consumer tasks; later pages consume only those projections/contracts.
- Placeholder scan: the plan contains concrete paths, signatures, SQL, test examples, commands, expected results, and commit scopes for every task.

## Execution Handoff

Execution mode is already approved: Subagent-Driven. Dispatch one fresh implementer for each numbered task, require its RED/GREEN/refactor evidence and exact commit, generate a per-task review package from the recorded base, then obtain a fresh independent task review before advancing.
