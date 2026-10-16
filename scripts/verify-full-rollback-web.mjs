import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
  openSync,
  closeSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { resolve, join, sep } from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Pool } from "pg";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "./lib/acceptance-guard.ts";
const source = "36ebae1dac68a7e0e420870cf0df68fa166b7874",
  origin = "http://localhost:3450";
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
const lock = execFileSync("git", ["show", source + ":package-lock.json"]);
assert.equal(
  JSON.stringify(JSON.parse(lock)),
  JSON.stringify(JSON.parse(readFileSync("package-lock.json", "utf8"))),
);
const pool = new Pool({ connectionString: db, query_timeout: 15000 });
const root = resolve(".tmp");
let directory = join(root, "rollback-web-36ebae1-" + randomUUID());
const id = randomUUID(),
  slug = "t16-old-web-" + id,
  marker = "Synthetic Historical Web Runtime " + id;
let server,
  logFd,
  inserted = false,
  stage = "isolation";
const evidence = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t16";
try {
  await assertSeedSentinel("FULL_REMEDIATION", async () =>
    Number(
      (await pool.query("SELECT count(*) n FROM acceptance_sentinel")).rows[0]
        .n,
    ),
  );
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) n FROM drizzle.__drizzle_migrations"))
        .rows[0].n,
    ),
    61,
  );
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
  stage = "exact-historical-source";
  const archive = execFileSync(
    "git",
    [
      "archive",
      "--format=zip",
      source,
      "--",
      ".",
      ...["docs", "tests"].flatMap((dir) =>
        ["png", "jpg", "jpeg", "webp", "gif", "pdf", "zip", "mp4"].map(
          (ext) => `:(exclude)${dir}/**/*.${ext}`,
        ),
      ),
    ],
    {
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  const zip = await JSZip.loadAsync(archive);
  assert(directory.startsWith(root + sep));
  let reusedBuild = false;
  if (process.argv.includes("--reuse-build")) {
    const prior = JSON.parse(
      readFileSync(".playwright/full-fix-t16-historical-runtime.json", "utf8"),
    );
    assert.equal(prior.appSha, source);
    assert.equal(prior.buildExit, 0);
    assert.equal(
      prior.archiveSha256,
      createHash("sha256").update(archive).digest("hex"),
    );
    const candidates = readdirSync(root)
      .filter((name) => name.startsWith("rollback-web-36ebae1-"))
      .map((name) => join(root, name))
      .filter(
        (dir) =>
          existsSync(join(dir, ".next/BUILD_ID")) &&
          readFileSync(join(dir, ".next/BUILD_ID"), "utf8").trim() ===
            prior.buildId,
      );
    assert.equal(candidates.length, 1, "EXACT_OWNED_BUILD_NOT_FOUND");
    directory = candidates[0];
    assert(directory.startsWith(root + sep));
    for (const entry of Object.values(zip.files))
      if (
        !entry.dir &&
        /^(app|components|lib|messages|public|i18n|config)\//.test(entry.name)
      ) {
        assert.deepEqual(
          readFileSync(join(directory, entry.name)),
          await entry.async("nodebuffer"),
          "HISTORICAL_RUNTIME_BYTES_CHANGED",
        );
      }
    for (const file of [
      "package.json",
      "package-lock.json",
      "next.config.ts",
      "tsconfig.json",
    ])
      assert.deepEqual(
        readFileSync(join(directory, file)),
        await zip.files[file].async("nodebuffer"),
      );
    reusedBuild = true;
  }
  if (!reusedBuild) {
    mkdirSync(directory, { recursive: true });
    for (const entry of Object.values(zip.files)) {
      const target = resolve(directory, entry.name);
      assert(
        target === directory || target.startsWith(directory + sep),
        "ARCHIVE_PATH_INVALID",
      );
      assert(
        !/^(\.env|\.env\.local)$/.test(entry.name),
        "ARCHIVE_SECRET_FILE_FORBIDDEN",
      );
      if (entry.dir) mkdirSync(target, { recursive: true });
      else {
        assert(
          !entry.unixPermissions ||
            (Number(entry.unixPermissions) & 0xf000) !== 0xa000,
          "ARCHIVE_SYMLINK_FORBIDDEN",
        );
        mkdirSync(resolve(target, ".."), { recursive: true });
        writeFileSync(target, await entry.async("nodebuffer"));
      }
    }
    symlinkSync(
      realpathSync("node_modules"),
      join(directory, "node_modules"),
      "junction",
    );
  }
  const env = {
    ...process.env,
    APP_URL: origin,
    NEXT_PUBLIC_SITE_URL: origin,
    VERCEL_ENV: "preview",
    NODE_ENV: "production",
    AGENTS_ENABLED: "false",
    ADMIN_AI_ENABLED: "false",
    ADMIN_BATCH_ENABLED: "false",
    EMAIL_DELIVERY_MODE: "test",
    RUN_LIVE_WOZTELL: "0",
    CMS_SERVER_DRAFTS_ENABLED: "true",
    CONCIERGE_COOKIE_SECRET: randomBytes(32).toString("hex"),
    CRON_SECRET: randomBytes(32).toString("hex"),
    UNSUBSCRIBE_TOKEN_SECRET: randomBytes(32).toString("hex"),
  };
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENCODE_API_KEY",
    "RESEND_API_KEY",
    "WOZTELL_API_TOKEN",
    "WOZTELL_CHANNEL_ID",
  ])
    env[key] = "";
  stage = "historical-build";
  if (!reusedBuild) {
    const buildLog = openSync(
      ".playwright/full-fix-t16-historical-build.log",
      "w",
      0o600,
    );
    const build = spawnSync(
      process.execPath,
      [resolve("node_modules/next/dist/bin/next"), "build", "--webpack"],
      {
        cwd: directory,
        env,
        stdio: ["ignore", buildLog, buildLog],
        windowsHide: true,
      },
    );
    closeSync(buildLog);
    assert.equal(build.status, 0, "HISTORICAL_BUILD_FAILED");
  }
  await pool.query(
    "INSERT INTO posts(id,slug,kind,title_en,title_zh,body_mdx,body_mdx_zh_hk,published_at,author,source_key) VALUES($1,$2,'news',$3,$3,$3,$3,now(),'Synthetic acceptance',$2)",
    [id, slug, marker],
  );
  inserted = true;
  logFd = openSync(
    ".playwright/full-fix-t16-historical-server.log",
    "w",
    0o600,
  );
  server = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "localhost",
      "-p",
      "3450",
    ],
    { cwd: directory, env, stdio: ["ignore", logFd, logFd], windowsHide: true },
  );
  stage = "historical-positive-runtime";
  let positive = false;
  for (let n = 0; n < 90; n++) {
    if (server.exitCode !== null) throw Error("OWNED_HISTORICAL_SERVER_EXITED");
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
  assert(positive, "HISTORICAL_RUNTIME_BINDING_NOT_PROVEN");
  const proof = {
    appSha: source,
    harnessSha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    origin,
    buildId: readFileSync(join(directory, ".next/BUILD_ID"), "utf8").trim(),
    buildExit: 0,
    reusedExactVerifiedBuild: reusedBuild,
    archiveSha256: createHash("sha256").update(archive).digest("hex"),
    packageLockUnchanged: true,
    ledger: 61,
    positiveRuntimeDb: true,
    production: false,
    providerEffects: 0,
    externalModelCalls: 0,
    observedAt: new Date().toISOString(),
  };
  mkdirSync(evidence, { recursive: true });
  writeFileSync(
    ".playwright/full-fix-t16-historical-runtime.json",
    JSON.stringify(proof, null, 2),
  );
  stage = "historical-native";
  const child = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "tests/e2e/rollback-web-compatibility.spec.ts",
      "--project=chromium",
    ],
    {
      env: {
        ...env,
        NODE_ENV: "test",
        PLAYWRIGHT_BASE_URL: origin,
        PLAYWRIGHT_PORT: "3450",
        AUDIT_ISOLATED_ACCEPTANCE: "1",
        FULL_FIX_ROLLBACK_ACCEPTANCE: "1",
        PLAYWRIGHT_STORAGE_STATE: "",
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  const exit = await new Promise((resolve) => child.once("exit", resolve));
  writeFileSync(
    evidence + "/historical-web-runtime.json",
    JSON.stringify({ ...proof, nativeExit: exit }, null, 2),
  );
  assert.equal(exit, 0);
  console.log(JSON.stringify({ ...proof, nativeExit: exit }));
} catch (error) {
  console.error(
    JSON.stringify({
      error: "HISTORICAL_WEB_ACCEPTANCE_FAILED",
      stage,
      code:
        error instanceof Error && /^[A-Z_]+$/.test(String(error.code ?? ""))
          ? error.code
          : undefined,
      production: false,
    }),
  );
  process.exitCode = 1;
} finally {
  if (server?.pid)
    try {
      execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {}
  if (logFd !== undefined) closeSync(logFd);
  if (inserted)
    await pool.query(
      "UPDATE posts SET archived_at=now(),updated_at=now() WHERE id=$1 AND slug=$2 AND source_key=$2",
      [id, slug],
    );
  await pool.end();
}
