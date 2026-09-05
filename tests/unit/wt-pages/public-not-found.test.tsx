import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import type {ReactNode} from "react";

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
} as const;

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) =>
    (key: string) => {
      const root = namespace.split(".").reduce<Record<string, unknown>>((v, p) => (v[p] as Record<string, unknown>), bundles.en);
      return String(root[key]);
    }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("Public (public)/not-found page", () => {
  it("renders inside the public shell's own hero primitive, with home and events actions", async () => {
    const {default: PublicNotFound} = await import("@/app/[locale]/(public)/not-found");
    render(await PublicNotFound());

    expect(screen.getByRole("heading", {level: 1, name: bundles.en.NotFound.title})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.NotFound.homeAction})).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", {name: bundles.en.NotFound.eventsAction})).toHaveAttribute("href", "/events");
  });

  it("leaves the root-level locale-less fallback file untouched", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/not-found.tsx"), "utf8");
    expect(source).toContain("t('contact')");
    expect(source).toContain("t('home')");
  });
});
