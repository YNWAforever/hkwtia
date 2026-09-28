import "server-only";

import {randomUUID} from "node:crypto";

type SafeReadCode = "schema_missing" | "permission_denied" | "db_connection" | "read_failed";

function sqlState(error: unknown): string | null {
  let current = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "object" || current === null) return null;
    const value = current as {code?: unknown; cause?: unknown};
    if (typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code)) return value.code;
    current = value.cause;
  }
  return null;
}

function safeReadCode(error: unknown): SafeReadCode {
  const state = sqlState(error);
  if (state === "42703" || state === "42P01") return "schema_missing";
  if (state === "42501") return "permission_denied";
  if (state?.startsWith("08") || state === "57P01") return "db_connection";
  return "read_failed";
}

/** A visitor can quote the reference; logs never include the query, member rows or raw exception. */
export function recordDirectoryReadFailure(error: unknown): string {
  const requestId = randomUUID();
  const revision = process.env.VERCEL_GIT_COMMIT_SHA;
  console.error(JSON.stringify({
    event: "public_directory_read_failed",
    requestId,
    code: safeReadCode(error),
    deployment: revision && /^[0-9a-f]{40}$/i.test(revision) ? revision : "unknown",
    occurredAt: new Date().toISOString(),
  }));
  return requestId;
}
