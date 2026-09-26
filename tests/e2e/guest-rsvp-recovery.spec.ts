import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

const copy = (locale: "en" | "zh-HK") => {
  const bundle = JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8"));
  return bundle.Events.detail.guest as {submit: string; invalid: string; requiredField: string; unavailable: string};
};

for (const {locale, prefix} of [{locale: "en" as const, prefix: ""}, {locale: "zh-HK" as const, prefix: "/zh"}]) {
  test(`${locale}: empty RSVP and a lost action response stay on the form`, async ({page}) => {
    await page.goto(`${prefix}/events?status=open`);
    const hrefs = [...new Set(await page.locator(".event-library a[href*='/events/']").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)),
    ))].slice(0, 6);
    let eventHref: string | null = null;
    for (const href of hrefs) {
      await page.goto(href);
      if (await page.locator("form.guest-rsvp-form").count()) { eventHref = href; break; }
    }
    test.skip(eventHref === null, hrefs.length === 0
      ? "isolated environment has no open event fixture"
      : "the six soonest open events have no anonymous RSVP form");

    const labels = copy(locale);
    const form = page.locator("form.guest-rsvp-form");
    await form.getByRole("button", {name: labels.submit}).click();
    await expect(form.locator("#guest-rsvp-status")).toHaveText(labels.invalid);
    await expect(form.locator("#guest-rsvp-name-error")).toHaveText(labels.requiredField);
    await expect(form.locator("input[name=name]")).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`${eventHref!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));

    await form.locator("input[name=name]").fill("Test Guest");
    await form.locator("input[name=email]").fill("guest@example.test");
    await page.route("**/events/**", async (route) => {
      if (route.request().method() === "POST") await route.abort("failed");
      else await route.continue();
    });
    await form.getByRole("button", {name: labels.submit}).click();
    await expect(form.locator("#guest-rsvp-status")).toContainText(labels.unavailable);
    await expect(form.locator("input[name=name]")).toHaveValue("Test Guest");
    await expect(form.locator("input[name=email]")).toHaveValue("guest@example.test");
  });
}
