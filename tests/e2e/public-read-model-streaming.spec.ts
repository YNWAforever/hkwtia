import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ trace: "off", video: "off" });
for (const locale of ["en", "zh-HK"] as const) {
  test(`${locale} streamed membership catalogue and event filters retain manual journeys`, async ({
    page,
  }) => {
    test.skip(
      process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1" ||
        process.env.PLAYWRIGHT_BASE_URL !== "http://localhost:3450",
      "BLOCKED: owned positively proven isolated runtime required",
    );
    const proof = JSON.parse(
      readFileSync(".playwright/full-fix-t15-local-runtime-safe.json", "utf8"),
    );
    expect(proof).toMatchObject({
      dbSourcePositivelyProven: true,
      ledger: 61,
      production: false,
    });
    const messages = JSON.parse(
      readFileSync(`messages/${locale}.json`, "utf8"),
    );
    const prefix = locale === "zh-HK" ? "/zh" : "";
    await page.setViewportSize({
      width: locale === "en" ? 1440 : 390,
      height: 900,
    });
    expect((await page.goto(prefix + "/membership"))?.status()).toBe(200);
    await expect(page.locator("main h1")).toBeVisible();
    for (const code of ["community", "startup", "corporate", "patron"]) {
      const card = page.locator(`#plans article#${code}`);
      await expect(card).toBeVisible();
      await expect(card.locator("h2")).toHaveText(
        messages.Membership.tiers[code].name,
      );
      await expect(card.locator("a")).toHaveAttribute(
        "href",
        new RegExp(`^${prefix}/(join|contact)([?#]|$)`),
      );
    }
    await expect(
      page.getByText(messages.Common.membershipPlansLoading, { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `docs/audits/hkwtia-2026-10-03-full-fix/evidence/t15/${locale}-streamed-membership.png`,
    });
    expect((await page.goto(prefix + "/events"))?.status()).toBe(200);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator(".event-results-head")).toBeVisible();
    await expect(
      page.getByText(messages.Common.eventsListLoading, { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.locator(".event-library > article").count(),
      "Public activity output must be bounded to 12 cards",
    ).toBeLessThanOrEqual(12);
    const nextPage = page.getByRole("link", {
      name: messages.Common.nextPage,
      exact: true,
    });
    await expect(nextPage).toBeVisible();
    const firstLinks = await page
      .locator(".event-library > article h3 a")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    await nextPage.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(".event-results-head")).toBeVisible();
    expect(
      await page.locator(".event-library > article").count(),
    ).toBeLessThanOrEqual(12);
    const secondLinks = await page
      .locator(".event-library > article h3 a")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(firstLinks.length).toBeGreaterThan(0);
    expect(secondLinks.length).toBeGreaterThan(0);
    expect(firstLinks.filter((link) => secondLinks.includes(link))).toEqual([]);
    const past = page.getByRole("button", {
      name: messages.Events.quickTabs.past,
      exact: true,
    });
    await past.click();
    await expect(page).toHaveURL(/status=past/);
    await expect(
      page.getByRole("button", {
        name: messages.Events.quickTabs.past,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".event-results-head")).toBeVisible();
    await page.screenshot({
      path: `docs/audits/hkwtia-2026-10-03-full-fix/evidence/t15/${locale}-streamed-events-past.png`,
    });
    const violations = (
      await new AxeBuilder({ page }).analyze()
    ).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(violations).toEqual([]);
  });
}
