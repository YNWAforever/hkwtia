import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInForM2 } from "../fixtures/m2-auth";
const run = randomUUID(),
  profile = "synthetic-support-" + run,
  root = "docs/audits/hkwtia-2026-10-01-remediation/evidence/t19/";
let pool: Pool, owners: { staff: string; superadmin: string };
const conversations: string[] = [];
async function financialFingerprint() {
  return createHash("sha256")
    .update(
      JSON.stringify(
        (
          await pool.query(
            "SELECT (SELECT jsonb_agg(m ORDER BY id) FROM memberships m) AS memberships,(SELECT jsonb_agg(b ORDER BY id) FROM billing_attempts b) AS billing,(SELECT jsonb_agg(e ORDER BY id) FROM event_orders e) AS orders",
          )
        ).rows,
      ),
    )
    .digest("hex");
}
test.use({ trace: "off", video: "off", actionTimeout: 30000 });
test.describe("actual isolated support handoff", () => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "true",
    "Confirmed isolated DB/Auth required",
  );
  test.beforeAll(async ({ browser, baseURL }) => {
    expect(new URL(baseURL!).hostname).toBe("localhost");
    expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
    expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe(
      "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
    );
    expect(process.env.NEON_PROJECT_ID).toBe("solitary-wave-52860119");
    expect(process.env.RUN_LIVE_WOZTELL).not.toBe("1");
    pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
    expect(
      Number(
        (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
          .rows[0].n,
      ),
    ).toBe(1);
    owners = { staff: "", superadmin: "" };
    for (const role of ["staff", "superadmin"] as const) {
      expect(process.env["M2_TEST_" + role.toUpperCase() + "_EMAIL"]).toMatch(
        /@.*example\.test$/,
      );
      const context = await browser.newContext(),
        page = await context.newPage();
      try {
        await signInForM2(page, role);
        const session = await page.request.get("/api/auth/get-session");
        expect(session.ok()).toBe(true);
        owners[role] = (
          await pool.query(
            "SELECT id FROM profiles WHERE auth_user_id=$1 AND role=$2",
            [(await session.json()).user.id, role],
          )
        ).rows[0].id;
      } finally {
        await context.close();
      }
    }
    await pool.query(
      "INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,'Synthetic support member','member')",
      [profile, run + "@example.test"],
    );
    mkdirSync(root, { recursive: true });
  });
  test.afterAll(async () => {
    if (!pool) return;
    for (const id of conversations) {
      await pool.query(
        "DELETE FROM audit_events WHERE target_type='conversation' AND target_id=$1",
        [id],
      );
      await pool.query("DELETE FROM staff_tasks WHERE dedupe_key=$1", [
        "support-followup:" + id,
      ]);
      await pool.query("DELETE FROM conversations WHERE id=$1", [id]);
    }
    await pool.query("DELETE FROM profiles WHERE id=$1", [profile]);
    await pool.end();
  });
  for (const locale of ["en", "zh"] as const)
    test(`${locale} stale handoff, keyboard, owner scope and truthful delivery`, async ({
      browser,
    }, testInfo) => {
      test.setTimeout(150000);
      const prefix = locale === "zh" ? "/zh" : "",
        bundle = JSON.parse(
          readFileSync(
            "messages/" + (locale === "zh" ? "zh-HK" : "en") + ".json",
            "utf8",
          ),
        ).Admin.inbox,
        labels = bundle.followUp,
        id = randomUUID();
      conversations.push(id);
      await pool.query(
        "INSERT INTO conversations(id,profile_id,channel,handling,expires_at,last_inbound_at,last_message_at) VALUES($1,$2,'whatsapp','human',now()+interval '1 day',now(),now())",
        [id, profile],
      );
      for (const [index, status, error] of [
        [0, "queued", null],
        [1, "sent", null],
        [2, "delivered", null],
        [3, "failed", "retryable_network"],
      ] as const)
        await pool.query(
          "INSERT INTO messages(conversation_id,role,channel,direction,content,delivery_status,error_code,metadata,citations) VALUES($1,'staff','whatsapp','outbound',$2,$3,$4,'{}','[]')",
          [id, "Synthetic stored delivery " + index, status, error],
        );
      const before = await financialFingerprint(),
        contexts = await Promise.all([
          browser.newContext(),
          browser.newContext(),
        ]),
        a = await contexts[0].newPage(),
        b = await contexts[1].newPage(),
        scans = [];
      try {
        await signInForM2(a, "staff");
        await signInForM2(b, "superadmin");
        await Promise.all([
          a.goto(prefix + "/admin/inbox/" + id),
          b.goto(prefix + "/admin/inbox/" + id),
        ]);
        await a.screenshot({path:root+locale+"-initial-debug.png",fullPage:true});
        console.log(JSON.stringify({stage:"initial",locale,path:new URL(a.url()).pathname,followUpHeadings:await a.getByRole("heading",{name:labels.title}).count(),formCount:await a.locator("form").count(),ownerInputs:await a.getByLabel(labels.owner,{exact:true}).count()}));
        const form = a
          .locator("form")
          .filter({ has: a.getByRole("heading", { name: labels.title }) });
        await form
          .getByLabel(labels.owner, { exact: true })
          .selectOption(owners.staff);
        await form
          .getByLabel(labels.due, { exact: true })
          .fill("2026-09-01T12:00");
        await form
          .getByLabel(labels.next, { exact: true })
          .selectOption("await_member");
        await form
          .getByLabel(labels.note, { exact: true })
          .fill("Synthetic first administrator next step");
        await form
          .getByRole("button", { name: labels.save, exact: true })
          .focus();
        await a.keyboard.press("Enter");
        await expect(
          a.getByRole("status").filter({ hasText: labels.saved }),
        ).toBeVisible();
        const stale = b
          .locator("form")
          .filter({ has: b.getByRole("heading", { name: labels.title }) });
        await stale
          .getByLabel(labels.owner, { exact: true })
          .selectOption(owners.superadmin);
        await stale
          .getByLabel(labels.note, { exact: true })
          .fill("Synthetic retained stale handoff");
        await stale
          .getByRole("button", { name: labels.save, exact: true })
          .click();
        await expect(b.getByRole("alert")).toContainText(labels.conflict);
        await expect(
          stale.getByLabel(labels.note, { exact: true }),
        ).toHaveValue("Synthetic retained stale handoff");
        await stale
          .getByRole("button", { name: labels.reload, exact: true })
          .click();
        await expect(
          b.getByRole("heading", { name: labels.title }),
        ).toBeVisible();
        await stale
          .getByLabel(labels.owner, { exact: true })
          .selectOption(owners.superadmin);
        await stale
          .getByLabel(labels.note, { exact: true })
          .fill("Synthetic audited handoff to second administrator");
        await stale
          .getByLabel(labels.next, { exact: true })
          .selectOption("handoff");
        await stale
          .getByRole("button", { name: labels.save, exact: true })
          .click();
        await expect(
          b.getByRole("status").filter({ hasText: labels.saved }),
        ).toBeVisible();
        await a.goto(
          prefix + "/admin/inbox?scope=mine&channel=whatsapp&handling=human",
        );
        await expect(
          a
            .locator("tr")
            .filter({
              has: a.locator(`a[href="${prefix}/admin/inbox/${id}"]`),
            }),
        ).toHaveCount(0);
        await b.goto(
          prefix + "/admin/inbox?scope=mine&channel=whatsapp&handling=human",
        );
        await expect(
          b
            .locator("tr")
            .filter({
              has: b.locator(`a[href="${prefix}/admin/inbox/${id}"]`),
            }),
        ).toHaveCount(1);
        await b.goto(prefix + "/admin/inbox/" + id);
        for (const width of [1440, 390]) {
          await b.setViewportSize({ width, height: 950 });
          await expect(b.locator("body")).toHaveJSProperty(
            "scrollWidth",
            await b.locator("body").evaluate((el) => el.clientWidth),
          );
          await expect(
            b.getByText(bundle.delivery.uncertain, { exact: false }),
          ).toBeVisible();
          const scan = await new AxeBuilder({ page: b }).analyze();
          expect(scan.violations).toEqual([]);
          scans.push({
            width,
            violations: scan.violations.length,
            incomplete: scan.incomplete.map((rule) => rule.id),
          });
          await b.screenshot({
            path: root + locale + "-support-" + width + ".png",
            fullPage: true,
          });
        }
        const close = b
          .locator("form")
          .filter({ has: b.getByRole("heading", { name: labels.title }) });
        await close
          .getByLabel(labels.handling, { exact: true })
          .selectOption("closed");
        await close
          .getByLabel(labels.closeReason, { exact: true })
          .selectOption("escalated");
        await close
          .getByLabel(labels.note, { exact: true })
          .fill("Synthetic escalated close reason and next owner recorded");
        await close
          .getByRole("button", { name: labels.save, exact: true })
          .click();
        await expect(
          b.getByRole("status").filter({ hasText: labels.saved }),
        ).toBeVisible();
        expect(
          (
            await pool.query(
              "SELECT handling,assigned_to_profile_id FROM conversations WHERE id=$1",
              [id],
            )
          ).rows,
        ).toEqual([
          { handling: "closed", assigned_to_profile_id: owners.superadmin },
        ]);
        expect(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='conversation.support.followup.updated'",
              [id],
            )
          ).rows[0].n,
        ).toBe(3);
        expect(await financialFingerprint()).toBe(before);
        writeFileSync(
          root + locale + "-browser.json",
          JSON.stringify(
            {
              source: process.env.AUDIT_SOURCE_SHA ?? "uncommitted",
              environment:
                "confirmed isolated Neon/Auth and owned built loopback",
              roles: ["staff", "superadmin"],
              locale,
              checks: {
                staleDraftRetained: true,
                ownerScopes: true,
                closedReasonAudits: 3,
                financialRowsUnchanged: true,
                providerSends: 0,
              },
              storedStatusFixtureOnly: true,
              actualProviderAcceptance:
                "blocked: approved WhatsApp test recipient/provider receipt required",
              scans,
              command: testInfo.title,
            },
            null,
            2,
          ) + "\n",
        );
      } finally {
        await Promise.all(contexts.map((context) => context.close()));
      }
    });
});
