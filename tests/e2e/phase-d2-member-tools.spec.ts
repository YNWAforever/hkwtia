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
