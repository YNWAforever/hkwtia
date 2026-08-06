import {revalidatePath} from "next/cache";
import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));

import {revalidateAdminPath} from "@/lib/admin/revalidate-path";

const revalidate = vi.mocked(revalidatePath);

describe("admin revalidate path guard", () => {
  beforeEach(() => {
    revalidate.mockClear();
  });

  // Every path an admin server action is actually bound to today. These must
  // keep passing: a rejected path silently stops cache invalidation.
  it.each([
    "/en/admin/listings-review",
    "/zh-HK/admin/listings-review",
    "/en/admin/approvals",
    "/zh-HK/admin/approvals",
    "/admin/segments",
    "/zh/admin/segments",
    "/en/admin/members/11111111-1111-4111-8111-111111111111",
    "/zh-HK/admin/members/11111111-1111-4111-8111-111111111111",
    "/en/admin/events-mgmt/11111111-1111-4111-8111-111111111111",
    "/en/admin/reports/board-drafts/11111111-1111-4111-8111-111111111111",
    "/en/admin/news",
    "/zh-HK/admin/news",
    "/en/admin/news/11111111-1111-4111-8111-111111111111",
    "/en/admin/page-copy",
    "/zh-HK/admin/page-copy",
    "/en/admin/page-copy/Privacy",
    "/zh-HK/admin/page-copy/AiTransparency",
    "/en/admin/media",
    "/zh-HK/admin/media",
    "/en/admin/media/11111111-1111-4111-8111-111111111111",
  ])("revalidates the bound admin path %s", (path) => {
    expect(revalidateAdminPath(path)).toBe(true);
    expect(revalidate).toHaveBeenCalledWith(path);
  });

  it.each([
    ["another surface", "/en/portal"],
    ["the site root", "/"],
    ["a traversal attempt", "/admin/../portal"],
    ["a protocol-relative host", "//evil.example.com"],
    ["an absolute url", "https://evil.example.com/admin"],
    ["a query string", "/en/admin/members?id=1"],
    ["an unknown locale", "/fr/admin/segments"],
    ["an empty path", ""],
  ])("refuses to revalidate %s", (_case, path) => {
    expect(revalidateAdminPath(path)).toBe(false);
    expect(revalidate).not.toHaveBeenCalled();
  });
});
