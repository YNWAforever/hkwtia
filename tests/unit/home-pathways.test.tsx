import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

import {publicRoutes} from "@/config/public-routes";

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
    (key: string) => {
      const value = messageAt(locale, namespace, key);
      // A missing key must fail the test, not render the literal "undefined".
      if (typeof value !== "string") throw new Error(`MISSING_MESSAGE ${locale} ${namespace}.${key}`);
      return value;
    }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

const audiences = ["corporates", "smes", "startups", "professionals", "gba"] as const;

describe("Pathways route finder", () => {
  it.each(["en", "zh-HK"] as const)("offers the five audiences as one radio group, first chosen, in %s", async (locale) => {
    const {Pathways} = await import("@/components/home/pathways");
    render(await Pathways({locale}));

    const group = screen.getByRole("group", {name: bundles[locale].Home.pathways.legend});
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(5);
    // One name: arrow keys move between them and only one can be chosen.
    expect(new Set(radios.map((radio) => radio.getAttribute("name")))).toEqual(new Set(["home-route"]));
    expect(radios.map((radio) => (radio as HTMLInputElement).checked)).toEqual([true, false, false, false, false]);
    for (const [index, key] of audiences.entries()) {
      expect(radios[index]).toHaveAccessibleName(new RegExp(bundles[locale].Home.pathways.items[key].title));
    }
  });

  it("keeps the D-7 canonical primary destination for each audience, in order", async () => {
    const {Pathways} = await import("@/components/home/pathways");
    const {container} = render(await Pathways({locale: "en"}));

    const panels = [...container.querySelectorAll<HTMLElement>(".route-panel")];
    expect(panels.map((panel) => panel.dataset.route)).toEqual([...audiences]);
    expect(panels.map((panel) => panel.querySelector(".route-primary")?.getAttribute("href"))).toEqual([
      "/membership", "/events", "/showcase", "/membership", "/launchpad",
    ]);
    // Each radio's id is what the CSS :has() selector keys the panel on.
    for (const audience of audiences) expect(container.querySelector(`#route-${audience}`)).not.toBeNull();
  });

  it("routes only to pages that exist, three per audience", async () => {
    const {Pathways} = await import("@/components/home/pathways");
    const {container} = render(await Pathways({locale: "zh-HK"}));

    const known = new Set<string>(publicRoutes);
    const panels = [...container.querySelectorAll<HTMLElement>(".route-panel")];
    expect(panels).toHaveLength(5);
    for (const panel of panels) {
      const hrefs = [...panel.querySelectorAll(".route-destination")].map((link) => link.getAttribute("href"));
      expect(hrefs).toHaveLength(3);
      expect(new Set(hrefs).size, `${panel.dataset.route} repeats a destination`).toBe(3);
      for (const href of hrefs) expect(known.has(href ?? ""), `${panel.dataset.route} -> ${href}`).toBe(true);
    }
  });

  it("detects a destination that is not a public route", () => {
    // The guard above must be able to fail: a typo'd route is exactly what it exists to catch.
    const known = new Set<string>(publicRoutes);
    expect(known.has("/programmes")).toBe(true);
    expect(known.has("/programs")).toBe(false);
    expect(known.has("/members/directory")).toBe(false);
  });
});
