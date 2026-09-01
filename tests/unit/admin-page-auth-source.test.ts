import {readdirSync, readFileSync} from "node:fs";
import {join, relative, resolve} from "node:path";
import {describe, expect, it} from "vitest";

const adminRoot = resolve(process.cwd(), "app/[locale]/(admin)");

function routeFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.isFile() && (entry.name === "page.tsx" || entry.name === "layout.tsx")
      ? [path]
      : [];
  });
}

const routes = routeFiles(adminRoot)
  .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"))
  .sort();

describe("every admin route uses the shared 404 auth boundary", () => {
  // Discovery, not a hand-maintained list. The previous allowlist silently
  // omitted /admin/listings-review, /admin/cohorts, /admin/automations and the
  // admin index, so those routes were unguarded by the test that exists to
  // guard them — and a new section could ship the same way with a green suite.
  it("discovers every admin page and layout", () => {
    expect(routes.length).toBeGreaterThanOrEqual(26);
    for (const known of [
      "app/[locale]/(admin)/admin/layout.tsx",
      "app/[locale]/(admin)/admin/page.tsx",
      "app/[locale]/(admin)/admin/members/[id]/page.tsx",
      "app/[locale]/(admin)/admin/listings-review/page.tsx",
      "app/[locale]/(admin)/admin/cohorts/page.tsx",
      "app/[locale]/(admin)/admin/automations/page.tsx",
      "app/[locale]/(admin)/admin/announcements/page.tsx",
      "app/[locale]/(admin)/admin/announcements/[id]/page.tsx",
      "app/[locale]/(admin)/admin/partners/page.tsx",
      "app/[locale]/(admin)/admin/partners/[id]/page.tsx",
      "app/[locale]/(admin)/admin/landing-partners/page.tsx",
      "app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx",
      "app/[locale]/(admin)/admin/news/page.tsx",
      "app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx",
      "app/[locale]/(admin)/admin/media/page.tsx",
      "app/[locale]/(admin)/admin/media/[id]/page.tsx",
    ]) {
      expect(routes, known).toContain(known);
    }
  });

  it.each(routes)("protects %s", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(source).toMatch(
      /import\s*\{\s*requireAdminPageActor\s*\}\s*from\s*"@\/lib\/admin\/page-auth";/,
    );
    expect(source).toContain("requireAdminPageActor()");
    // requireAdminActor throws for the action boundary; a page must 404 instead
    // so the admin surface's existence is never disclosed.
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
