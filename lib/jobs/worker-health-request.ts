import "server-only";
import {randomUUID} from "node:crypto";
import {verifyCronBearer} from "@/lib/jobs/auth";
import {isHealthJobKey, type HealthJobKey} from "@/lib/jobs/health-registry";
const verified = Symbol("verified-worker-health");
export type VerifiedWorkerPoll = Readonly<{
  jobKey: HealthJobKey;
  workerRevision: string;
  webRevision: string | null;
  pollId: string;
  startedAt: Date;
  [verified]: true;
}>;
export function expectedWorkerRevision(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const value = env.WORKER_HEALTH_REVISION;
  return value && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null;
}
export function verifyWorkerHealthRequest(
  request: Request,
  jobKey: string,
  secret: string | null | undefined,
  startedAt: Date,
  env: Readonly<Record<string, string | undefined>> = process.env,
): VerifiedWorkerPoll | null {
  const expected = expectedWorkerRevision(env),
    supplied = request.headers.get("x-hkwtia-worker-revision");
  if (
    request.method !== "POST" ||
    !isHealthJobKey(jobKey) ||
    !expected ||
    supplied?.toLowerCase() !== expected ||
    !verifyCronBearer(request, secret) ||
    !Number.isFinite(startedAt.getTime())
  )
    return null;
  const web = env.VERCEL_GIT_COMMIT_SHA;
  return Object.freeze({
    jobKey,
    workerRevision: expected,
    webRevision: web && /^[a-f0-9]{40}$/i.test(web) ? web.toLowerCase() : null,
    pollId: randomUUID(),
    startedAt: new Date(startedAt),
    [verified]: true as const,
  });
}
export function assertVerifiedWorkerPoll(poll: VerifiedWorkerPoll): void {
  if (
    poll[verified] !== true ||
    !isHealthJobKey(poll.jobKey) ||
    poll.workerRevision !== expectedWorkerRevision() ||
    !Number.isFinite(poll.startedAt.getTime())
  )
    throw Error("UNVERIFIED_WORKER_POLL");
}
