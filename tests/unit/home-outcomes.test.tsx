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
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("Outcomes", () => {
  it("always renders the honest publishing-framework state, with no data owner", async () => {
    const {Outcomes} = await import("@/components/home/outcomes");
    render(await Outcomes({locale: "en"}));

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Home.outcomes.emptyTitle})).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.outcomes.frameworkSteps)).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Home.outcomes.action})).toHaveAttribute("href", "/contact");
  });
});
