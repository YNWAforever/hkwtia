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

const loadImpactMetrics = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) => {
        const raw = String(messageAt(locale, namespace, key));
        return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), raw);
      },
      {raw: (key: string) => messageAt(locale, namespace, key)},
    )),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/home/impact-metrics", () => ({loadImpactMetrics}));

describe("ImpactEvidence", () => {
  it("renders one tile per surviving metric, each with its value, definition and period", async () => {
    loadImpactMetrics.mockResolvedValueOnce({
      pastEvents: {value: 3, asOf: new Date("2026-09-01T00:00:00.000Z")},
      publishedPartners: null,
      asaRegions: {value: 17, year: 2025},
    });
    const {ImpactEvidence} = await import("@/components/home/impact-evidence");
    render(await ImpactEvidence({locale: "en"}));

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.impact.pastEvents.definition)).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.queryByText(bundles.en.Home.impact.publishedPartners.definition)).not.toBeInTheDocument();
  });

  it("renders nothing when every tile is omitted", async () => {
    loadImpactMetrics.mockResolvedValueOnce({pastEvents: null, publishedPartners: null, asaRegions: null});
    const {ImpactEvidence} = await import("@/components/home/impact-evidence");
    const {container} = render(await ImpactEvidence({locale: "en"}) ?? <></>);

    expect(container).toBeEmptyDOMElement();
  });
});
