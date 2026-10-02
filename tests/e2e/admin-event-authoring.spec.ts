import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2IdentityEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = missingM2IdentityEnvironment();
const copy = (locale: "en" | "zh-HK") => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {
  Admin: {eventsMgmt: {create: string; createSuccess: string; registrationModes: Record<string, string>}};
};
const modes = [
  {slug: "external-online", registrationMode: "external", format: "online"},
  {slug: "external-hybrid", registrationMode: "external", format: "hybrid"},
  {slug: "rsvp-in-person", registrationMode: "rsvp", format: "in_person"},
  {slug: "ticketed-in-person", registrationMode: "ticketed", format: "in_person"},
] as const;

for (const {locale, prefix} of [{locale: "en" as const, prefix: ""}, {locale: "zh-HK" as const, prefix: "/zh"}]) {
  test(`${locale}: staff event modes survive create, edit and public rendering`, async ({page}) => {
    test.skip(missing.length > 0, `isolated M2 DB/auth acceptance values are missing: ${missing.join(", ")}`);
    await signInForM2(page, "staff");
    const labels = copy(locale).Admin.eventsMgmt;
    for (const [index, mode] of modes.entries()) {
      const slug = `audit-${locale.toLowerCase()}-${mode.slug}-${Date.now()}-${index}`;
      const title = `Audit ${slug}`;
      await page.goto(`${prefix}/admin/events-mgmt`);
      const form = page.locator("form:has(input[name=slug])").first();
      await form.locator("input[name=slug]").fill(slug);
      await form.locator("input[name=titleEn]").fill(title);
      await form.locator("textarea[name=descriptionEn]").fill("Isolated acceptance event");
      await form.locator("input[name=startsAt]").fill(`2030-02-${String(index + 1).padStart(2, "0")}T10:00`);
      await form.locator("input[name=endsAt]").fill(`2030-02-${String(index + 1).padStart(2, "0")}T12:00`);
      await form.locator("select[name=format]").selectOption(mode.format);
      if (mode.format !== "online") await form.locator("input[name=venue]").fill("Hong Kong");
      if (mode.format !== "in_person") await form.locator("input[name=onlineUrl]").fill(`https://meet.example.test/${slug}`);
      await form.locator("select[name=registrationMode]").selectOption(mode.registrationMode);
      if (mode.registrationMode === "external") await form.locator("input[name=externalRegistrationUrl]").fill(`https://register.example.test/${slug}`);
      if (mode.registrationMode === "ticketed") await form.locator("input[name=ticketPriceHkdCents]").fill("250");
      await form.locator("input[name=tags]").fill("AI, Machine Learning");
      await form.locator("select[name=visibility]").selectOption("public");
      await form.locator("input[name=published]").check();
      await form.locator('button[type="submit"]').click();
      await expect(form.getByRole("status").filter({hasText: labels.createSuccess})).toHaveText(labels.createSuccess);
      await page.getByRole("link", {name: title}).click();
      const edit = page.locator("form:has(input[name=slug])").first();
      await expect(edit.locator("select[name=format]")).toHaveValue(mode.format);
      await expect(edit.locator("select[name=registrationMode]")).toHaveValue(mode.registrationMode);
      await expect(edit.locator("input[name=tags]")).toHaveValue("ai, machine-learning");
      if (mode.registrationMode === "external") await expect(edit.locator("input[name=externalRegistrationUrl]")).toHaveValue(`https://register.example.test/${slug}`);
      if (mode.format !== "in_person") await expect(edit.locator("input[name=onlineUrl]")).toHaveValue(`https://meet.example.test/${slug}`);
      await page.goto(`${prefix}/events/${slug}`);
      await expect(page.getByRole("heading", {name: title})).toBeVisible();
      if (mode.registrationMode === "external") await expect(page.locator(`a[href="https://register.example.test/${slug}"]`)).toBeVisible();
    }
  });
}
