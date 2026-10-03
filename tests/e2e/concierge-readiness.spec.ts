import {readFileSync} from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import {expect, test} from "@playwright/test";
const mode = process.env.CONCIERGE_FAILURE_ACCEPTANCE;
test.use({trace: "off"});
test.beforeEach(() => {
  test.skip(mode !== "missing" && mode !== "disabled", "Requires the separately guarded isolated production-build failure profile; never mocks an AI/provider success.");
});
for (const locale of ["en", "zh-HK"] as const) for (const width of [1440, 390]) {
  test(`${locale} ${width}px real configuration failure keeps manual journeys available`, async ({page}) => {
    const labels = JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")).Concierge;
    await page.setViewportSize({width, height: 900});
    const prefix = locale === "zh-HK" ? "/zh" : "";
    await page.goto(prefix + "/about");
    const launcher = page.getByRole("button", {name: labels.launcher});
    await launcher.click();
    const dialog = page.getByRole("dialog", {name: labels.title});
    const composer = dialog.getByRole("textbox", {name: labels.messageLabel});
    await expect(composer).toBeFocused();
    const question = locale === "zh-HK" ? "合成驗收：如何申請入會？" : "Synthetic acceptance: how do I apply?";
    await composer.fill(question);
    const pending = page.waitForResponse((response) => response.url().endsWith("/api/ai/concierge") && response.request().method() === "POST");
    await dialog.getByRole("button", {name: labels.send, exact: true}).click();
    const response = await pending;
    expect(response.status()).toBe(503);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const receipt = await response.json();
    expect(receipt).toEqual({error: mode === "missing" ? "AI_CONFIGURATION_UNAVAILABLE" : "AI_DISABLED", requestId: expect.stringMatching(/^[0-9a-f-]{36}$/)});
    expect(JSON.stringify(receipt)).not.toMatch(/SECRET|API_KEY|token|cookie/);
    await expect(dialog.getByRole("alert")).toHaveText(mode === "missing" ? labels.configurationUnavailable : labels.disabled);
    await expect(dialog.getByText(question, {exact: true})).toBeVisible();
    await expect(dialog.getByRole("link", {name: labels.applicationGuide})).toHaveAttribute("href", prefix + "/join");
    await expect(dialog.getByRole("link", {name: labels.contactSupport})).toHaveAttribute("href", prefix + "/contact");
    await expect(dialog.getByText(labels.leaveMessage, {exact: true})).toHaveCount(0);
    await expect(dialog.getByRole("button", {name: labels.retry})).toHaveCount(0);
    const axe = await new AxeBuilder({page}).include('[role="dialog"]').analyze();
    expect(axe.violations.filter((issue) => issue.impact === "serious" || issue.impact === "critical")).toEqual([]);
    await composer.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("textbox", {name: labels.contactEmailLabel})).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("link", {name: labels.contactSupport})).toBeFocused();
    await test.info().attach(`${locale}-${width}-${mode}`, {body: await page.screenshot(), contentType: "image/png"});
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });
}
