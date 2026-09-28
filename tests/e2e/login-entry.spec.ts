import {expect, test} from "@playwright/test";

for (const locale of [
  {path: "/", login: "/member-login", label: "Member sign in"},
  {path: "/zh", login: "/zh/member-login", label: "會員登入"},
] as const) {
  for (const width of [390, 768, 1024, 1280, 1366, 1440, 1920]) {
    test(`${locale.path} login visible and keyboard reachable at ${width}px`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      await page.goto(locale.path);
      const login = page.getByRole("banner").getByRole("link", {name: locale.label, exact: true});
      await expect(login).toHaveCount(1);
      await expect(login).toHaveAttribute("href", locale.login);
      await expect(login).toBeVisible();
      await expect.poll(async () => (await login.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await login.focus();
      await expect(login).toBeFocused();
      await login.press("Enter");
      await expect(page).toHaveURL(new RegExp(`${locale.login}$`));
      await expect(page.getByRole("heading", {level: 1, name: locale.label})).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  }
}

test("anonymous admin deep link opens staff login and preserves the allowed filter", async ({page}) => {
  await page.goto("/zh/admin/members?q=Acme&status=active");
  await expect(page).toHaveURL(/\/zh\/admin-login\?next=/);
  await expect(page.getByRole("heading", {name: /staff|職員/i})).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin/members?q=Acme&status=active");
});
