import {readFile} from "node:fs/promises";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

const routeFiles = [
  "app/api/admin/media/upload/route.ts",
  "app/api/ai/concierge/route.ts",
  "app/api/ai/conversations/[id]/feedback/route.ts",
  "app/api/jobs/aiops-metrics/route.ts",
  "app/api/jobs/board-reporter/route.ts",
  "app/api/jobs/chat-retention/route.ts",
  "app/api/jobs/retention-analyst/route.ts",
  "app/api/media/[id]/route.ts",
  "app/api/stripe/webhook/route.ts",
  "app/api/unsubscribe/route.ts",
  "app/api/webhooks/woztell/route.ts",
] as const;

const allowedHandlerNames = new Set([
  "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT",
  "config", "dynamic", "dynamicParams", "fetchCache", "maxDuration",
  "maxInterval", "preferredRegion", "revalidate", "runtime",
]);

function exportedNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:(?:async)\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/gs)) {
    for (const name of match[1].split(",")) {
      const exported = name.trim().split(/\s+as\s+/).at(-1);
      if (exported) names.add(exported);
    }
  }
  return [...names].sort();
}

describe("Next route module boundaries", () => {
  it("exports only framework handlers and route config from API route files", async () => {
    const violations: string[] = [];
    for (const routeFile of routeFiles) {
      const source = await readFile(join(process.cwd(), routeFile), "utf8");
      for (const exported of exportedNames(source)) {
        if (!allowedHandlerNames.has(exported)) violations.push(`${routeFile}:${exported}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
