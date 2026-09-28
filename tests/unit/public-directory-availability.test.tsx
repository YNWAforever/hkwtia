import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;
const profiles = vi.hoisted(() => ({listPublished: vi.fn(), listPublishedPage: vi.fn()}));

vi.mock("@/lib/db/repos/company-profiles", () => ({companyProfilesRepository: profiles}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace?: string}) =>
    (key: string, values?: Record<string, unknown>) => {
      const root = namespace ? namespace.split(".").reduce<unknown>((value, part) =>
        (value as Record<string, unknown>)?.[part], bundles[locale]) : bundles[locale];
      const message = key.split(".").reduce<unknown>((value, part) =>
        (value as Record<string, unknown>)?.[part], root);
      return String(message).replace(/\{(\w+)\}/g, (match, name: string) => String(values?.[name] ?? match));
    }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/image", () => ({default: (props: Record<string, unknown>) => <img {...props}/> }));

import MembersPage from "@/app/[locale]/(public)/members/page";

async function renderDirectory(locale: "en" | "zh-HK" = "en", searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await MembersPage({
    params: Promise.resolve({locale}),
    searchParams: Promise.resolve(searchParams),
  }));
}

describe("public directory availability", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    profiles.listPublishedPage.mockReset();
    profiles.listPublished.mockReset();
    profiles.listPublished.mockResolvedValue([]);
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("shows a real empty result without emitting a failure event", async () => {
    profiles.listPublishedPage.mockResolvedValue({items: [], nextCursor: null});
    const html = await renderDirectory();
    expect(html).toContain(bundles.en.Members.noPublishedTitle);
    expect(html).not.toContain(bundles.en.Members.unavailableTitle);
    expect(log).not.toHaveBeenCalled();
  });

  it("offers a filter-preserving next page when the repository has more rows", async () => {
    profiles.listPublishedPage.mockResolvedValue({items: [{
      id: "00000000-0000-4000-8000-000000000001", slug: "member-one", name: "Member One",
      tagline: {en: null, zhHk: null}, tags: [], plan: null, website: null, logoUrl: null,
    }], nextCursor: "next-cursor"});
    const html = await renderDirectory("en", {q: "member"});
    expect(html).toContain('cursor=next-cursor');
    expect(html).toContain(bundles.en.Members.loadMore);
  });

  it("correlates a missing grant column safely and offers a filter-preserving retry", async () => {
    const error = new Error("private company and email: member@example.test", {cause: Object.assign(new Error("missing grant"), {code: "42703"})});
    profiles.listPublishedPage.mockRejectedValue(error);

    const html = await renderDirectory("zh-HK", {q: "harbour", tag: "ai", plan: "invalid"});
    expect(html).toContain(bundles["zh-HK"].Members.unavailableTitle);
    expect(html).not.toContain(bundles["zh-HK"].Members.noPublishedTitle);
    expect(html).toContain('href="/zh/members?q=harbour&amp;tag=ai"');
    expect(html).toContain(bundles["zh-HK"].Members.retry);
    expect(log).toHaveBeenCalledTimes(1);
    const record = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(record).toMatchObject({event: "public_directory_read_failed", code: "schema_missing"});
    expect(record.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(html).toContain(String(record.requestId));
    expect(JSON.stringify(record)).not.toMatch(/member@example|private company|harbour/);
  });
});
