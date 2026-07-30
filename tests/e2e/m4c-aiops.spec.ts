import {readFileSync} from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import {expect, test, type Page} from "@playwright/test";

type Locale = "en" | "zh-HK";
type AiOpsMessages = Readonly<{
  title: string;
  currentMonth: string;
  conversations: string;
  resolved: string;
  firstResponse: string;
  csat: string;
  escalation: string;
  failure: string;
  hoursSaved: string;
  llmCost: string;
  renewalHeading: string;
  renewalChartTitle: string;
  architectureHeading: string;
  evidenceHeading: string;
  buildLogs: string;
}>;

const target = process.env.PLAYWRIGHT_BASE_URL?.trim() || null;
const canaryToken = "M4C_PRIVATE_CANARY";
const localePaths: Record<Locale, string> = {
  en: "/en",
  "zh-HK": "/zh",
};
const messages = Object.fromEntries(
  (["en", "zh-HK"] as const).map((locale) => [
    locale,
    (JSON.parse(readFileSync(
      new URL(`../../messages/${locale}.json`, import.meta.url),
      "utf8",
    )) as {AiOps: AiOpsMessages}).AiOps,
  ]),
) as Record<Locale, AiOpsMessages>;

async function enterProtectedPreview(page: Page): Promise<void> {
  const shareToken = process.env.VERCEL_SHARE_TOKEN?.trim();
  if (!shareToken || !target) return;
  const url = new URL(target);
  if (url.hostname === "localhost") return;
  url.searchParams.set("_vercel_share", shareToken);
  await page.goto(url.href);
}

test.describe("M4C public AI-Ops acceptance", () => {
  test.skip(
    !target,
    "Task 10 must provide PLAYWRIGHT_BASE_URL for the isolated protected Preview.",
  );

  test.beforeEach(async ({page}) => {
    await enterProtectedPreview(page);
    await page.setViewportSize({width: 390, height: 844});
  });

  for (const locale of ["en", "zh-HK"] as const) {
    test(`${locale} exposes the complete privacy-safe dashboard`, async ({
      page,
    }) => {
      const labels = messages[locale];
      const response = await page.goto(`${localePaths[locale]}/ai-ops`);
      expect(response?.status()).toBe(200);

      await expect(page.getByRole("heading", {level: 1})).toHaveCount(1);
      await expect(page.getByRole("heading", {
        level: 1,
        name: labels.title,
      })).toBeVisible();

      const metrics = page.getByRole("region", {name: labels.currentMonth});
      for (const name of [
        labels.conversations,
        labels.resolved,
        labels.firstResponse,
        labels.csat,
        labels.escalation,
        labels.failure,
        labels.hoursSaved,
        labels.llmCost,
      ]) {
        await expect(metrics.getByRole("heading", {level: 2, name}))
          .toBeVisible();
      }
      await expect(page.getByText(labels.escalation, {exact: true})).toBeVisible();
      await expect(page.getByText(labels.failure, {exact: true})).toBeVisible();

      await expect(page.getByRole("img", {name: labels.renewalChartTitle}))
        .toBeVisible();
      const renewalTable = page.getByRole("table", {
        name: labels.renewalHeading,
      });
      await expect(renewalTable).toBeVisible();
      await expect(renewalTable.getByRole("row")).toHaveCount(13);

      await expect(page.getByRole("heading", {
        level: 2,
        name: labels.architectureHeading,
      })).toBeVisible();
      const evidence = page.getByRole("region", {
        name: labels.evidenceHeading,
      });
      await expect(evidence).toBeVisible();
      const buildLogLinks = evidence.locator('a[href*="/news/"]');
      await expect(buildLogLinks).toHaveCount(2);
      for (const href of await buildLogLinks.evaluateAll((links) =>
        links.map((link) => (link as HTMLAnchorElement).href)
      )) {
        const buildLog = await page.request.get(href);
        expect(buildLog.status(), href).toBe(200);
      }

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth
        - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const accessibility = await new AxeBuilder({page})
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        accessibility.violations.filter(({impact}) =>
          impact === "serious" || impact === "critical"
        ),
      ).toEqual([]);
      expect(await page.locator("html").innerText()).not.toContain(canaryToken);
      expect(await page.content()).not.toContain(canaryToken);
    });
  }
});
