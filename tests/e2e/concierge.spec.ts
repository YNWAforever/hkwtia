import {readFileSync} from "node:fs";

import {expect, test, type Page, type Route} from "@playwright/test";

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

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function sse(
  answer: string,
  locale: "en" | "zh-HK",
): string {
  const sourceTitle = locale === "en"
    ? "WTIA Membership"
    : "WTIA 會員";
  return [
    `event: meta\ndata: ${JSON.stringify({
      conversationId: CONVERSATION_ID,
      runId: RUN_ID,
    })}\n\n`,
    `event: delta\ndata: ${JSON.stringify({text: answer})}\n\n`,
    `event: done\ndata: ${JSON.stringify({
      citations: [{
        sourceId: `m4a:${locale}:membership`,
        title: sourceTitle,
        url: locale === "en"
          ? "https://www.hkwtia.org/membership"
          : "https://www.hkwtia.org/zh-HK/membership",
      }],
      escalationId: null,
    })}\n\n`,
  ].join("");
}

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
      `${viewport.name} ${locale} mock-provider flow cites approved sources and keeps continuity`,
      async ({page}) => {
        await page.setViewportSize(viewport);
        const labels = copy(locale).Concierge;
        const requests: Array<Record<string, unknown>> = [];
        let turn = 0;
        await page.route("**/api/ai/concierge", async (route: Route) => {
          requests.push(
            route.request().postDataJSON() as Record<string, unknown>,
          );
          turn += 1;
          await route.fulfill({
            status: 200,
            contentType: "text/event-stream; charset=utf-8",
            headers: {"cache-control": "no-cache"},
            body: sse(`M4A ${locale} answer ${turn}`, locale),
          });
        });

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

        await ask(page, labels, `Question in ${locale}`);
        await expect(
          dialog.getByText(`M4A ${locale} answer 1`, {exact: true}),
        ).toBeVisible();
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

        await ask(page, labels, `Follow-up in ${locale}`);
        await expect(
          dialog.getByText(`M4A ${locale} answer 2`, {exact: true}),
        ).toBeVisible();

        expect(requests).toHaveLength(2);
        expect(requests[0]).toMatchObject({locale});
        expect(requests[0]).not.toHaveProperty("conversationId");
        expect(requests[1]).toMatchObject({
          locale,
          conversationId: CONVERSATION_ID,
        });
      },
    );
  }
}

const missingMemberEnvironment = missingM2LiveEnvironment();

test("authenticated member can use the Concierge from the member portal", async ({
  page,
}) => {
  test.skip(
    missingMemberEnvironment.length > 0,
    `Member Concierge acceptance requires existing M2 test account environment: ${missingMemberEnvironment.join(", ")}`,
  );
  const labels = copy("en").Concierge;
  await page.route("**/api/ai/concierge", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: sse("Your member context is available.", "en"),
    }),
  );

  await signInForM2(page, "member");
  await page.goto("/portal");
  await page.getByRole("button", {name: labels.launcher}).click();
  await ask(page, labels, "What is my membership context?");
  await expect(page.getByRole("dialog", {name: labels.title}))
    .toContainText("Your member context is available.");
});
