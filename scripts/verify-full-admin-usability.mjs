import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
} from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { chromium } from "playwright";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "./lib/acceptance-guard.ts";
const origin = "http://localhost:3450",
  evidence = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t15/";
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
assert.equal(process.env.NEON_PROJECT_ID, "solitary-wave-52860119");
assert.equal(
  new URL(process.env.NEON_AUTH_BASE_URL).hostname,
  "ep-plain-mouse-azm8pl2j.neonauth.c-3.ap-southeast-1.aws.neon.tech",
);
assert.equal(process.env.EMAIL_DELIVERY_MODE, "test");
assert.equal(process.env.RUN_LIVE_WOZTELL, "0");
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const proof = JSON.parse(
  readFileSync(".playwright/full-fix-t15-build-proof.json", "utf8"),
);
// Reuse a built artifact across documentation/test-only commits only when
// every runtime directory and dependency/config file is Git-identical.
if (proof.sourceSha !== sourceSha)
  execFileSync("git", [
    "diff",
    "--exit-code",
    proof.sourceSha,
    sourceSha,
    "--",
    "app",
    "components",
    "lib",
    "messages",
    "public",
    "i18n",
    "config",
    "package.json",
    "package-lock.json",
    "next.config.ts",
  ]);
assert.equal(proof.buildExit, 0);
assert.equal(readFileSync(".next/BUILD_ID", "utf8").trim(), proof.buildId);
for (const [path, hash] of Object.entries(proof.appFiles))
  assert.equal(
    createHash("sha256").update(readFileSync(path)).digest("hex"),
    hash,
  );
const pool = new Pool({ connectionString: db, query_timeout: 15000 });
const id = randomUUID(),
  slug = "t15-runtime-" + id,
  marker = "Synthetic Reply Review Runtime " + id;
let lighthouseBrowser,
  server,
  logFd,
  inserted = false,
  stage = "isolation";
try {
  await assertSeedSentinel("FULL_REMEDIATION", async () =>
    Number(
      (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
        .rows[0].n,
    ),
  );
  const ledger = Number(
    (await pool.query("SELECT count(*) AS n FROM drizzle.__drizzle_migrations"))
      .rows[0].n,
  );
  assert.equal(ledger, 61);
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM profiles WHERE email IS NOT NULL AND email NOT LIKE '%example.test'",
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
  const runtimeEnv = {
    ...process.env,
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    APP_URL: origin,
    // Match HTML canonical with next-intl middleware alternate-link origin.
    NEXT_PUBLIC_SITE_URL: origin,
    AGENTS_ENABLED: "false",
    ADMIN_AI_ENABLED: "false",
    ADMIN_AI_DRAFTS_ENABLED: "true",
    ADMIN_AI_RETENTION_DRAFTS_ENABLED: "false",
    ADMIN_AI_BOARD_DRAFTS_ENABLED: "false",
    ADMIN_AI_CONTENT_DRAFTS_ENABLED: "true",
    ADMIN_AI_CONTENT_PROVIDER_APPROVED: "false",
    INBOX_DRAFT_PROTECTION_ENABLED: "true",
    INBOX_DRAFT_RETENTION_SECONDS: "3600",
    INBOX_DRAFT_ENCRYPTION_SECRET: randomBytes(32).toString("hex"),
    EMAIL_DELIVERY_MODE: "test",
    RUN_LIVE_WOZTELL: "0",
    WORKER_PAUSED_TEST: "true",
    TICKET_PASS_TOKEN_SECRET: randomBytes(32).toString("hex"),
    CONCIERGE_COOKIE_SECRET: randomBytes(32).toString("hex"),
    CRON_SECRET: randomBytes(32).toString("hex"),
    UNSUBSCRIBE_TOKEN_SECRET: randomBytes(32).toString("hex"),
  };
  // No live provider credentials are needed for this explicit test sink.
  for (const key of [
    "RESEND_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENCODE_API_KEY",
    "WOZTELL_API_TOKEN",
    "WOZTELL_CHANNEL_ID",
  ])
    runtimeEnv[key] = "";
  logFd = openSync(".playwright/full-fix-t15-server-private.log", "w", 0o600);
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "localhost",
      "-p",
      "3450",
    ],
    { env: runtimeEnv, stdio: ["ignore", logFd, logFd], windowsHide: true },
  );
  stage = "positive-runtime-db-proof";
  let positive = false;
  for (let n = 0; n < 90; n++) {
    if (server.exitCode !== null) throw Error("OWNED_SERVER_EXITED");
    try {
      const r = await fetch(origin + "/news/" + slug, {
        signal: AbortSignal.timeout(3000),
      });
      if (r.status === 200 && (await r.text()).includes(marker)) {
        positive = true;
        break;
      }
    } catch {}
    await delay(1000);
  }
  assert.equal(positive, true);
  mkdirSync(evidence, { recursive: true });
  writeFileSync(
    ".playwright/full-fix-t15-local-runtime-safe.json",
    JSON.stringify(
      {
        sourceSha,
        buildId: proof.buildId,
        buildSourceSha: proof.sourceSha,
        origin,
        ledger,
        observedAt: new Date().toISOString(),
        dbSourcePositivelyProven: true,
        markerRef: createHash("sha256").update(marker).digest("hex"),
        production: false,
        transport: "explicit test sink",
      },
      null,
      2,
    ),
  );
  stage = "native";
  const env = {
    ...runtimeEnv,
    NODE_ENV: "test",
    PLAYWRIGHT_BASE_URL: origin,
    PLAYWRIGHT_PORT: "3450",
    AUDIT_ISOLATED_ACCEPTANCE: "1",
    FULL_FIX_EXPECTED_SOURCE_SHA: sourceSha,
    ...(process.argv.includes("--concierge-recovery") ||
    process.argv.includes("--final-t15")
      ? { CONCIERGE_FAILURE_ACCEPTANCE: "disabled" }
      : {}),
  };
  delete env.PLAYWRIGHT_STORAGE_STATE;
  const lighthouse = process.argv.includes("--lighthouse");
  if (lighthouse) {
    assert(
      !process.env.LHCI_COOKIE_FILE,
      "LOCAL_LIGHTHOUSE_MUST_NOT_USE_AUTH_COOKIES",
    );
    const repositoryConfig = (await import("../lighthouserc.js")).default;
    assert(!repositoryConfig.ci.collect.settings.extraHeaders);
    // LHCI treats .mjs as JSON. Serialize the installed repository config for
    // this owned server, retaining route order, run count and every threshold.
    const allocation = createServer();
    await new Promise((resolve, reject) => {
      allocation.once("error", reject);
      allocation.listen(0, "127.0.0.1", resolve);
    });
    const port = allocation.address().port;
    await new Promise((resolve, reject) =>
      allocation.close((error) => (error ? reject(error) : resolve())),
    );
    // Attach LHCI to this newly owned browser. Its launcher otherwise races
    // Windows temporary-directory cleanup after killing its Chrome children.
    lighthouseBrowser = await chromium.launch({
      args: [
        ...repositoryConfig.ci.collect.settings.chromeFlags.split(" "),
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=" + port,
      ],
    });
    assert((await fetch("http://127.0.0.1:" + port + "/json/version")).ok);
    const configuration = {
      ci: {
        ...repositoryConfig.ci,
        collect: {
          ...repositoryConfig.ci.collect,
          settings: {
            ...repositoryConfig.ci.collect.settings,
            port,
            extraHeaders: { "Accept-Language": "en" },
          },
          url: repositoryConfig.ci.collect.url.map(
            (url) => origin + new URL(url).pathname,
          ),
          startServerCommand: undefined,
        },
        upload: {
          target: "filesystem",
          outputDir: ".playwright/full-fix-t15-lighthouse",
        },
      },
    };
    writeFileSync(
      ".playwright/full-fix-t15-lighthouse-config.json",
      JSON.stringify(configuration, null, 2),
    );
  }
  const native = lighthouse
    ? spawn(
        "npm.cmd",
        [
          "run",
          "test:lighthouse",
          "--",
          "--config=.playwright/full-fix-t15-lighthouse-config.json",
        ],
        {
          env: {
            ...env,
            LHCI_BASE_URL: origin,
            CHROME_PATH: chromium.executablePath(),
          },
          stdio: "inherit",
          windowsHide: true,
          shell: true,
        },
      )
    : spawn(
        process.execPath,
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          ...(process.argv.includes("--final-t15")
            ? [
                "tests/e2e/ai-admin-usability.spec.ts",
                "tests/e2e/concierge-lazy-loading.spec.ts",
                "tests/e2e/concierge-readiness.spec.ts",
                "tests/e2e/public-read-model-streaming.spec.ts",
              ]
            : [
                process.argv.includes("--public-bundle")
                  ? "tests/e2e/concierge-lazy-loading.spec.ts"
                  : process.argv.includes("--concierge-recovery")
                    ? "tests/e2e/concierge-readiness.spec.ts"
                    : "tests/e2e/ai-admin-usability.spec.ts",
              ]),
          "--project=chromium",
          ...process.argv
            .slice(2)
            .filter(
              (arg) =>
                ![
                  "--public-bundle",
                  "--concierge-recovery",
                  "--final-t15",
                ].includes(arg),
            ),
        ],
        { env, stdio: "inherit", windowsHide: true },
      );
  const exit = await new Promise((resolve) =>
    native.once("exit", (code) => resolve(code ?? 1)),
  );
  const result = {
    sourceSha,
    buildId: proof.buildId,
    buildSourceSha: proof.sourceSha,
    observedAt: new Date().toISOString(),
    nativeExit: exit,
    ledger,
    dbSourcePositivelyProven: true,
    googleVerified: false,
    magicLinkVerified: false,
    realProviderSends: 0,
    realDeliveryReceipt: false,
    production: false,
  };
  writeFileSync(
    lighthouse
      ? ".playwright/full-fix-t15-lighthouse-safe.json"
      : ".playwright/full-fix-t15-native-safe.json",
    JSON.stringify(result, null, 2),
  );
  assert.equal(exit, 0);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(
    JSON.stringify({
      error: "USABILITY_ACCEPTANCE_GATE_FAILED",
      stage,
      sqlState: /^[0-9A-Z]{5}$/.test(error.code ?? "") ? error.code : null,
      production: false,
    }),
  );
  process.exitCode = 1;
} finally {
  await lighthouseBrowser?.close();
  if (server?.pid) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } catch {}
    } else server.kill("SIGTERM");
  }
  if (logFd !== undefined) closeSync(logFd);
  if (inserted)
    await pool.query(
      "UPDATE posts SET archived_at=now(),updated_at=now() WHERE id=$1 AND slug=$2 AND source_key=$2",
      [id, slug],
    );
  await pool.end();
}
