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

const listPublicCohorts = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/cohorts", () => ({cohortRepository: {listPublicCohorts}}));

describe("GbaGateway", () => {
  it("labels the CTA 'Explore Launch Pad' when no cohort is open", async () => {
    listPublicCohorts.mockResolvedValueOnce([{status: "active"}]);
    const {GbaGateway} = await import("@/components/home/gba-gateway");
    render(await GbaGateway({locale: "en"}));

    const cta = screen.getByRole("link", {name: bundles.en.Home.gbaGateway.exploreAction});
    expect(cta).toHaveAttribute("href", "/launchpad");
  });

  it("labels the CTA 'View open cohort' when an open cohort exists", async () => {
    listPublicCohorts.mockResolvedValueOnce([{status: "open"}]);
    const {GbaGateway} = await import("@/components/home/gba-gateway");
    render(await GbaGateway({locale: "en"}));

    const cta = screen.getByRole("link", {name: bundles.en.Home.gbaGateway.openCohortAction});
    expect(cta).toHaveAttribute("href", "/launchpad");
  });

  it("degrades to 'Explore Launch Pad' when the read rejects", async () => {
    listPublicCohorts.mockRejectedValueOnce(new Error("db down"));
    const {GbaGateway} = await import("@/components/home/gba-gateway");
    render(await GbaGateway({locale: "en"}));

    expect(screen.getByRole("link", {name: bundles.en.Home.gbaGateway.exploreAction})).toBeInTheDocument();
  });
});
