import {readFileSync} from "node:fs";

import {expect, test, type Page, type Route} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type ConciergeCopy = Readonly<{
  Concierge: {
    launcher: string;
    title: string;
    messageLabel: string;
    send: string;
  };
}>;

const copy = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(
    new URL(`../../messages/${locale}.json`, import.meta.url),
    "utf8",
  )) as ConciergeCopy;

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function sse(answer: string): string {
  return [
    `event: meta\ndata: ${JSON.stringify({
      conversationId: CONVERSATION_ID,
      runId: RUN_ID,
    })}\n\n`,
    `event: delta\ndata: ${JSON.stringify({text: answer})}\n\n`,
    'event: done\ndata: {"citations":[],"escalationId":null}\n\n',
  ].join("");
}

async function ask(page: Page, labels: ConciergeCopy["Concierge"], question: string) {
  const dialog = page.getByRole("dialog", {name: labels.title});
  await dialog.getByRole("textbox", {name: labels.messageLabel}).fill(question);
  await dialog.getByRole("button", {name: labels.send}).click();
}

test("anonymous English and Traditional Chinese turns keep conversation continuity", async ({page}) => {
  await page.setViewportSize({width: 375, height: 812});
  const requests: Array<Record<string, unknown>> = [];
  let turn = 0;
  await page.route("**/api/ai/concierge", async (route: Route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    turn += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: {"cache-control": "no-cache"},
      body: sse(`Answer ${turn}`),
    });
  });

  for (const locale of ["en", "zh-HK"] as const) {
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
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )).toBe(true);

    await ask(page, labels, `Question in ${locale}`);
    await expect(dialog.getByText(`Answer ${turn}`, {exact: true})).toBeVisible();
    await ask(page, labels, `Follow-up in ${locale}`);
    await expect(dialog.getByText(`Answer ${turn}`, {exact: true})).toBeVisible();

    const localeRequests = requests.slice(-2);
    expect(localeRequests[0]).toMatchObject({locale});
    expect(localeRequests[0]).not.toHaveProperty("conversationId");
    expect(localeRequests[1]).toMatchObject({
      locale,
      conversationId: CONVERSATION_ID,
    });
  }
});

const missingMemberEnvironment = missingM2LiveEnvironment();

test("authenticated member can use the Concierge from the member portal", async ({page}) => {
  test.skip(
    missingMemberEnvironment.length > 0,
    `Member Concierge acceptance requires existing M2 test account environment: ${missingMemberEnvironment.join(", ")}`,
  );
  const labels = copy("en").Concierge;
  await page.route("**/api/ai/concierge", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: sse("Your member context is available."),
    }),
  );

  await signInForM2(page, "member");
  await page.goto("/portal");
  await page.getByRole("button", {name: labels.launcher}).click();
  await ask(page, labels, "What is my membership context?");
  await expect(page.getByRole("dialog", {name: labels.title}))
    .toContainText("Your member context is available.");
});
