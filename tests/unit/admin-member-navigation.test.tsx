import { render, screen, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { MemberTable } from "@/components/admin/member-table";
import {
  adminMemberListHref,
  encodeAdminMemberCursor,
  parseAdminMemberHistory,
  parseAdminMemberRouteQuery,
} from "@/lib/admin/member-types";
import en from "@/messages/en.json";

const member = {
  profileId: "member-a",
  membershipId: "membership-a",
  companyId: "company-a",
  displayName: "Ada Wong",
  email: "ada@example.test",
  companyName: "Acme",
  planCode: "startup",
  membershipStatus: "active",
  renewalAt: "2026-12-31T20:00:00.000Z",
  score: 18,
  matchingMembershipIds: ["membership-a"],
};

describe("admin member navigation", () => {
  it.each([
    { name: "default", limit: undefined, filters: undefined, expected: 50 },
    { name: "explicit twenty", limit: 20, filters: undefined, expected: 20 },
    {
      name: "filtered twenty",
      limit: undefined,
      filters: parseAdminMemberRouteQuery({ q: "acme", limit: "20" }),
      expected: 20,
    },
  ])(
    "keeps $name page size consistent in filter and navigation",
    ({ limit, filters, expected }) => {
      cleanup();
      const cursor = encodeAdminMemberCursor(
        { displayName: "Ada Wong", profileId: "member-a" },
        parseAdminMemberRouteQuery({ q: "acme", limit: String(expected) }),
      );
      const { container } = render(
        <MemberTable
          availableOperations={["profile_patch"]}
          locale="en"
          labels={en.Admin.members}
          page={{ items: [member], nextCursor: cursor, totalMatching: 60 }}
          query="acme"
          limit={limit}
          filters={filters}
        />,
      );
      const next = screen.getByRole("link", { name: en.Admin.members.next });
      const params = Object.fromEntries(
        new URL(next.getAttribute("href")!, "https://example.test")
          .searchParams,
      );
      expect(parseAdminMemberRouteQuery(params).limit).toBe(expected);
      const form = container.querySelector("form")!;
      const submitted = Object.fromEntries(new FormData(form).entries());
      expect(
        parseAdminMemberRouteQuery(submitted as Record<string, string>).limit,
      ).toBe(expected);
      const detail = screen.getByRole("link", { name: member.displayName });
      expect(
        parseAdminMemberRouteQuery(
          Object.fromEntries(
            new URL(detail.getAttribute("href")!, "https://example.test")
              .searchParams,
          ),
        ).limit,
      ).toBe(expected);
    },
  );

  it("opens Member 360 from the name and a view link while preserving only local list filters", () => {
    const markup = renderToStaticMarkup(
      <MemberTable
        availableOperations={["profile_patch"]}
        locale="en"
        labels={en.Admin.members}
        page={{ items: [member], nextCursor: null, totalMatching: 1 }}
        query="acme"
      />,
    );
    expect(markup).toContain("/admin/members/member-a?q=acme");
    expect(markup).toContain(">Ada Wong</a>");
    expect(markup).toContain(">View</a>");
    expect(markup).toContain('aria-label="Select this page"');
    expect(markup).toContain('aria-label="Select Ada Wong"');
    expect(markup).toContain("Jan 1, 2027");
    expect(markup).not.toContain(">startup<");
  });

  it("renders keyboard-usable previous and next links while preserving a validated search trail", () => {
    const cursor = encodeAdminMemberCursor({
      displayName: "Ada Wong",
      profileId: "member-a",
    });
    const first = renderToStaticMarkup(
      <MemberTable
        availableOperations={["profile_patch"]}
        locale="en"
        labels={en.Admin.members}
        page={{ items: [member], nextCursor: cursor, totalMatching: 2 }}
        query="acme"
      />,
    );
    expect(first).toContain(">Next page</a>");
    expect(first).toContain("history=");
    const second = renderToStaticMarkup(
      <MemberTable
        availableOperations={["profile_patch"]}
        locale="en"
        labels={en.Admin.members}
        page={{ items: [], nextCursor: null, totalMatching: 2 }}
        query="acme"
        cursor={cursor}
        history={[null]}
      />,
    );
    expect(second).toContain('href="/admin/members?q=acme"');
    expect(second).toContain(">Previous page</a>");
  });

  it("renders operational filter controls from the same shareable query", () => {
    const filters = parseAdminMemberRouteQuery({
      q: "acme",
      status: "active",
      planCode: "corporate",
      renewalFrom: "2026-10-01",
      sort: "renewal_asc",
    });
    const markup = renderToStaticMarkup(
      <MemberTable
        availableOperations={["profile_patch"]}
        locale="en"
        labels={en.Admin.members}
        page={{ items: [member], nextCursor: null, totalMatching: 1 }}
        query="acme"
        filters={filters}
      />,
    );
    expect(markup).toContain('name="status"');
    expect(markup).toContain('name="planCode"');
    expect(markup).toContain('name="renewalFrom"');
    expect(markup).toContain('name="companyId"');
    expect(markup).toContain('name="completeness"');
    expect(markup).toContain('name="sort"');
    expect(markup).toContain('checked=""');
    expect(markup).toContain(
      "/admin/members/member-a?q=acme&amp;status=active",
    );
  });

  it("keeps the full member filter in a shareable local list and detail return URL", () => {
    const state = parseAdminMemberRouteQuery({
      q: "acme",
      status: ["active", "past_due"],
      planCode: "corporate",
      renewalFrom: "2026-10-01",
      companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sort: "renewal_asc",
    });
    const href = adminMemberListHref("/zh", state);
    expect(href).toContain("q=acme");
    expect(href).toContain("status=active");
    expect(href).toContain("status=past_due");
    expect(href).toContain("planCode=corporate");
    expect(href).toContain("renewalFrom=2026-10-01");
    expect(href).toContain("sort=renewal_asc");
    expect(href).not.toContain("return=");
  });

  it("rejects an external return hint and constructs only a local list URL", () => {
    expect(() =>
      parseAdminMemberRouteQuery({
        q: "acme",
        return: "https://evil.example.test/steal",
      }),
    ).toThrow();
    const state = parseAdminMemberRouteQuery({ q: "acme" });
    expect(adminMemberListHref("/zh", state)).toBe("/zh/admin/members?q=acme");
    const hostile = Buffer.from(
      JSON.stringify(["https://evil.example.test"]),
      "utf8",
    ).toString("base64url");
    expect(() => parseAdminMemberHistory(hostile)).toThrow("INVALID_HISTORY");
  });
});
