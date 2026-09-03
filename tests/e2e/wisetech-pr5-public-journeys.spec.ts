import {expect, test, type Page} from "@playwright/test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {require as tsxRequire} from "tsx/cjs/api";

import type {PartnerProjection} from "@/lib/db/repos/partners";
import type {PublicEventProjection} from "@/lib/events/public";

function presentationComponents() {
  const {EventDetail} = tsxRequire("../../components/marketing/event-detail.tsx", import.meta.url);
  const {HomePartnerWall} = tsxRequire("../../components/marketing/home-partner-wall.tsx", import.meta.url);
  return {EventDetail, HomePartnerWall};
}

const EVENT_MEDIA_URL = "/api/media/10000000-0000-4000-8000-000000000001";
const PARTNER_MEDIA_URL = "/api/media/20000000-0000-4000-8000-000000000002";

const eventFixtureWithPrivateHero = {
  id: "30000000-0000-4000-8000-000000000003",
  slug: "private-hero-event",
  title: "Private hero Event",
  description: "Display-safe Event presentation fixture.",
  startsAt: "2030-01-01T09:00:00.000Z",
  endsAt: null,
  venue: "Hong Kong",
  capacity: 12,
  hero: {url: EVENT_MEDIA_URL, alt: "Curated Event hero"},
} satisfies PublicEventProjection;

const partnerFixtureWithPrivateLogo = {
  id: "40000000-0000-4000-8000-000000000004",
  name: "Approved partner",
  category: "supporting",
  websiteUrl: "https://partner.example.test/",
  logoUrl: PARTNER_MEDIA_URL,
  logoAlt: "Approved partner logo",
  displayOrder: 1,
  featured: true,
} satisfies PartnerProjection;

async function expectExactPrivateMedia(
  page: Page,
  html: string,
  mediaUrl: string,
): Promise<void> {
  await page.setContent(html);
  await expect(page.locator(`img[src="${mediaUrl}"]`)).toHaveCount(1);
  await expect(page.locator('img[src*="/_next/image"]')).toHaveCount(0);
  await expect(page.locator('img[src^="http://"], img[src^="https://"]')).toHaveCount(0);
}

test("preserves Event status and Showcase filters across locale switches", async ({page}) => {
  const eventsResponse = await page.goto("/events?status=past#results");
  expect(eventsResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", {name: "Events are temporarily unavailable"})).toBeVisible();
  await page.getByRole("button", {name: "Switch to Chinese"}).first().click();
  await expect(page).toHaveURL(/\/zh\/events\?status=past#results$/);
  await expect(page.getByRole("heading", {name: "暫時未能載入活動"})).toBeVisible();
  await page.getByRole("button", {name: "Switch to English"}).first().click();
  await expect(page).toHaveURL(/\/events\?status=past#results$/);

  const showcaseResponse = await page.goto("/showcase?q=ai&category=software#results");
  expect(showcaseResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", {name: "No published listings match"})).toBeVisible();
  await page.getByRole("button", {name: "Switch to Chinese"}).first().click();
  await expect(page).toHaveURL(/\/zh\/showcase\?q=ai&category=software#results$/);
  await expect(page.getByRole("heading", {name: "沒有符合的已發布展示頁"})).toBeVisible();
});

test("keeps the bilingual Membership catalog honest without repository credentials", async ({page}) => {
  for (const membershipCase of [
    {
      path: "/membership",
      title: "Membership tiers",
      unavailable: "Membership is currently unavailable",
      faq: "Membership FAQ",
    },
    {
      path: "/zh/membership",
      title: "會員級別",
      unavailable: "會員計劃暫時未能提供",
      faq: "會員常見問題",
    },
  ] as const) {
    const response = await page.goto(membershipCase.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", {name: membershipCase.title})).toBeVisible();
    // Scoped to the page's own landmark: the WP-2 footer newsletter island mounts a second,
    // idle `role="status"` region on every public route and never unmounts it, deliberately --
    // a live region the reader's software first meets when its text arrives may never announce
    // that text (components/layout/footer-newsletter.tsx:86-94). The shell's region is not this
    // case's subject; the catalog's own unavailable notice is.
    await expect(page.locator("main#main-content").getByRole("status")).toHaveText(membershipCase.unavailable);
    await expect(page.getByRole("heading", {name: membershipCase.faq})).toBeVisible();
  }
});

test("opens Contact Concierge, focuses the message, and restores the launcher after Escape", async ({page}) => {
  const conciergeRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ai/concierge")) conciergeRequests.push(request.url());
  });

  const response = await page.goto("/contact");
  expect(response?.status()).toBe(200);
  // The subject is the contact page's own ContactConciergeLauncher, not the shell's fixed
  // launcher: this case belongs to the /contact journey, and before WP-2 the role query named
  // only that button because `Concierge.launcher` still read "Ask WTIA". Task 1 renamed it to
  // match `Contact.conciergeLauncher`, so two controls now answer to "Ask WiseTech" on this
  // route. That duplicate accessible name is intentional -- one name for one action, repeated
  // by the shell -- so the fix is to scope the query to the page's own landmark, the same way
  // the Membership case above does, and not to rename either control.
  //
  // Scoping is not about focus return: both controls restore focus after Escape, because
  // ContactConciergeLauncher focuses itself before opening the panel
  // (components/marketing/contact-concierge-launcher.tsx:9).
  const launcher = page.locator("main#main-content").getByRole("button", {name: "Ask WiseTech"});
  await launcher.click();

  await expect(page.getByRole("dialog", {name: "WTIA Concierge"})).toBeVisible();
  await expect(page.getByRole("textbox", {name: "Your message"})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", {name: "WTIA Concierge"})).toBeHidden();
  await expect(launcher).toBeFocused();
  expect(conciergeRequests).toEqual([]);
});

test("renders exact own-origin private Event and partner media without optimization", async ({page}) => {
  const {EventDetail, HomePartnerWall} = presentationComponents();
  const eventHtml = renderToStaticMarkup(createElement(EventDetail, {
    event: eventFixtureWithPrivateHero,
    locale: "en",
    labels: {date: "Date", venue: "Venue", capacity: "Capacity"},
  }));
  await expectExactPrivateMedia(page, eventHtml, EVENT_MEDIA_URL);

  const partnerHtml = renderToStaticMarkup(createElement(HomePartnerWall, {
    partners: [partnerFixtureWithPrivateLogo],
    title: "Approved partners",
    intro: "Display-safe partner presentation fixture.",
  }));
  await expectExactPrivateMedia(page, partnerHtml, PARTNER_MEDIA_URL);
});
