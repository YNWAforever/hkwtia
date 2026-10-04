import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { assertIsolatedSeedEnvironment, assertSeedSentinel } from "./lib/acceptance-guard.ts";
const origin = "http://localhost:3450", evidence = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t14d/";
const db = assertIsolatedSeedEnvironment(process.env, { prefix: "FULL_REMEDIATION", flag: "FULL_REMEDIATION_ACCEPTANCE_SEED", hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST" });
assert.equal(db, process.env.DATABASE_URL_TEST);
assert.equal(new URL(db).hostname, "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");
assert.equal(process.env.NEON_PROJECT_ID, "solitary-wave-52860119");
assert.equal(new URL(process.env.NEON_AUTH_BASE_URL).hostname, "ep-plain-mouse-azm8pl2j.neonauth.c-3.ap-southeast-1.aws.neon.tech");
assert.equal(process.env.EMAIL_DELIVERY_MODE, "test");
assert.equal(process.env.RUN_LIVE_WOZTELL, "0");
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const proof = JSON.parse(readFileSync(".playwright/full-fix-t14d-build-proof.json", "utf8"));
assert.equal(proof.sourceSha, sourceSha);
assert.equal(proof.buildExit, 0);
assert.equal(readFileSync(".next/BUILD_ID", "utf8").trim(), proof.buildId);
for (const [path, hash] of Object.entries(proof.appFiles))
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), hash);
const pool = new Pool({ connectionString: db, query_timeout: 15000 });
const id = randomUUID(), slug = "t14d-runtime-" + id, marker = "Synthetic Support Runtime " + id;
let server, logFd, inserted = false, stage = "isolation";
try {
    await assertSeedSentinel("FULL_REMEDIATION", async () => Number((await pool.query("SELECT count(*) AS n FROM acceptance_sentinel")).rows[0].n));
    const ledger = Number((await pool.query("SELECT count(*) AS n FROM drizzle.__drizzle_migrations")).rows[0].n);
    assert.equal(ledger, 59);
    assert.equal(Number((await pool.query("SELECT count(*) AS n FROM profiles WHERE email IS NOT NULL AND email NOT LIKE '%example.test'")).rows[0].n), 0);
    await pool.query("INSERT INTO posts(id,slug,kind,title_en,title_zh,body_mdx,body_mdx_zh_hk,published_at,author,source_key) VALUES($1,$2,'news',$3,$3,$3,$3,now(),'Synthetic acceptance',$2)", [id, slug, marker]);
    inserted = true;
    const runtimeEnv = { ...process.env, NODE_ENV: "production", APP_URL: origin, AGENTS_ENABLED: "false", ADMIN_AI_ENABLED: "false", EMAIL_DELIVERY_MODE: "test", RUN_LIVE_WOZTELL: "0", WORKER_PAUSED_TEST: "true", CONCIERGE_COOKIE_SECRET: randomBytes(32).toString("hex"), CRON_SECRET: randomBytes(32).toString("hex"), UNSUBSCRIBE_TOKEN_SECRET: randomBytes(32).toString("hex") };
    // No live provider credentials are needed for this explicit test sink.
    for (const key of ["RESEND_API_KEY", "OPENAI_API_KEY", "OPENCODE_API_KEY", "WOZTELL_API_TOKEN", "WOZTELL_CHANNEL_ID"])
        delete runtimeEnv[key];
    logFd = openSync(".playwright/full-fix-t14d-server-private.log", "w", 0o600);
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "localhost", "-p", "3450"], { env: runtimeEnv, stdio: ["ignore", logFd, logFd], windowsHide: true });
    stage = "positive-runtime-db-proof";
    let positive = false;
    for (let n = 0; n < 90; n++) {
        if (server.exitCode !== null)
            throw Error("OWNED_SERVER_EXITED");
        try {
            const r = await fetch(origin + "/news/" + slug, { signal: AbortSignal.timeout(3000) });
            if (r.status === 200 && (await r.text()).includes(marker)) {
                positive = true;
                break;
            }
        }
        catch { }
        await delay(1000);
    }
    assert.equal(positive, true);
    mkdirSync(evidence, { recursive: true });
    writeFileSync(".playwright/full-fix-t14d-local-runtime-safe.json", JSON.stringify({ sourceSha, buildId: proof.buildId, origin, ledger, observedAt: new Date().toISOString(), dbSourcePositivelyProven: true, markerRef: createHash("sha256").update(marker).digest("hex"), production: false, transport: "explicit test sink" }, null, 2));
    stage = "native";
    const env = { ...runtimeEnv, NODE_ENV: "test", PLAYWRIGHT_BASE_URL: origin, PLAYWRIGHT_PORT: "3450", AUDIT_ISOLATED_ACCEPTANCE: "1", FULL_FIX_EXPECTED_SOURCE_SHA: sourceSha };
    delete env.PLAYWRIGHT_STORAGE_STATE;
    const native = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/full-fix-support.spec.ts", "--project=chromium", ...process.argv.slice(2)], { env, stdio: "inherit", windowsHide: true });
    const exit = await new Promise(resolve => native.once("exit", code => resolve(code ?? 1)));
    const result = { sourceSha, buildId: proof.buildId, observedAt: new Date().toISOString(), nativeExit: exit, ledger, dbSourcePositivelyProven: true, googleVerified: false, magicLinkVerified: false, realProviderSends: 0, realDeliveryReceipt: false, production: false };
    writeFileSync(".playwright/full-fix-t14d-native-safe.json", JSON.stringify(result, null, 2));
    assert.equal(exit, 0);
    console.log(JSON.stringify(result));
}
catch (error) {
    console.error(JSON.stringify({ error: "SUPPORT_ACCEPTANCE_GATE_FAILED", stage, sqlState: /^[0-9A-Z]{5}$/.test(error.code ?? "") ? error.code : null, production: false }));
    process.exitCode = 1;
}
finally {
    if (server?.pid) {
        if (process.platform === "win32") {
            try {
                execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
            }
            catch { }
        }
        else
            server.kill("SIGTERM");
    }
    if (logFd !== undefined)
        closeSync(logFd);
    if (inserted)
        await pool.query("UPDATE posts SET archived_at=now(),updated_at=now() WHERE id=$1 AND slug=$2 AND source_key=$2", [id, slug]);
    await pool.end();
}
