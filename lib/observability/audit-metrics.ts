import "server-only";
import {randomUUID} from "node:crypto";

type Facts = Readonly<{kind?: string; lagMs?: number}>;
const COUNTERS = ["claimed", "settled", "failed", "skipped", "processed", "sent", "expired", "removed", "blocked", "queued", "accepted", "uncertain"] as const;
function record(value: unknown): Record<string,unknown> {return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};}

/** Instrument a settled response. No body/header/actor/provider identifier enters the log. */
export async function observeAuditResponse(event: "job_result" | "stripe_webhook_result", handle: () => Promise<Response>, facts: () => Facts = () => ({})): Promise<Response> {
  const requestId = randomUUID();
  const start = Date.now();
  const response = await handle();
  response.headers.set("x-request-id", requestId);
  const revision = process.env.VERCEL_GIT_COMMIT_SHA;
  if (revision && /^[a-f0-9]{7,40}$/i.test(revision)) response.headers.set("x-hkwtia-revision", revision);
  if (process.env.AUDIT_METRICS_ENABLED !== "true") return response;
  try {
    const body = record(await response.clone().json());
    const summary = record(body.summary);
    const counters = Object.fromEntries(COUNTERS.flatMap(key => typeof summary[key] === "number" && Number.isFinite(summary[key]) ? [[key, summary[key]]] : []));
    const extra = facts();
    const outcome = response.status >= 500 ? "failed" : response.status >= 400 ? "denied" : summary.disabled === true ? "disabled" : body.stale === true ? "stale" : body.duplicate === true || body.result === "duplicate" ? "duplicate" : "completed";
    console.info(JSON.stringify({event, requestId, occurredAt: new Date().toISOString(), status: response.status, outcome, durationMs: Math.max(0, Date.now() - start), counters,
      ...(extra.kind && /^[a-z][a-z0-9-]{0,63}$/.test(extra.kind) ? {kind: extra.kind} : {}),
      ...(Number.isFinite(extra.lagMs) ? {lagMs: Math.max(0, extra.lagMs!)} : {}),
      ...(revision && /^[a-f0-9]{7,40}$/i.test(revision) ? {revision} : {}),
    }));
  } catch {/* A metric sink must never turn a committed effect into a retry. */}
  return response;
}
