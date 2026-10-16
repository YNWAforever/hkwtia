import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { expect, test } from "@playwright/test";
function chunks(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? chunks(join(path, entry.name))
      : entry.name.endsWith(".js") &&
          readFileSync(join(path, entry.name), "utf8").includes(
            "CONCIERGE_HTTP_ERROR",
          )
        ? [basename(entry.name)]
        : [],
  );
}
test.use({ trace: "off", video: "off" });
for (const locale of ["en", "zh-HK"] as const) {
  test(`${locale} closed concierge defers its dialog implementation until intent`, async ({
    page,
  }) => {
    test.skip(
      process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1" ||
        process.env.PLAYWRIGHT_BASE_URL !== "http://localhost:3450",
      "BLOCKED: owned positive-marker isolated production build required",
    );
    const messages = JSON.parse(
      readFileSync(`messages/${locale}.json`, "utf8"),
    );
    const labels = messages.Concierge;
    const heavy = chunks(".next/static/chunks");
    expect(
      heavy.length,
      "Discover the actual compiled widget; never pass vacuously",
    ).toBeGreaterThan(0);
    const loaded = new Set<string>();
    page.on("request", (request) => {
      const name = basename(new URL(request.url()).pathname);
      if (heavy.includes(name)) loaded.add(name);
    });
    const prefix = locale === "zh-HK" ? "/zh" : "";
    await page.goto(prefix + "/about");
    const launcher = page.getByRole("button", {
      name: labels.launcher,
      exact: true,
    });
    await expect(launcher).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      [...loaded],
      "Closed dialog implementation must not download before intent",
    ).toEqual([]);
    await launcher.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: labels.title });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: labels.messageLabel }),
    ).toBeFocused();
    expect(loaded.size).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeFocused();
    await page.goto(prefix + "/contact");
    const invoker = page.locator("main").getByRole("button", {
      name: messages.Contact.conciergeLauncher,
      exact: true,
    });
    // Existing contact CTA dispatches the established concierge-open event.
    await expect(invoker).toBeVisible();
    await invoker.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(invoker).toBeFocused();
  });
}
for (const locale of ["en", "zh-HK"] as const) {
  test(`${locale} a failed dialog download keeps manual journeys and can recover`, async ({
    page,
  }) => {
    test.skip(
      process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1" ||
        process.env.PLAYWRIGHT_BASE_URL !== "http://localhost:3450",
      "BLOCKED: owned positively proven isolated production build required",
    );
    const labels = JSON.parse(
      readFileSync(`messages/${locale}.json`, "utf8"),
    ).Concierge;
    const heavy = chunks(".next/static/chunks");
    expect(heavy.length).toBeGreaterThan(0);
    const prefix = locale === "zh-HK" ? "/zh" : "";
    await page.route("**/*", (route) =>
      heavy.includes(basename(new URL(route.request().url()).pathname))
        ? route.abort("failed")
        : route.continue(),
    );
    await page.goto(prefix + "/about");
    const launcher = page.getByRole("button", {
      name: labels.launcher,
      exact: true,
    });
    await launcher.click();
    const alert = page.getByRole("alert").filter({hasText:labels.temporarilyUnavailable});
    await expect(alert).toContainText(labels.temporarilyUnavailable);
    await expect(
      alert.getByRole("link", { name: labels.applicationGuide }),
    ).toHaveAttribute("href", prefix + "/join");
    await expect(
      alert.getByRole("link", { name: labels.contactSupport }),
    ).toHaveAttribute("href", prefix + "/contact");
    await page.unroute("**/*");
    await launcher.click();
    const dialog = page.getByRole("dialog", { name: labels.title });
    await expect(dialog).toBeVisible();
    await expect(alert).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(launcher).toBeFocused();
  });
}
