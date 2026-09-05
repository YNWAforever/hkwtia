import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
} as const;

function messageAt(namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles.en);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) =>
    Object.assign((key: string) => String(messageAt(namespace, key)), {raw: (key: string) => messageAt(namespace, key)})),
  setRequestLocale: vi.fn(),
}));

// AiTransparencyPage's `aiOpsLink` and PageHero's breadcrumb both render the real
// @/i18n/navigation Link, which reads useLocale() from a next-intl context this render tree
// does not provide. Same fix as Tasks 17-19: project to a plain <a>.
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe.each([
  ["AiTransparency", () => import("@/app/[locale]/(public)/ai-transparency/page")],
  ["Privacy", () => import("@/app/[locale]/(public)/privacy/page")],
])("%s page hero", (namespace, importPage) => {
  it("renders a PageHero with a breadcrumb landmark and the existing eyebrow/title/description", async () => {
    const {default: Page} = await importPage();
    render(await Page({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: bundles.en[namespace as "AiTransparency" | "Privacy"].title})).toBeInTheDocument();
    // Both namespaces' eyebrow and breadcrumbCurrent are the same literal string (the
    // established repo convention already seen in LaunchPad/Events/News/Contact, and the same
    // collision tests/unit/wt-pages/about.test.tsx documents), so the eyebrow text renders
    // twice: once in PageHero's <Eyebrow>, once in its breadcrumb <b>.
    expect(screen.getAllByText(bundles.en[namespace as "AiTransparency" | "Privacy"].eyebrow)).toHaveLength(2);
    expect(screen.getByRole("navigation", {name: /breadcrumb/i})).toBeInTheDocument();
  });
});
