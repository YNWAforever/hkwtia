import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

import {siteConfig} from "@/config/site";

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

// Minimal, targeted resolver for the one ICU plural pattern this codebase's
// `editionsFact` key uses (`{count, plural, one {...} other {...}}`) -- not a
// general ICU parser. Without this, the mock's plain `{name}` substitution
// below leaves the plural clause as the literal characters `# edition(s)`,
// never a digit, which makes any assertion matching `/\d+ editions?/` against
// this mock's output vacuously pass regardless of what the component renders.
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
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("ProgrammesPage", () => {
  it("renders the hero, three groupings, the four typed programme cards and the honest applications state", async () => {
    const {default: ProgrammesPage} = await import("@/app/[locale]/(public)/programmes/page");
    render(await ProgrammesPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: bundles.en.Programmes.hero.title})).toBeInTheDocument();
    const groupings = within(screen.getByRole("navigation", {name: bundles.en.Programmes.groupings.label})).getAllByRole("link");
    expect(groupings.map((link) => link.getAttribute("href"))).toEqual(["#catalogue", "#launchpad", "#history"]);
    expect(document.querySelectorAll(".programme-card")).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent(bundles.en.Programmes.open.emptyTitle);
    expect(screen.getByRole("link", {name: new RegExp(bundles.en.Programmes.open.action)})).toHaveAttribute("href", `mailto:${siteConfig.contact.email}?subject=Programme%20enquiry`);
    expect(screen.getByRole("link", {name: new RegExp(bundles.en.Programmes.launchpad.action)})).toHaveAttribute("href", "/launchpad");
  });

  it("lists each programme's recorded edition span in the history section", async () => {
    const {default: ProgrammesPage} = await import("@/app/[locale]/(public)/programmes/page");
    render(await ProgrammesPage({params: Promise.resolve({locale: "en"})}));
    const history = document.querySelector("#history")!;
    expect(within(history as HTMLElement).getAllByRole("listitem")).toHaveLength(4);
    expect(history.textContent).toContain("2020–2025");
    expect(history.textContent).toContain("6 recorded editions");
    expect(history.textContent).toContain(bundles.en.Programmes.history.credential);
  });

  it("builds indexable bilingual metadata", async () => {
    const {generateMetadata} = await import("@/app/[locale]/(public)/programmes/page");
    const metadata = await generateMetadata({params: Promise.resolve({locale: "zh-HK"})});
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    expect(metadata.title).toBe(bundles["zh-HK"].Programmes.metaTitle);
    expect(metadata.alternates?.canonical).toBe(new URL("/zh/programmes", siteUrl).toString());
    expect(metadata.robots).toBeUndefined();
  });
});
