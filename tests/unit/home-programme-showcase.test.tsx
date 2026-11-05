import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
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

const expected = {
  en: {
    labels: ["CPAI", "Startup Award", "Tech to Connect", "Asia Smart App / Innovation Awards", "InsidW"],
    cpai: "View programme",
    hkictPrimary: "Award site",
    hkictSecondary: "On WTIA",
    tctPrimary: "Series site",
    tctSecondary: "On WTIA",
    asa: "View programme",
    insidw: "Visit InsidW",
  },
  "zh-HK": {
    labels: ["CPAI", "資訊科技初創企業獎", "Tech to Connect", "亞洲智能應用程式／智慧創新大獎", "InsidW"],
    cpai: "查看計劃",
    hkictPrimary: "獎項網站",
    hkictSecondary: "本會專頁",
    tctPrimary: "系列網站",
    tctSecondary: "本會專頁",
    asa: "查看計劃",
    insidw: "前往 InsidW",
  },
} as const;

describe("ProgrammeShowcase", () => {
  it.each(["en", "zh-HK"] as const)("renders five flagships in gate order with the approved CTAs in %s", async (locale) => {
    const copy = expected[locale];
    const {ProgrammeShowcase} = await import("@/components/home/programme-showcase");
    render(await ProgrammeShowcase({locale}));

    const cards = [...document.querySelectorAll(".programme-card")];
    expect(cards).toHaveLength(5);
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual([...copy.labels]);
    expect(screen.queryByRole("heading", {name: "HKICT Awards"})).toBeNull();
    expect(document.body.innerHTML).not.toContain("bestasiaapp");

    const cpai = cardNamed(copy.labels[0]);
    expect(onlyLink(cpai)).toHaveAttribute("href", "/programs/cpai");
    expect(onlyLink(cpai)).toHaveTextContent(copy.cpai);
    expect(onlyLink(cpai)).not.toHaveAttribute("target");

    const hkict = cardNamed(copy.labels[1]);
    const hkictLinks = within(hkict).getAllByRole("link");
    expect(hkictLinks).toHaveLength(2);
    expect(hkictLinks[0]).toHaveAttribute("href", "https://www.ictstartupaward.com/");
    expect(hkictLinks[0]).toHaveAttribute("target", "_blank");
    expect(hkictLinks[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(hkictLinks[0]).toHaveTextContent(copy.hkictPrimary);
    expect(hkictLinks[1]).toHaveAttribute("href", "/programs/hkict");
    expect(hkictLinks[1]).toHaveTextContent(copy.hkictSecondary);
    expect(hkictLinks[1]).not.toHaveAttribute("target");

    const tct = cardNamed(copy.labels[2]);
    const tctLinks = within(tct).getAllByRole("link");
    expect(tctLinks[0]).toHaveAttribute("href", "https://techtoconnect.net/");
    expect(tctLinks[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(tctLinks[0]).toHaveTextContent(copy.tctPrimary);
    expect(tctLinks[1]).toHaveAttribute("href", "/programs/tct");
    expect(tctLinks[1]).toHaveTextContent(copy.tctSecondary);

    const asa = cardNamed(copy.labels[3]);
    expect(within(asa).getAllByRole("link")).toHaveLength(1);
    expect(onlyLink(asa)).toHaveAttribute("href", "/programs/asa");
    expect(onlyLink(asa)).toHaveTextContent(copy.asa);
    expect(onlyLink(asa)).not.toHaveAttribute("target");

    const insidw = cardNamed(copy.labels[4]);
    expect(within(insidw).getAllByRole("link")).toHaveLength(1);
    expect(onlyLink(insidw)).toHaveAttribute("href", "https://insidw.com/");
    expect(onlyLink(insidw)).toHaveAttribute("target", "_blank");
    expect(onlyLink(insidw)).toHaveAttribute("rel", "noopener noreferrer");
    expect(onlyLink(insidw)).toHaveTextContent(copy.insidw);
  });
});

function cardNamed(name: string): HTMLElement {
  const card = screen.getByRole("heading", {name}).closest("article");
  if (!(card instanceof HTMLElement)) throw new Error(`missing card ${name}`);
  return card;
}

function onlyLink(card: HTMLElement): HTMLElement {
  return within(card).getByRole("link");
}
