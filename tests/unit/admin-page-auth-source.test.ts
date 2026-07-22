import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

const routes = [
  "app/[locale]/(admin)/admin/layout.tsx",
  "app/[locale]/(admin)/admin/members/page.tsx",
  "app/[locale]/(admin)/admin/members/[id]/page.tsx",
  "app/[locale]/(admin)/admin/segments/page.tsx",
  "app/[locale]/(admin)/admin/at-risk/page.tsx",
  "app/[locale]/(admin)/admin/events-mgmt/page.tsx",
  "app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx",
  "app/[locale]/(admin)/admin/approvals/page.tsx",
  "app/[locale]/(admin)/admin/reports/page.tsx",
] as const;

describe("every M2 admin route uses the shared 404 auth boundary", () => {
  it.each(routes)("protects %s", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(source).toContain('import {requireAdminPageActor} from "@/lib/admin/page-auth";');
    expect(source).toContain("requireAdminPageActor()");
    expect(source).not.toContain("requireAdminActor()");
  });
});