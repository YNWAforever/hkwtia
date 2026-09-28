import {expect, test} from "@playwright/test";
import {Pool} from "pg";

import {finalAuditIsolatedDatabaseUrl} from "../fixtures/audit-isolated-db";
import {missingM2IdentityEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = missingM2IdentityEnvironment();

test.describe("isolated portal membership recovery", () => {
  test.skip(missing.length > 0, `Synthetic identity acceptance needs: ${missing.join(", ")}`);

  test("a signed-in member with no current membership sees bilingual recovery and can sign out", async ({page}) => {
    const url = finalAuditIsolatedDatabaseUrl();
    if (!url) {
      test.skip(true, "Membership mutation requires the exact isolated acceptance database and opt-in");
      return;
    }

    await signInForM2(page, "member");
    const sessionResponse = await page.request.get("/api/auth/get-session");
    expect(sessionResponse.ok()).toBe(true);
    const session = await sessionResponse.json() as {user?: {id?: string}};
    expect(session.user?.id).toBeTruthy();

    const pool = new Pool({connectionString: url});
    const originalStatuses: {id: string; status: string}[] = [];
    const originalCompanyLinkIds: string[] = [];
    let profileId: string | null = null;
    try {
      const profiles = await pool.query<{id: string; role: string}>(
        "SELECT id, role FROM profiles WHERE auth_user_id = $1", [session.user!.id],
      );
      expect(profiles.rows).toHaveLength(1);
      expect(profiles.rows[0]?.role).toBe("member");
      profileId = profiles.rows[0]!.id;

      // Revoke only this synthetic actor's links; the company memberships and
      // every other actor's entitlements remain intact during the browser check.
      const companyLinks = await pool.query<{id: string}>(
        "SELECT id FROM company_members WHERE user_id = $1 AND revoked_at IS NULL", [profileId],
      );
      expect(companyLinks.rows).toHaveLength(3);
      originalCompanyLinkIds.push(...companyLinks.rows.map((row) => row.id));
      const memberships = await pool.query<{id: string; status: string}>(
        "SELECT id, status FROM memberships WHERE owner_user_id = $1", [profileId],
      );
      expect(memberships.rows.length).toBeGreaterThan(0);
      originalStatuses.push(...memberships.rows);
      for (const linkId of originalCompanyLinkIds) {
        const changed = await pool.query(
          "UPDATE company_members SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
          [linkId, profileId],
        );
        expect(changed.rowCount).toBe(1);
      }
      for (const membership of originalStatuses) {
        const changed = await pool.query(
          "UPDATE memberships SET status = 'cancelled' WHERE id = $1 AND owner_user_id = $2 AND status = $3",
          [membership.id, profileId, membership.status],
        );
        expect(changed.rowCount).toBe(1);
      }

      await page.goto("/portal");
      await expect(page.getByRole("heading", {name: "This account has no current membership"})).toBeVisible();
      await expect(page.getByRole("link", {name: "View membership options"})).toHaveAttribute("href", "/membership");
      await page.screenshot({path: "test-results/portal-membership-recovery-en.png", fullPage: true});

      await page.goto("/zh/portal");
      await expect(page.getByRole("heading", {name: "此帳戶目前沒有可使用的會籍"})).toBeVisible();
      await expect(page.getByRole("link", {name: "查看會籍選項"})).toHaveAttribute("href", "/zh/membership");
      await page.screenshot({path: "test-results/portal-membership-recovery-zh.png", fullPage: true});
      await page.locator("#main-content").getByRole("button", {name: "登出"}).click();
      await expect(page).toHaveURL(/\/zh\/member-login$/);
    } finally {
      let restoreError: unknown = null;
      for (const membership of originalStatuses) {
        try {
          const restored = await pool.query(
            "UPDATE memberships SET status = $2 WHERE id = $1 AND status = 'cancelled'",
            [membership.id, membership.status],
          );
          if (restored.rowCount !== 1) throw new Error("MEMBERSHIP_RESTORE_MISMATCH");
        } catch (error) { restoreError ??= error; }
      }
      if (profileId) {
        for (const linkId of originalCompanyLinkIds) {
          try {
            const restored = await pool.query(
              "UPDATE company_members SET revoked_at = NULL WHERE id = $1 AND user_id = $2 AND revoked_at IS NOT NULL",
              [linkId, profileId],
            );
            if (restored.rowCount !== 1) throw new Error("COMPANY_LINK_RESTORE_MISMATCH");
          } catch (error) { restoreError ??= error; }
        }
      }
      await pool.end();
      if (restoreError) throw restoreError;
    }
  });
});
