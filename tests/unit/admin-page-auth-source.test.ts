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

  it("authorizes the member list before parsing untrusted route query values", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(admin)/admin/members/page.tsx"), "utf8");
    const authorization = source.indexOf("const actor = await requireAdminPageActor();");
    const parsing = source.indexOf("const query = parseAdminMemberRouteQuery(await searchParams);");

    expect(authorization).toBeGreaterThanOrEqual(0);
    expect(parsing).toBeGreaterThan(authorization);
    expect(source).toContain("searchAdminMembers(actor, query)");
  });

  it("keeps a malformed member query in the anonymous/member/company-admin live 404 matrix", () => {
    const source = readFileSync(resolve(process.cwd(), "tests/e2e/m2-admin-crm.spec.ts"), "utf8");
    expect(source).toContain('"/admin/members?limit=not-a-number"');
  });
});
