import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

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
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("ProgrammeShowcase", () => {
  it("renders 4 programme cards, the first marked .feature, cpai showing no edition count", async () => {
    const {ProgrammeShowcase} = await import("@/components/home/programme-showcase");
    render(await ProgrammeShowcase({locale: "en"}));

    const cards = document.querySelectorAll(".programme-card");
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveClass("feature");

    const cpaiCard = screen.getByRole("heading", {name: bundles.en.Home.programmeShowcase.items.cpai.name}).closest("article")!;
    expect(cpaiCard.textContent).toContain(bundles.en.Home.programmeShowcase.credentialFact);
    expect(cpaiCard.textContent).not.toMatch(/\d+ editions?/);

    const hkictCard = screen.getByRole("heading", {name: bundles.en.Home.programmeShowcase.items.hkict.name}).closest("article")!;
    expect(hkictCard.querySelector("a")).toHaveAttribute("href", "/programs/hkict");
  });
});
