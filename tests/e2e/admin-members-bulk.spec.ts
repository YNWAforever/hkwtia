import {randomUUID} from "node:crypto";

import {expect, test} from "@playwright/test";
import {Pool} from "pg";

import {finalAuditIsolatedDatabaseUrl} from "../fixtures/audit-isolated-db";
import {missingM2IdentityEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = missingM2IdentityEnvironment();
test.describe("isolated member batch recovery", () => {
  test.skip(missing.length > 0, `Synthetic identity acceptance needs: ${missing.join(", ")}`);
  test("staff can find, reopen and safely interpret synthetic batch jobs", async ({page}) => {
    const url = finalAuditIsolatedDatabaseUrl();
    if (!url) {test.skip(true, "Batch fixture requires the exact isolated acceptance database and opt-in"); return;}
    await signInForM2(page, "staff");
    const sessionResponse = await page.request.get("/api/auth/get-session");
    expect(sessionResponse.ok()).toBe(true);
    const session = await sessionResponse.json() as {user?: {id?: string}};
    expect(session.user?.id).toBeTruthy();
    const pool = new Pool({connectionString: url});
    const readyId = randomUUID();
    const failedId = randomUUID();
    try {
      const identity = await pool.query<{id: string}>("SELECT id FROM profiles WHERE auth_user_id = $1 AND role = 'staff'", [session.user!.id]);
      expect(identity.rows).toHaveLength(1);
      const actorId = identity.rows[0]!.id;
      for (const [id, state, counters] of [[readyId, "ready", {pending: 2}], [failedId, "completed_with_errors", {failed: 1}]] as const) {
        await pool.query(`INSERT INTO admin_batches (id, actor_profile_id, operation, validated_payload, selection_snapshot, idempotency_key, request_digest, state, preview_digest, preview_expires_at, counters)
          VALUES ($1, $2, 'profile_patch', '{}'::jsonb, '{}'::jsonb, $3, 'synthetic-browser', $4, $5, now() + interval '1 hour', $6::jsonb)`, [id, actorId, randomUUID(), state, "a".repeat(64), JSON.stringify(counters)]);
      }
      for (let i = 0; i < 2; i += 1) {
        await pool.query(`INSERT INTO admin_batch_items (batch_id, target_type, target_id, expected_version, preview_status, state, effect_key, reason_code)
          VALUES ($1, 'profile', $2, 'synthetic-version', 'blocked', 'pending', $3, 'SYNTHETIC_BLOCKED')`, [readyId, `synthetic-blocked-${i}`, randomUUID()]);
      }
      await pool.query(`INSERT INTO admin_batch_items (batch_id, target_type, target_id, expected_version, preview_status, state, attempt_count, effect_key, error_code)
        VALUES ($1, 'profile', 'synthetic-permanent', 'synthetic-version', 'eligible', 'failed', 1, $2, 'PERMANENT_VALIDATION')`, [failedId, randomUUID()]);

      await page.goto("/admin");
      await expect(page.getByRole("heading", {name: "Recent batch jobs"})).toBeVisible();
      await expect(page.locator(`a[href="/admin/batches/${readyId}"]`)).toBeVisible();
      await page.goto("/admin/members");
      const selectPage = page.getByRole("checkbox", {name: "Select this page"});
      await expect(selectPage).toBeVisible();
      await selectPage.check();
      await expect(page.getByText("Checked members only, across visited pages.")).toBeVisible();
      await page.goto("/admin/batches");
      const readyLink = page.locator(`a[href="/admin/batches/${readyId}"]`);
      const failedLink = page.locator(`a[href="/admin/batches/${failedId}"]`);
      await expect(readyLink).toBeVisible();
      await expect(failedLink).toBeVisible();
      await page.screenshot({path: "test-results/admin-batch-history.png", fullPage: true});
      await readyLink.click();
      await expect(page.getByRole("heading", {name: "Batch preview and progress"})).toBeVisible();
      await expect(page.getByRole("button", {name: "Commit batch"})).toHaveCount(0);
      await page.getByRole("link", {name: "Back to batch history"}).click();
      await failedLink.click();
      await expect(page.getByText(/This failure needs review/)).toBeVisible();
      await expect(page.getByRole("button", {name: "Retry failed items"})).toHaveCount(0);
    } finally {
      await pool.query("DELETE FROM admin_batch_items WHERE batch_id = ANY($1::uuid[])", [[readyId, failedId]]);
      await pool.query("DELETE FROM admin_batches WHERE id = ANY($1::uuid[])", [[readyId, failedId]]);
      await pool.end();
    }
  });
});
