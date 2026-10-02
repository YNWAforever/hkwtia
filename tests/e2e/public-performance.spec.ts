import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
test.use({ trace: "off", video: "off" });
test.describe("public first paint on actual built browser", () => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "true",
    "Confirmed isolated acceptance required",
  );
  test("a pending real database read preserves the discovery anchor", async ({
    page,
    baseURL,
  }) => {
    expect(new URL(baseURL!).hostname).toBe("localhost");
    expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
    expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe(
      "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
    );
    expect(process.env.NEON_PROJECT_ID).toBe("solitary-wave-52860119");
    expect(process.env.AUDIT_BATCH_WORKER_PAUSED).toBe("true");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL_TEST,
      max: 1,
    });
    const client = await pool.connect();
    try {
      expect(
        Number(
          (await client.query("SELECT count(*) AS n FROM acceptance_sentinel"))
            .rows[0].n,
        ),
      ).toBe(1);
      await client.query("BEGIN");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
      await client.query("LOCK TABLE events IN ACCESS EXCLUSIVE MODE");
      await page
        .context()
        .addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
      await page.goto("/", { waitUntil: "commit" });
      await expect(page.locator("#hero-title")).toBeVisible();
      await expect(page.locator("#pathways")).toBeAttached();
      await expect(
        page.locator('#home-discover[aria-busy="true"]'),
      ).toBeAttached({ timeout: 4000 });
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
    await expect(page.locator("#open-now-title")).toBeVisible();
    await expect(page.locator('#home-discover[aria-busy="true"]')).toHaveCount(
      0,
    );
  });
  for (const locale of ["en", "zh-HK"] as const) {
    test(`${locale} hero request is explicitly eager and high priority`, async ({
      page,
      baseURL,
    }) => {
      expect(new URL(baseURL!).hostname).toBe("localhost");
      await page
        .context()
        .addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
      await page.goto(locale === "en" ? "/" : "/zh");
      const image = page.locator("img.hero-image");
      await expect(image).toHaveAttribute("fetchpriority", "high");
      await expect(image).toHaveAttribute("loading", "eager");
    });
    test(`${locale} streamed opening section does not move the first viewport`, async ({
      page,
      baseURL,
    }) => {
      expect(new URL(baseURL!).hostname).toBe("localhost");
      await page
        .context()
        .addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
      await page.setViewportSize({ width: 390, height: 844 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 200000,
        uploadThroughput: 93750,
      });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.addInitScript(() => {
        const target = window as typeof window & {
          __auditShift?: {
            supported: boolean;
            value: number;
            sources: string[];
          };
        };
        target.__auditShift = {
          supported:
            PerformanceObserver.supportedEntryTypes.includes("layout-shift"),
          value: 0,
          sources: [],
        };
        new PerformanceObserver((list) => {
          for (const item of list.getEntries()) {
            const e = item as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
              sources?: { node?: Element }[];
            };
            if (!e.hadRecentInput) {
              target.__auditShift!.value += e.value;
              target.__auditShift!.sources.push(
                ...(e.sources ?? []).map(
                  (source) =>
                    source.node?.id || source.node?.tagName || "unknown",
                ),
              );
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(locale === "en" ? "/" : "/zh");
      await expect(page.locator("#open-now-title")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      const facts = await page.evaluate(
        () =>
          new Promise<
            { supported: boolean; value: number; sources: string[] } | undefined
          >((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                resolve(
                  (
                    window as typeof window & {
                      __auditShift?: {
                        supported: boolean;
                        value: number;
                        sources: string[];
                      };
                    }
                  ).__auditShift,
                ),
              ),
            ),
          ),
      );
      expect(facts?.supported).toBe(true);
      mkdirSync("docs/audits/hkwtia-2026-10-01-remediation/evidence/t21", {
        recursive: true,
      });
      writeFileSync(
        `docs/audits/hkwtia-2026-10-01-remediation/evidence/t21/paint-${locale}.json`,
        JSON.stringify(
          {
            sourceSha: process.env.AUDIT_SOURCE_SHA,
            environment:
              "owned built loopback; actual Chromium; CDP150ms/1.6Mbps/4xCPU; 390x844",
            production: false,
            locale,
            cls: facts?.value,
            sources: facts?.sources,
          },
          null,
          2,
        ) + "\n",
      );
      expect(facts!.value).toBeLessThanOrEqual(0.1);
    });
  }
});
