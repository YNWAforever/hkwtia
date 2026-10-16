import "server-only";
import {randomUUID} from "node:crypto";
import {PortalAccessDenied} from "@/lib/portal/access-state";

function safeCode(error: unknown): string {
  if (error instanceof PortalAccessDenied) return "access_changed";
  let current = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "object" || current === null) break;
    const value = current as {code?: unknown; cause?: unknown};
    if (value.code === "42P01" || value.code === "42703") return "schema_missing";
    if (value.code === "42501") return "permission_denied";
    if (typeof value.code === "string" && (value.code.startsWith("08") || value.code === "57P01")) return "db_connection";
    current = value.cause;
  }
  return "read_failed";
}

/** The reference can be shared with support; raw exceptions and member data stay out of logs. */
export function recordFirstResultReadFailure(error: unknown): string {
  const reference = randomUUID();
  console.error(JSON.stringify({
    event: "portal_first_result_read_failed",
    reference,
    code: safeCode(error),
    occurredAt: new Date().toISOString(),
  }));
  return reference;
}
