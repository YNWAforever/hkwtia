import http from "node:http";
import {Pool} from "pg";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "../../scripts/lib/acceptance-guard.ts";
import {createJobPost} from "../../lib/jobs/handler.ts";
import {rateLimitRepository} from "../../lib/db/repos/rate-limit.ts";
const url = assertIsolatedSeedEnvironment(process.env, {
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
const pool = new Pool({connectionString: url});
await assertSeedSentinel("FULL_REMEDIATION", async () =>
  Number(
    (await pool.query("SELECT count(*) AS count FROM acceptance_sentinel"))
      .rows[0].count,
  ),
);
await pool.end();
const mode = process.env.HEALTH_FAULT_MODE,
  secret = process.env.HEALTH_FIXTURE_CRON_SECRET,
  runKey = process.env.HEALTH_FIXTURE_RUN_KEY;
if (
  !["cleanup", "hang", "fail"].includes(mode ?? "") ||
  !secret ||
  secret.length < 32 ||
  !runKey ||
  !/^rate-limit-cleanup:health-runtime:[a-f0-9-]{36}$/.test(runKey)
)
  throw Error("INVALID_HEALTH_FIXTURE_CONFIGURATION");
const post = createJobPost({
  kind: "rate-limit-cleanup",
  bucket: "ten-minute",
  secret: () => secret,
  prepare: async () => ({value: undefined, runKey: runKey!}),
  run: async ({now}) => {
    if (mode === "hang") {
      console.log("HEALTH_FIXTURE_CLAIMED");
      return new Promise(() => {});
    }
    if (mode === "fail") throw Error("SYNTHETIC_JOB_FAILURE");
    return {removed: await rateLimitRepository.cleanupExpired(now)};
  },
});
const server = http.createServer(async (req, res) => {
  if (req.url !== "/api/jobs/rate-limit-cleanup" || req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }
  console.log("HEALTH_FIXTURE_REQUEST");
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers))
    if (typeof value === "string") headers.set(key, value);
  try {
    const response = await post(
      new Request("http://127.0.0.1:9913/api/jobs/rate-limit-cleanup", {
        method: "POST",
        headers,
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch {
    res.writeHead(500);
    res.end();
  }
});
server.listen(9913, "127.0.0.1", () => console.log("HEALTH_FIXTURE_READY"));
