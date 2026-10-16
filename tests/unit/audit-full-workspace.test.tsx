import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/zh/admin/members" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUnsavedChangesProvider } from "@/components/admin/unsaved-changes-guard";
import {
  adminNavigationGroups,
  type InternalNavGroupConfig,
} from "@/config/internal-navigation";
import { MemberFilters } from "@/components/admin/member-filters";
import { adminMemberQuerySchema } from "@/lib/admin/member-query";
import en from "@/messages/en.json";
it("organizes six daily-work groups while retaining every existing route", () => {
  const groups: readonly InternalNavGroupConfig[] = adminNavigationGroups;
  expect(groups).toHaveLength(6);
  const links = groups.flatMap((group) => group.links);
  expect(new Set(links.map((link) => link.href)).size).toBe(links.length);
  for (const path of [
    "/admin/batches",
    "/admin/page-copy",
    "/admin/members",
    "/admin/inbox",
    "/admin/events-mgmt",
    "/admin/reports",
  ])
    expect(links.some((link) => link.href === path)).toBe(true);
  expect(links.some((link) => link.href === "/admin/automations#verified-worker-health")).toBe(
    true,
  );
});
it("renders semantic SVG icons with the localized existing text/deep link", () => {
  render(
    <AdminUnsavedChangesProvider confirmMessage="Leave?">
      <AdminNav locale="zh-HK" />
    </AdminUnsavedChangesProvider>,
  );
  const link = screen.getByRole("link", { name: "navigation.members" });
  expect(link).toHaveAttribute("href", "/zh/admin/members");
  expect(link).toHaveAttribute("aria-current", "page");
  expect(link.querySelector("svg")).not.toBeNull();
});
it("keeps advanced filters collapsed without losing the GET filter values", () => {
  const f = en.Admin.members.filters;
  render(
    <MemberFilters
      locale="en"
      query={adminMemberQuerySchema.parse({
        search: "Synthetic",
        status: ["active"],
        limit: 50,
      })}
      searchLabel="Search members"
      labels={{ ...f, advanced: "Advanced filters" }}
      statusCodes={en.Admin.members.statusCodes}
      planCodes={en.Admin.members.planCodes}
    />,
  );
  const summary = screen.getByText("Advanced filters");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByRole("searchbox", { name: "Search members" })).toHaveValue(
    "Synthetic",
  );
  expect(
    document.querySelector('input[name="status"][value="active"]'),
  ).toBeChecked();
  expect(document.querySelector('input[name="limit"]')).toHaveValue("50");
});
