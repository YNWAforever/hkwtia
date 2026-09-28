import {mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {expect, test} from "@playwright/test";

// Visual-only local evidence; these checks do not assert provider readiness or authentication.
const evidenceDir = "docs/audits/hkwtia-2026-09-29/evidence";

for (const entry of [
  {name: "member-login-en-desktop", path: "/member-login", heading: "Member sign in", width: 1440},
  {name: "member-login-zh-mobile", path: "/zh/member-login", heading: "會員登入", width: 390},
  {name: "join-zh-desktop", path: "/zh/join?plan=startup", heading: "加入 WTIA", width: 1440},
] as const) {
  test(`anonymous ${entry.name} renders for audit evidence`, async ({page}) => {
    await page.setViewportSize({width: entry.width, height: 900});
    await page.goto(entry.path);
    await expect(page.getByRole("heading", {level: 1, name: entry.heading})).toBeVisible();
    const output = `${evidenceDir}/${entry.name}.png`;
    await mkdir(dirname(output), {recursive: true});
    await page.screenshot({path: output, fullPage: true});
  });
}