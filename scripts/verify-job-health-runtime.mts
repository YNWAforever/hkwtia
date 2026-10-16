import fs from "node:fs";
import path from "node:path";
import {spawn, execFileSync, type ChildProcess} from "node:child_process";
import {randomBytes, randomUUID, createHash} from "node:crypto";
import {Pool} from "pg";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "./lib/acceptance-guard.ts";
const root = process.cwd(),
  url = assertIsolatedSeedEnvironment(process.env, {
    prefix: "FULL_REMEDIATION",
    flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
    hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
  });
if (
  new URL(url).hostname !==
    "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech" ||
  process.env.NEON_PROJECT_ID !== "solitary-wave-52860119"
)
  throw Error("UNCONFIRMED_ISOLATED_TARGET");
const pool = new Pool({connectionString: url}),
  revision = "a".repeat(40),
  secret = randomBytes(32).toString("hex"),
  privateDir = path.resolve(root, ".playwright/worker-health-runtime");
if (path.relative(root, privateDir).startsWith(".."))
  throw Error("INVALID_PRIVATE_WORKSPACE");
fs.mkdirSync(privateDir, {recursive: true});
const log = (name: string) => path.join(privateDir, name + ".log"),
  receiptDir = path.resolve(
    root,
    "docs/audits/hkwtia-2026-10-01-remediation/evidence/t11",
  );
let worker: ChildProcess | undefined, app: ChildProcess | undefined;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready(file: string, needle: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8").includes(needle))
      return;
    await delay(250);
  }
  throw Error("ISOLATED_RUNTIME_NOT_READY");
}
function launch(args: string[], file: string, env = process.env): ChildProcess {
  const fd = fs.openSync(file, "w"),
    child = spawn(process.execPath, args, {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ["ignore", fd, fd],
    });
  fs.closeSync(fd);
  return child;
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  for (
    let attempt = 0;
    attempt < 40 && child.exitCode === null && child.signalCode === null;
    attempt++
  )
    await delay(100);
  if (child.exitCode === null && child.signalCode === null)
    throw Error("ISOLATED_CHILD_DID_NOT_STOP");
}
function runKey() {
  return "rate-limit-cleanup:health-runtime:" + randomUUID();
}
const receipts: Record<string, unknown>[] = [];
const envFile = path.resolve(root, ".env.local"),
  originalEnv = fs.readFileSync(envFile);
const browserRequested = process.env.HEALTH_RUNTIME_BROWSER === "1";
async function browser(state: "healthy" | "degraded") {
  const child = launch(
    [
      "--env-file=.env.local",
      "node_modules/@playwright/test/cli.js",
      "test",
      "tests/e2e/full-job-health.spec.ts",
    ],
    log("browser-" + state),
    {
      ...process.env,
      PLAYWRIGHT_BASE_URL: "http://localhost:3450",
      HEALTH_EXPECTED_STATE: state,
    },
  );
  await new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(Error("HEALTH_BROWSER_COULD_NOT_START")));
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error("HEALTH_BROWSER_ACCEPTANCE_FAILED")),
    );
  });
}

try {
  await assertSeedSentinel("FULL_REMEDIATION", async () =>
    Number(
      (await pool.query("SELECT count(*) AS count FROM acceptance_sentinel"))
        .rows[0].count,
    ),
  );
  if (
    Number(
      (
        await pool.query(
          "SELECT count(*) AS count FROM job_health WHERE job_key='rate-limit-cleanup'",
        )
      ).rows[0].count,
    ) !== 0
  )
    throw Error("EXISTING_HEALTH_OBSERVATION_REVIEW_REQUIRED");
  if (browserRequested) {
    const text = originalEnv
      .toString("utf8")
      .replace(/^WORKER_HEALTH_(?:REVISION|JOBS)=.*\r?\n?/gm, "");
    fs.writeFileSync(
      envFile,
      text +
        `\nWORKER_HEALTH_REVISION=${revision}\nWORKER_HEALTH_JOBS=rate-limit-cleanup\n`,
    );
    await delay(3000);
  }
  const config = path.join(privateDir, "wrangler.toml");
  const declaredMain = /^main\s*=\s*"([^"]+)"/m.exec(
    fs.readFileSync("workers/wrangler.toml", "utf8"),
  )?.[1];
  if (!declaredMain) throw Error("WORKER_MAIN_NOT_DECLARED");
  const workerMain = path.resolve(root, "workers", declaredMain);
  fs.writeFileSync(
    config,
    `name = "hkwtia-health-isolated-local"\nmain = ${JSON.stringify(workerMain.replaceAll("\\", "/"))}\ncompatibility_date = "2026-07-26"\n[triggers]\ncrons = ["*/10 * * * *"]\n`,
  );
  fs.writeFileSync(
    path.join(privateDir, ".dev.vars"),
    `APP_URL="http://127.0.0.1:9913"\nCRON_SECRET="${secret}"\nWORKER_REVISION="${revision}"\nWORKER_JOB_ALLOWLIST="rate-limit-cleanup"\nAUDIT_METRICS_ENABLED="true"\n`,
  );
  worker = launch(
    [
      "workers/node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--config",
      config,
      "--test-scheduled",
      "--port",
      "8787",
      "--ip",
      "127.0.0.1",
      "--local",
    ],
    log("worker"),
  );
  await ready(log("worker"), "Ready on");
  for (const mode of ["cleanup", "hang", "crash", "fail"] as const) {
    const key = runKey();
    if (
      (await pool.query("SELECT id FROM jobs WHERE run_key=$1", [key])).rows
        .length
    )
      throw Error("EXISTING_BUCKET_JOB_REVIEW_REQUIRED");
    let ownJob: string | undefined, ownPoll: string | undefined;
    try {
      const env = {
        ...process.env,
        WORKER_HEALTH_REVISION: revision,
        HEALTH_FIXTURE_CRON_SECRET: secret,
        HEALTH_FAULT_MODE: mode === "crash" ? "hang" : mode,
        HEALTH_FIXTURE_RUN_KEY: key,
      };
      app = launch(
        [
          "--conditions=react-server",
          "--env-file=.env.local",
          "--import",
          "tsx",
          "tests/fixtures/full-job-health-http.mts",
        ],
        log(mode),
        env,
      );
      await ready(log(mode), "HEALTH_FIXTURE_READY");
      const logOffset = fs.readFileSync(log("worker"), "utf8").length;
      const tick = fetch(
        "http://127.0.0.1:8787/__scheduled?" +
          new URLSearchParams({cron: "*/10 * * * *"}),
        {signal: AbortSignal.timeout(60000)},
      );
      if (mode === "crash") {
        await ready(log(mode), "HEALTH_FIXTURE_CLAIMED");
        await stop(app);
        app = undefined;
      }
      const scheduled = await tick;
      if (!scheduled.ok) throw Error("SCHEDULED_TRIGGER_FAILED");
      // /__scheduled acknowledges dispatch before ctx.waitUntil finishes. Read the actual ledger.
      let observed = false;
      for (let attempt = 0; attempt < 240; attempt++) {
        const j = (
          await pool.query(
            "SELECT state,attempt_count FROM jobs WHERE run_key=$1",
            [key],
          )
        ).rows[0];
        const h = (
          await pool.query(
            "SELECT outcome FROM job_health WHERE job_key='rate-limit-cleanup' AND worker_revision=$1",
            [revision],
          )
        ).rows[0];
        if (
          j &&
          h &&
          ((mode === "cleanup" &&
            j.state === "completed" &&
            h.outcome === "completed") ||
            (mode === "hang" && h.outcome === "uncertain") ||
            (mode === "crash" &&
              j.state === "processing" &&
              h.outcome === "processing") ||
            (mode === "fail" &&
              j.attempt_count === 3 &&
              h.outcome === "failed"))
        ) {
          observed = true;
          break;
        }
        await delay(250);
      }
      if (!observed) throw Error("JOB_SETTLEMENT_NOT_OBSERVED");
      let metricObserved = false;
      for (let attempt = 0; attempt < 240; attempt++) {
        const tail = fs.readFileSync(log("worker"), "utf8").slice(logOffset);
        if (
          tail.split("\n").some((line) => {
            try {
              return JSON.parse(line).event === "worker_invocation";
            } catch {
              return false;
            }
          })
        ) {
          metricObserved = true;
          break;
        }
        await delay(250);
      }
      if (!metricObserved) throw Error("WORKER_COMPLETION_NOT_OBSERVED");
      const jobs = (
        await pool.query(
          "SELECT id,state,attempt_count,completed_at FROM jobs WHERE run_key=$1",
          [key],
        )
      ).rows;
      if (jobs.length !== 1) throw Error("JOB_LEDGER_READBACK_MISMATCH");
      ownJob = jobs[0].id;
      const health = (
        await pool.query(
          "SELECT poll_id,outcome,last_succeeded_at,counts FROM job_health WHERE job_key='rate-limit-cleanup' AND worker_revision=$1",
          [revision],
        )
      ).rows;
      if (health.length !== 1) throw Error("HEALTH_READBACK_MISSING");
      ownPoll = health[0].poll_id;
      if (
        mode === "cleanup" &&
        (jobs[0].state !== "completed" ||
          health[0].outcome !== "completed" ||
          !health[0].last_succeeded_at)
      )
        throw Error("COMPLETION_NOT_VERIFIED");
      if (
        mode === "hang" &&
        (jobs[0].state !== "processing" ||
          jobs[0].attempt_count !== 1 ||
          health[0].outcome !== "uncertain" ||
          health[0].last_succeeded_at)
      )
        throw Error("TIMEOUT_RETRIED_UNKNOWN_WORK");
      if (
        mode === "crash" &&
        (jobs[0].state !== "processing" ||
          jobs[0].attempt_count !== 1 ||
          health[0].outcome !== "processing" ||
          health[0].last_succeeded_at)
      )
        throw Error("CRASH_FABRICATED_SUCCESS");
      if (
        mode === "fail" &&
        (jobs[0].state !== "failed" ||
          jobs[0].attempt_count !== 3 ||
          health[0].outcome !== "failed" ||
          health[0].last_succeeded_at)
      )
        throw Error("FAILED_JOB_READBACK_MISMATCH");
      if (browserRequested && (mode === "cleanup" || mode === "hang"))
        await browser(mode === "cleanup" ? "healthy" : "degraded");
      const receipt = {
        mode,
        browserVerified:
          browserRequested && (mode === "cleanup" || mode === "hang"),
        scheduledAcknowledgedHttp: scheduled.status,
        jobState: jobs[0].state,
        attemptCount: jobs[0].attempt_count,
        healthOutcome: health[0].outcome,
        lastSuccessPresent: Boolean(health[0].last_succeeded_at),
        counts: health[0].counts,
        runner:
          "existing createJobPost and SQL repositories; explicit hanging/failure fault injection",
        providerTest: false,
      };
      receipts.push(receipt);
      console.log(JSON.stringify(receipt));
    } finally {
      await stop(app);
      app = undefined;
      const observed = (
        await pool.query("SELECT id FROM jobs WHERE run_key=$1", [key])
      ).rows;
      if (!ownJob && observed.length === 1) ownJob = observed[0].id;
      if (ownJob)
        await pool.query("DELETE FROM jobs WHERE id=$1 AND run_key=$2", [
          ownJob,
          key,
        ]);
      if (!ownPoll) {
        const own = (
          await pool.query(
            "SELECT poll_id FROM job_health WHERE job_key='rate-limit-cleanup' AND worker_revision=$1",
            [revision],
          )
        ).rows;
        if (own.length === 1) ownPoll = own[0].poll_id;
      }
      if (ownPoll)
        await pool.query(
          "DELETE FROM job_health WHERE job_key='rate-limit-cleanup' AND poll_id=$1",
          [ownPoll],
        );
    }
  }
  const source = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  fs.mkdirSync(receiptDir, {recursive: true});
  fs.writeFileSync(
    path.join(receiptDir, "local-runtime.json"),
    JSON.stringify(
      {
        environment:
          "confirmed isolated Neon; actual Wrangler/Miniflare local scheduled HTTP; no cloud invocation",
        sourceBase: source,
        workerSourceSha256: createHash("sha256")
          .update(fs.readFileSync("workers/src/index.ts"))
          .digest("hex"),
        bindingRevision: "synthetic fixture, not a deployed SHA",
        scope: ["rate-limit-cleanup"],
        receipts,
        cloudDeploymentVerified: false,
        production: false,
        command:
          "node --env-file=.env.local --import tsx scripts/verify-job-health-runtime.mts",
      },
      null,
      2,
    ),
  );
} finally {
  if (browserRequested) fs.writeFileSync(envFile, originalEnv);
  await stop(app);
  await stop(worker);
  await pool.end();
  const vars = path.join(privateDir, ".dev.vars");
  if (fs.existsSync(vars)) fs.unlinkSync(vars);
}
