import {readFileSync} from "node:fs";
import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = [...missingM2LiveEnvironment()];
if (!process.env.PLAYWRIGHT_BASE_URL?.trim()) missing.push("PLAYWRIGHT_BASE_URL (isolated non-Production Preview)");
if (/hkwtia\.vercel\.app|production/i.test(process.env.PLAYWRIGHT_BASE_URL ?? "")) missing.push("non-Production PLAYWRIGHT_BASE_URL");
const bundle = (locale: "en" | "zh-HK") => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {
  Join: {resume: {title: string; start: string; new: string; continue: string}; profileTitle: string};
};

for (const {locale, prefix} of [{locale: "en" as const, prefix: ""}, {locale: "zh-HK" as const, prefix: "/zh"}]) {
  test(`${locale}: signed-in join start and return are resumable across tabs`, async ({browser}) => {
    test.skip(missing.length > 0, `Requires isolated member, DB, auth and Preview: ${missing.join(", ")}`);
    const labels = bundle(locale).Join;
    const context = await browser.newContext({viewport: {width: 390, height: 844}});
    const first = await context.newPage();
    await signInForM2(first, "member");
    await first.goto(`${prefix}/join?plan=startup`);
    await expect(first.getByRole("heading", {name: labels.resume.title})).toBeVisible();
    const start = first.getByRole("button", {name: labels.resume.start});
    const fresh = first.getByRole("button", {name: labels.resume.new});
    await (await start.isVisible() ? start : fresh).click();
    await first.waitForURL((url) => url.pathname === `${prefix}/join/profile` && url.searchParams.get("plan") === "startup" && Boolean(url.searchParams.get("application")));
    await expect(first.getByRole("heading", {name: labels.profileTitle})).toBeVisible();
    const second = await context.newPage();
    await second.goto(`${prefix}/join?plan=startup`);
    await expect(second.getByRole("heading", {name: labels.resume.title})).toBeVisible();
    await expect(second.getByRole("button", {name: labels.resume.continue}).first()).toBeVisible();
    await context.close();
  });
}
