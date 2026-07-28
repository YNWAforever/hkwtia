import {readFileSync} from "node:fs";

import {expect, test, type Page} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type ConciergeCopy = Readonly<{
  Concierge: {
    launcher: string;
    title: string;
    messageLabel: string;
    send: string;
    sources: string;
  };
}>;

const copy = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(
    new URL(`../../messages/${locale}.json`, import.meta.url),
    "utf8",
  )) as ConciergeCopy;

async function ask(
  page: Page,
  labels: ConciergeCopy["Concierge"],
  question: string,
) {
  const dialog = page.getByRole("dialog", {name: labels.title});
  await dialog.getByRole("textbox", {name: labels.messageLabel}).fill(question);
  await dialog.getByRole("button", {name: labels.send}).click();
}

const viewports = [
  {name: "desktop", width: 1280, height: 900},
  {name: "mobile", width: 375, height: 812},
] as const;

for (const viewport of viewports) {
  for (const locale of ["en", "zh-HK"] as const) {
    test(
      `${viewport.name} ${locale} real-route mock provider cites sources and keeps continuity`,
      async ({page}) => {
        await page.setViewportSize(viewport);
        const labels = copy(locale).Concierge;
        await page.goto(locale === "en" ? "/about" : "/zh/about");
        await expect.poll(() => page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        )).toBe(true);
        await page.getByRole("button", {name: labels.launcher}).click();
        const dialog = page.getByRole("dialog", {name: labels.title});
        await expect(dialog).toBeVisible();

        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);

        const question = locale === "en"
          ? "Tell me about approved WTIA membership benefits."
          : "請介紹已批准的 WTIA 會員福利。";
        const answer = locale === "en"
          ? "Approved WTIA membership benefits include community events."
          : "已批准的 WTIA 會員福利包括社群活動。";
        const responsePromise = page.waitForResponse((response) =>
          response.url().endsWith("/api/ai/concierge")
          && response.request().method() === "POST"
        );
        await ask(page, labels, question);
        const response = await responsePromise;
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toContain("text/event-stream");
        await expect(dialog.getByText(answer, {exact: true})).toBeVisible();

        const sourceTitle = locale === "en"
          ? "WTIA Membership"
          : "WTIA 會員";
        const source = dialog.getByRole("link", {
          name: new RegExp(sourceTitle),
        });
        await expect(source).toBeVisible();
        await expect(source).toHaveAttribute(
          "href",
          locale === "en"
            ? "https://www.hkwtia.org/membership"
            : "https://www.hkwtia.org/zh-HK/membership",
        );

        const repeatResponsePromise = page.waitForResponse((response) =>
          response.url().endsWith("/api/ai/concierge")
          && response.request().method() === "POST"
        );
        await ask(page, labels, question);
        expect((await repeatResponsePromise).status()).toBe(200);
        await expect(dialog.getByText(answer, {exact: true})).toHaveCount(2);
      },
    );
  }
}

const missingMemberEnvironment = missingM2LiveEnvironment();

test("authenticated member can use the real Concierge route from the member portal", async ({
  page,
}) => {
  test.skip(
    missingMemberEnvironment.length > 0,
    `Member Concierge acceptance requires existing M2 test account environment: ${missingMemberEnvironment.join(", ")}`,
  );
  const labels = copy("en").Concierge;
  await signInForM2(page, "member");
  await page.goto("/portal");
  await page.getByRole("button", {name: labels.launcher}).click();
  await ask(page, labels, "What is my membership context?");
  const dialog = page.getByRole("dialog", {name: labels.title});
  await expect(dialog).toContainText(labels.sources);
});
