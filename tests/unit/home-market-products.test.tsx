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

const listPublished = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: {listPublished}}));

describe("MarketProducts", () => {
  it("prints the donor's exact 'no live records' copy on both panels when nothing is published", async () => {
    listPublished.mockResolvedValueOnce([]);
    const {MarketProducts} = await import("@/components/home/market-products");
    render(await MarketProducts({locale: "en"}));

    expect(screen.getByText(bundles.en.Home.marketProducts.directory.copyEmpty)).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.marketProducts.marketplace.copyEmpty)).toBeInTheDocument();
    expect(showcaseRepositoryCalledWithBound()).toBe(true);

    function showcaseRepositoryCalledWithBound() {
      const [, options] = listPublished.mock.calls[0] as [unknown, {limit: number}];
      return options.limit === 12;
    }
  });

  it("switches both panels to the available copy, with no printed count, when records are published", async () => {
    listPublished.mockResolvedValueOnce([{}, {}]);
    const {MarketProducts} = await import("@/components/home/market-products");
    render(await MarketProducts({locale: "en"}));

    expect(screen.getByText(bundles.en.Home.marketProducts.directory.copyAvailable)).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.marketProducts.marketplace.copyAvailable)).toBeInTheDocument();
    expect(screen.queryByText(/^2$/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Home.marketProducts.directory.action})).toHaveAttribute("href", "/showcase");
    expect(screen.getByRole("link", {name: bundles.en.Home.marketProducts.marketplace.action})).toHaveAttribute("href", "/showcase");
  });

  it("degrades to the empty copy when the read rejects", async () => {
    listPublished.mockRejectedValueOnce(new Error("db down"));
    const {MarketProducts} = await import("@/components/home/market-products");
    render(await MarketProducts({locale: "en"}));

    expect(screen.getByText(bundles.en.Home.marketProducts.directory.copyEmpty)).toBeInTheDocument();
  });
});
