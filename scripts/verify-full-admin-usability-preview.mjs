import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { chromium } from "playwright";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "./lib/acceptance-guard.ts";
const deployed = JSON.parse(
  readFileSync(".playwright/full-fix-t15-preview-deployment-safe.json", "utf8"),
);
const origin = "https://hkwtia-usability-20261003.vercel.app";
assert.equal(deployed.origin, origin);
assert.equal(deployed.state, "READY");
assert.equal(deployed.production, false);
assert.notEqual(deployed.target, "production");
const db = assertIsolatedSeedEnvironment(process.env, {
  prefix: "FULL_REMEDIATION",
  flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
  hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
});
assert.equal(db, process.env.DATABASE_URL_TEST);
assert.equal(
  new URL(db).hostname,
  "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
);
assert.equal(
  new URL(process.env.NEON_AUTH_BASE_URL).hostname,
  "ep-plain-mouse-azm8pl2j.neonauth.c-3.ap-southeast-1.aws.neon.tech",
);
const pool = new Pool({ connectionString: db, query_timeout: 15000 });
let browser,
  page,
  status = null,
  inserted = false,
  stage = "isolation";
const id = randomUUID(),
  slug = "t15-preview-runtime-" + id,
  marker = "Synthetic Usability Runtime " + id;
try {
  await assertSeedSentinel("FULL_REMEDIATION", async () =>
    Number(
      (await pool.query("SELECT count(*) n FROM acceptance_sentinel")).rows[0]
        .n,
    ),
  );
  const ledger = Number(
    (await pool.query("SELECT count(*) n FROM drizzle.__drizzle_migrations"))
      .rows[0].n,
  );
  assert.equal(ledger, 61);
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) n FROM profiles WHERE email IS NOT NULL AND email NOT LIKE '%example.test'",
        )
      ).rows[0].n,
    ),
    0,
  );
  await pool.query(
    "INSERT INTO posts(id,slug,kind,title_en,title_zh,body_mdx,body_mdx_zh_hk,published_at,author,source_key) VALUES($1,$2,'news',$3,$3,$3,$3,now(),'Synthetic acceptance',$2)",
    [id, slug, marker],
  );
  inserted = true;
  browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: ".playwright/full-fix-t15-preview-protection-state.json",
  });
  page = await context.newPage();
  stage = "positive-preview-runtime";
  const response = await page.goto(origin + "/news/" + slug, {
    waitUntil: "domcontentloaded",
  });
  status = response.status();
  assert.equal(status, 200);
  await page
    .getByRole("heading", { level: 1 })
    .filter({ hasText: marker })
    .waitFor({ timeout: 20000 });
  const checks = [
    {
      routeKind: "new unique synthetic news",
      status: 200,
      markerSha256: createHash("sha256").update(marker).digest("hex"),
      dbSourcePositivelyProven: true,
    },
  ];
  for (const route of [
    "/",
    "/zh",
    "/membership",
    "/zh/membership",
    "/events",
    "/zh/events",
    "/partners",
    "/zh/partners",
  ]) {
    stage = "public-smoke";
    const r = await page.goto(origin + route, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(r.status(), 200);
    assert.equal(await page.locator("main#main-content").count(), 1);
    checks.push({ route, status: r.status() });
  }
  stage = "anonymous-admin";
  await page.goto(origin + "/admin");
  assert(/\/(?:zh\/)?admin-login$/.test(new URL(page.url()).pathname));
  checks.push({ anonymousRequiresLogin: true });
  writeFileSync(
    ".playwright/full-fix-t15-preview-runtime-safe.json",
    JSON.stringify(
      {
        sourceSha: deployed.sourceSha,
        deploymentId: deployed.id,
        origin,
        ledger,
        dbSourcePositivelyProven: true,
        production: false,
        providerSends: 0,
        externalModelCalls: 0,
        checks,
        observedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await browser.close();
  browser = undefined;
  stage = "native-preview";
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PLAYWRIGHT_BASE_URL: origin,
    PLAYWRIGHT_STORAGE_STATE:
      ".playwright/full-fix-t15-preview-protection-state.json",
    AUDIT_ISOLATED_ACCEPTANCE: "1",
    FULL_FIX_EXPECTED_SOURCE_SHA: deployed.sourceSha,
  };
  for (const name of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENCODE_API_KEY",
    "RESEND_API_KEY",
    "WOZTELL_API_TOKEN",
  ])
    env[name] = "";
  const child = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "tests/e2e/ai-admin-usability.spec.ts",
      "--project=chromium",
    ],
    { env, windowsHide: true, stdio: "inherit" },
  );
  const exit = await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(exit, 0);
  console.log(
    JSON.stringify({
      sourceSha: deployed.sourceSha,
      origin,
      positiveDb: true,
      ledger,
      smokeChecks: checks.length,
      nativeExit: exit,
      production: false,
    }),
  );
} catch (error) {
  const safe = {
    stage,
    status,
    pathname: page ? new URL(page.url()).pathname : null,
    pageClosed: page?.isClosed() ?? null,
    production: false,
    errorName: error.name,
    sqlState: /^[0-9A-Z]{5}$/.test(error.code ?? "") ? error.code : null,
  };
  writeFileSync(
    ".playwright/full-fix-t15-preview-error-safe.json",
    JSON.stringify(safe, null, 2),
  );
  console.error(
    JSON.stringify({ gate: "T15_PREVIEW_ACCEPTANCE_FAILED", ...safe }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (inserted)
    await pool.query(
      "UPDATE posts SET archived_at=now(),updated_at=now() WHERE id=$1 AND slug=$2 AND source_key=$2",
      [id, slug],
    );
  await pool.end();
}
