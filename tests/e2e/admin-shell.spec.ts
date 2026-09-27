import AxeBuilder from "@axe-core/playwright";
import {expect, test} from "@playwright/test";
import {Pool} from "pg";
import {missingM2IdentityEnvironment, signInForM2} from "../fixtures/m2-auth";
import {finalAuditIsolatedDatabaseUrl} from "../fixtures/audit-isolated-db";

const missing = missingM2IdentityEnvironment();
test.describe("isolated admin workspace shell", () => {
  test.skip(missing.length > 0, `Synthetic identity acceptance needs: ${missing.join(", ")}`);

  test("staff can navigate all original destinations, use the mobile drawer and sign out", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/admin");
    const sidebar = page.getByTestId("admin-desktop-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("navigation").getByRole("link")).toHaveCount(23);
    await expect(sidebar.getByRole("link", {name: /Dashboard/})).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", {name: /Find a member/})).toHaveAttribute("href", "/admin/members");
    await page.getByRole("button", {name: /Collapse sidebar/}).click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await page.getByRole("button", {name: /Expand sidebar/}).click();
    await page.screenshot({path: "test-results/admin-shell-desktop.png", fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    await page.getByRole("button", {name: /Open workspace menu/}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.screenshot({path: "test-results/admin-shell-mobile.png", fullPage: true});
    const accessibility = await new AxeBuilder({page}).analyze();
    expect(accessibility.violations.filter(item => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
    await page.locator("summary").filter({hasText: /Staff/}).click();
    await page.getByRole("button", {name: "Sign out"}).click();
    await expect(page).toHaveURL(/\/admin-login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin-login/);
  });

  test("member detail keeps the Members destination current", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/admin/members");
    await expect(page.getByTestId("admin-desktop-sidebar").getByRole("link", {name: /Members/})).toHaveAttribute("aria-current", "page");
  });

  test("zh-HK superadmin keeps locale and authorized navigation", async ({page}) => {
    await signInForM2(page, "superadmin");
    await page.goto("/zh/admin");
    const sidebar = page.getByTestId("admin-desktop-sidebar");
    await expect(sidebar.getByRole("navigation").getByRole("link")).toHaveCount(23);
    await expect(sidebar.getByRole("link", {name: "控制台"})).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("超級管理員")).toBeVisible();
    await sidebar.getByRole("link", {name: "會員", exact: true}).click();
    await expect(page).toHaveURL(/\/zh\/admin\/members$/);
    await expect(sidebar.getByRole("link", {name: "會員", exact: true})).toHaveAttribute("aria-current", "page");
  });

  test("removing a synthetic staff role denies the next server request", async ({page}) => {
    const url = finalAuditIsolatedDatabaseUrl();
    if (!url) {test.skip(true, "Role mutation requires the exact isolated acceptance database and opt-in"); return;}
    await signInForM2(page, "staff");
    await page.goto("/admin");
    await expect(page.getByTestId("admin-desktop-sidebar")).toBeVisible();
    const pool = new Pool({connectionString: url});
    const sessionResponse = await page.request.get("/api/auth/get-session");
    expect(sessionResponse.ok()).toBe(true);
    const session = await sessionResponse.json() as {user?: {id?: string}};
    expect(session.user?.id).toBeTruthy();
    let changedProfileId: string | null = null;
    try {
      const before = await pool.query<{id: string; role: string}>("SELECT id, role FROM profiles WHERE auth_user_id = $1", [session.user!.id]);
      expect(before.rows).toHaveLength(1);
      expect(before.rows[0]?.role).toBe("staff");
      const profileId = before.rows[0]!.id;
      const changed = await pool.query("UPDATE profiles SET role = 'member' WHERE id = $1 AND role = 'staff'", [profileId]);
      expect(changed.rowCount).toBe(1);
      changedProfileId = profileId;
      await page.goto("/admin/members");
      await expect(page).toHaveURL(/\/admin-login/);
      await expect(page.getByTestId("admin-desktop-sidebar")).toHaveCount(0);
    } finally {
      if (changedProfileId) await pool.query("UPDATE profiles SET role = 'staff' WHERE id = $1 AND role = 'member'", [changedProfileId]);
      await pool.end();
    }
  });

  test("member identity sees denial and no workspace links", async ({page}) => {
    await signInForM2(page, "member");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin-login/);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByTestId("admin-desktop-sidebar")).toHaveCount(0);
  });
});
