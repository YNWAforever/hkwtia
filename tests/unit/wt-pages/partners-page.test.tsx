import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>(
    (v, p) => (v as Record<string, unknown> | undefined)?.[p],
    root,
  );
}

// Same targeted resolver as programmes-page.test.tsx: the `sourceNote.count` and
// `group.count` keys use `{count, plural, one {...} other {...}}`, and without resolving
// it the mock would print the literal `#` instead of a digit.
function resolveIcuPlural(raw: string, values: Record<string, string | number>): string {
  return raw.replace(/\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\}/, (_match, varName: string, onePattern: string, otherPattern: string) => {
    const count = Number(values[varName]);
    const chosen = count === 1 ? onePattern : otherPattern;
    return chosen.replace('#', String(count));
  });
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) => {
        const raw = resolveIcuPlural(String(messageAt(locale, namespace, key)), values ?? {});
        return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), raw);
      },
      {raw: (key: string) => messageAt(locale, namespace, key)},
    )),
  setRequestLocale: vi.fn(),
}));

const listPublished = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/repos/partners", () => ({partnersRepository: {listPublished}}));
vi.mock("@/lib/media/url", () => ({isPrivateMediaDeliveryUrl: () => false}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

type Category = "supporting" | "regional" | "media" | "programme" | "sponsor";
const row = (id: string, category: Category, extra: Partial<{websiteUrl: string | null; relationshipStartsOn: string | null; relationshipEndsOn: string | null}> = {}) => ({
  id, name: `Partner ${id}`, category, websiteUrl: null, logoUrl: "/media/logo.png", logoAlt: `Partner ${id} logo`, displayOrder: 1, featured: false,
  relationshipStartsOn: null, relationshipEndsOn: null, ...extra,
});

describe("PartnersPage", () => {
  // Braces matter: `mockReset()` returns the mock, and a function returned from `beforeEach`
  // is a teardown Vitest calls after the test -- which would invoke `listPublished()` and
  // leak the rejected promise from the "read fails" case as an unhandled error.
  beforeEach(() => {
    listPublished.mockReset();
  });

  it("groups published records by category with live counts and prints each record's status", async () => {
    listPublished.mockResolvedValue([
      row("1", "supporting", {websiteUrl: "https://example.org", relationshipStartsOn: "2019-03-01"}),
      row("2", "supporting"),
      row("3", "media", {relationshipStartsOn: "2021-01-01", relationshipEndsOn: "2027-12-31"}),
    ]);
    const {default: PartnersPage} = await import("@/app/[locale]/(public)/partners/page");
    render(await PartnersPage({params: Promise.resolve({locale: "en"})}));

    const nav = screen.getByRole("navigation", {name: bundles.en.Partners.categories.label});
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["#partners-supporting", "#partners-media"]);
    expect(within(nav).getByText("2")).toBeInTheDocument();
    expect(document.querySelectorAll(".partner-record-card")).toHaveLength(3);

    const first = screen.getByRole("heading", {name: "Partner 1"}).closest("article")!;
    expect(within(first).getByRole("link", {name: /example\.org/})).toHaveAttribute("href", "https://example.org");
    expect(first.textContent).toContain("2019");
    expect(first.textContent).not.toMatch(/unconfirmed/i);

    const second = screen.getByRole("heading", {name: "Partner 2"}).closest("article")!;
    expect(second.textContent).toContain(bundles.en.Partners.record.confirmed);

    const third = screen.getByRole("heading", {name: "Partner 3"}).closest("article")!;
    expect(third.textContent).toContain("2021");
    expect(third.textContent).toContain("2027");
    expect(within(third).queryByRole("link", {name: /http/})).toBeNull();

    expect(screen.getByRole("link", {name: new RegExp(bundles.en.Partners.update.action)})).toHaveAttribute("href", "/contact");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the honest empty state, and no category nav, when nothing is published", async () => {
    listPublished.mockResolvedValue([]);
    const {default: PartnersPage} = await import("@/app/[locale]/(public)/partners/page");
    render(await PartnersPage({params: Promise.resolve({locale: "en"})}));
    expect(screen.queryByRole("navigation", {name: bundles.en.Partners.categories.label})).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(bundles.en.Partners.empty.title);
    expect(document.querySelectorAll(".partner-record-card")).toHaveLength(0);
  });

  it("degrades to the empty state when the read fails", async () => {
    listPublished.mockRejectedValue(new Error("TRANSIENT_DATABASE_READ"));
    const {default: PartnersPage} = await import("@/app/[locale]/(public)/partners/page");
    render(await PartnersPage({params: Promise.resolve({locale: "en"})}));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("builds indexable bilingual metadata", async () => {
    const {generateMetadata} = await import("@/app/[locale]/(public)/partners/page");
    const metadata = await generateMetadata({params: Promise.resolve({locale: "zh-HK"})});
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    expect(metadata.title).toBe(bundles["zh-HK"].Partners.metaTitle);
    expect(metadata.alternates?.canonical).toBe(new URL("/zh/partners", siteUrl).toString());
    expect(metadata.robots).toBeUndefined();
  });
});
