import {fireEvent, render, screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
import type {MemberApplicationView} from "@/lib/portal/applications";

const state = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  continuation: "",
  expired: false,
  nextCursor: null as string | null,
}));

function portalCopy(locale: string) {
  return (locale === "zh-HK" ? zhHK : en).Portal as Record<string, unknown>;
}

function translated(locale: string, key: string, values?: Record<string, string | number>) {
  const found = key.split(".").reduce<unknown>((node, part) => (
    node as Record<string, unknown> | undefined
  )?.[part], portalCopy(locale));
  const text = typeof found === "string" ? found : key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ""));
}

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale}: {locale: string}) => (
    key: string,
    values?: Record<string, string | number>,
  ) => translated(locale, key, values),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/portal/page-actor", () => ({
  portalPageActor: async (_locale: string, continuation: string) => {
    state.continuation = continuation;
    if (state.expired) throw new Error("NEXT_REDIRECT");
    return {kind: "member", userId: "auth-a", profileId: "profile-a"};
  },
}));
vi.mock("@/lib/portal/applications", () => ({
  getMemberApplications: state.list,
  getMemberApplicationsPage: async (...args: unknown[]) => ({items: await state.list(...args), nextCursor: state.nextCursor}),
  getMemberApplication: state.detail,
}));
vi.mock("@/components/internal-shell/private-link", () => ({
  PrivateLink: ({href, children, ...props}: {href: string; children: React.ReactNode}) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({href, children, ...props}: {href: string; children: React.ReactNode}) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import ApplicationDetailPage from "@/app/[locale]/(member)/portal/applications/[id]/page";
import ApplicationsPage from "@/app/[locale]/(member)/portal/applications/page";

const view: MemberApplicationView = {
  id: "11111111-1111-4111-8111-111111111111",
  planCode: "startup",
  status: "draft",
  step: "company",
  missing: ["company"],
  nextAction: "resume",
  createdAt: "2026-10-01T01:00:00.000Z",
  updatedAt: "2026-10-02T02:30:00.000Z",
};

function listProps(locale = "en") {
  return {params: Promise.resolve({locale})};
}

function detailProps(locale = "en", id = view.id) {
  return {params: Promise.resolve({locale, id})};
}

describe("member application status pages", () => {
  beforeEach(() => {
    state.list.mockReset().mockResolvedValue([view]);
    state.detail.mockReset().mockResolvedValue(view);
    state.continuation = "";
    state.expired = false;
    state.nextCursor = null;
  });

  it.each(["en", "zh-HK"] as const)("renders the member-owned list and responsive detail link in %s", async (locale) => {
    const prefix = locale === "zh-HK" ? "/zh" : "";
    const html = renderToStaticMarkup(await ApplicationsPage(listProps(locale)));
    const copy = portalCopy(locale).applications as Record<string, unknown>;
    expect(html).toContain(String(copy.title));
    expect(html).toContain((locale === "zh-HK" ? zhHK : en).Portal.plans.startup);
    expect(html).toContain((copy.status as Record<string, string>).draft);
    expect(html).toContain((copy.missing as Record<string, string>).company);
    expect(html).toContain(`href="${prefix}/portal/applications/${view.id}"`);
    expect(html).toContain(`href="${prefix}/join?plan=startup&amp;application=${view.id}"`);
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain("min-h-11");
  });

  it.each(["en", "zh-HK"] as const)("preserves the cursor and localizes paging links in %s", async locale => {
    state.nextCursor = "next_cursor";
    const html = renderToStaticMarkup(await ApplicationsPage({...listProps(locale), searchParams: Promise.resolve({cursor: "current_cursor"})}));
    expect(state.list).toHaveBeenCalledWith(expect.objectContaining({profileId: "profile-a"}), {cursor: "current_cursor"});
    const prefix = locale === "zh-HK" ? "/zh" : "";
    expect(html).toContain(`href="${prefix}/portal/applications?cursor=next_cursor"`);
    expect(html).toContain((locale === "en" ? en : zhHK).Portal.applications.paging.next);
  });

  it("rejects repeated cursor values with a recovery state", async () => {
    const html = renderToStaticMarkup(await ApplicationsPage({...listProps(), searchParams: Promise.resolve({cursor: ["a", "b"]})}));
    expect(html).toContain(en.Portal.applications.unavailableTitle);
    expect(state.list).not.toHaveBeenCalled();
  });

  it("renders a clear empty state without inventing an application", async () => {
    state.list.mockResolvedValueOnce([]);
    const html = renderToStaticMarkup(await ApplicationsPage(listProps()));
    expect(html).toContain(en.Portal.applications.emptyTitle);
    expect(html).toContain(en.Portal.applications.emptyCopy);
    expect(html).toContain('href="/membership"');
    expect(html).not.toContain("data-application-id");
  });

  it("renders a retryable read failure rather than a false empty state and logs no private detail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      state.list.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_TEXT"));
      const html = renderToStaticMarkup(await ApplicationsPage(listProps()));
      expect(html).toContain(en.Portal.applications.unavailableTitle);
      expect(html).toContain('href="/portal/applications"');
      expect(html).toContain('href="/portal"');
      expect(html).not.toContain(en.Portal.applications.emptyTitle);
      expect(html).not.toContain("PRIVATE_DATABASE_TEXT");
      expect(String(log.mock.calls[0]?.[0])).toBe("PORTAL_APPLICATIONS_READ_FAILED");
    } finally {
      log.mockRestore();
    }
  });

  it("recovers the member-owned list on a fresh read after a transient failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      state.list.mockRejectedValueOnce(new Error("TRANSIENT_DATABASE_FAILURE"));
      expect(renderToStaticMarkup(await ApplicationsPage(listProps()))).toContain(en.Portal.applications.unavailableTitle);
      expect(renderToStaticMarkup(await ApplicationsPage(listProps()))).toContain(en.Portal.applications.title);
      expect(state.list).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it.each(["en", "zh-HK"] as const)("renders one application's status, explicit missing item, next step and back path in %s", async (locale) => {
    const prefix = locale === "zh-HK" ? "/zh" : "";
    const html = renderToStaticMarkup(await ApplicationDetailPage(detailProps(locale)));
    const copy = portalCopy(locale).applications as Record<string, unknown>;
    expect(html).toContain((locale === "zh-HK" ? zhHK : en).Portal.plans.startup);
    expect(html).toContain((copy.status as Record<string, string>).draft);
    expect(html).toContain(view.id);
    expect(html).toContain((copy.missing as Record<string, string>).company);
    expect(html).toContain(`href="${prefix}/join?plan=startup&amp;application=${view.id}"`);
    expect(html).toContain(`href="${prefix}/portal/applications"`);
    expect(html).not.toMatch(/staff|audit|internal/i);
  });

  it("shows a clear no-action message for review without a fabricated form or missing field", async () => {
    state.detail.mockResolvedValueOnce({...view, status: "pending_review", step: "review", missing: [], nextAction: "wait"});
    const html = renderToStaticMarkup(await ApplicationDetailPage(detailProps()));
    expect(html).toContain(en.Portal.applications.missingNone);
    expect(html).toContain(en.Portal.applications.nextAction.wait.body);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/join?plan=");
  });

  it("renders a retryable detail read failure and never presents it as not found", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      state.detail.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_TEXT"));
      const html = renderToStaticMarkup(await ApplicationDetailPage(detailProps("zh-HK")));
      expect(html).toContain(zhHK.Portal.applications.unavailableTitle);
      expect(html).toContain(`href="/zh/portal/applications/${view.id}"`);
      expect(html).not.toContain("PRIVATE_DATABASE_TEXT");
      expect(String(log.mock.calls[0]?.[0])).toBe("PORTAL_APPLICATION_READ_FAILED");
    } finally {
      log.mockRestore();
    }
  });

  it("returns not found for a foreign or invalid application without rendering its id", async () => {
    state.detail.mockResolvedValueOnce(null);
    await expect(ApplicationDetailPage(detailProps("en", "22222222-2222-4222-8222-222222222222"))).rejects.toThrow("NOT_FOUND");
  });

  it("redirects an expired session to the page-specific member login and performs no application read", async () => {
    state.expired = true;
    await expect(ApplicationsPage(listProps("zh-HK"))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.continuation).toBe("/portal/applications");
    expect(state.list).not.toHaveBeenCalled();

    state.list.mockClear();
    await expect(ApplicationDetailPage(detailProps("zh-HK"))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.continuation).toBe(`/portal/applications/${view.id}`);
    expect(state.detail).not.toHaveBeenCalled();
  });

  it("keeps the detail link keyboard focusable and leaves Enter to native link navigation", async () => {
    render(await ApplicationsPage(listProps()));
    const link = screen.getByRole("link", {name: en.Portal.applications.viewDetails});
    link.focus();
    expect(link).toHaveFocus();
    expect(fireEvent.keyDown(link, {key: "Enter"})).toBe(true);
  });
});
