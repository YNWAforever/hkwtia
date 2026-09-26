import {readFileSync} from "node:fs";
import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = missingM2LiveEnvironment();
const copy = (locale: "en" | "zh-HK") => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {
  Admin: {members: {search: string; view: string}; member360: {backToMembers: string; purchases: string}};
};
for (const {locale, prefix} of [{locale: "en" as const, prefix: ""}, {locale: "zh-HK" as const, prefix: "/zh"}]) {
  test(`${locale}: member search, detail and return retain the filter`, async ({page}) => {
    test.skip(missing.length > 0, `Requires isolated M2 DB/auth fixture: ${missing.join(", ")}`);
    await signInForM2(page, "staff");
    const labels = copy(locale).Admin;
    await page.goto(`${prefix}/admin/members`);
    await page.getByRole("searchbox", {name: labels.members.search}).fill("M2 Risk 01");
    await page.getByRole("button", {name: labels.members.search}).click();
    await expect(page).toHaveURL(/q=M2(?:\+|%20)Risk(?:\+|%20)01/);
    const row = page.getByRole("row", {name: /M2 Risk 01/});
    await expect(row).toBeVisible();
    await row.getByRole("link", {name: labels.members.view}).click();
    await expect(page.getByRole("heading", {level: 1, name: "M2 Risk 01"})).toBeVisible();
    await expect(page.getByRole("heading", {name: labels.member360.purchases})).toBeVisible();
    await page.getByRole("link", {name: labels.member360.backToMembers}).click();
    await expect(page).toHaveURL(/q=M2(?:\+|%20)Risk(?:\+|%20)01/);
    await expect(page.getByRole("row", {name: /M2 Risk 01/})).toBeVisible();
  });
}
