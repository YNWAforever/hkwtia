import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = missingM2LiveEnvironment();
const writersEnabled = process.env.AGENTS_ENABLED === "true";

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {
    Portal: {writer: {label: string; briefLabel: string; generate: string}};
  };

/**
 * Phase D-3 exit: a member generates copy from the portal and it lands in the
 * form, unfiled until they save. This needs a real model, so it skips unless the
 * isolated M2 environment AND a live agent are configured; the owner acceptance
 * step in the plan is what proves the model itself.
 */
test("a member generates event copy into the form", async ({page}) => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);
  test.skip(!writersEnabled, "Requires AGENTS_ENABLED=true");

  const copy = bundle("en");
  await signInForM2(page, "member");
  await page.goto("/portal/events/new");

  // The control is a collapsed `<details>`: the summary opens it, and the brief
  // field it reveals carries the "briefLabel" name, not the control's own label.
  await page.getByText(copy.Portal.writer.label).click();
  await page.getByLabel(copy.Portal.writer.briefLabel).fill("A members-only workshop on edge AI");
  await page.getByRole("button", {name: copy.Portal.writer.generate}).click();

  await expect(page.locator("textarea[name=descriptionEn]")).not.toHaveValue("");
  await expect(page.locator("textarea[name=descriptionZh]")).not.toHaveValue("");
});

test("the same member can generate showcase listing copy", async ({page}) => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);
  test.skip(!writersEnabled, "Requires AGENTS_ENABLED=true");

  await signInForM2(page, "member");
  await page.goto("/portal/company/listing");

  await expect(page.getByText(bundle("en").Portal.writer.label)).toBeVisible();
});
