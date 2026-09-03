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
  const root = namespace.split(".").reduce<unknown>(
    (value, part) => (value as Record<string, unknown> | undefined)?.[part],
    bundles[locale],
  );
  return key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], root);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("next/image", () => ({
  default: ({alt, src, priority, fill, ...props}: {
    alt: string;
    src: string;
    priority?: boolean;
    fill?: boolean;
  }) => {
    void fill;
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} data-priority={priority ? "true" : undefined} src={src} {...props} />;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("Hero", () => {
  it.each(["en", "zh-HK"] as const)("renders the donor top-scrim hero over the placeholder photo in %s", async (locale) => {
    const {Hero} = await import("@/components/home/hero");
    render(await Hero({locale}));

    const heading = screen.getByRole("heading", {level: 1, name: bundles[locale].Home.hero.title});
    expect(heading).toHaveAttribute("id", "hero-title");
    const section = heading.closest("section")!;
    expect(section).toHaveAttribute("aria-labelledby", "hero-title");
    expect(section).toHaveClass("hero");
    expect(section.querySelector(".hero-scrim")).not.toBeNull();
    expect(section.querySelector(".network-field")).not.toBeNull();

    const image = screen.getByRole("img", {name: bundles[locale].Home.hero.imageAlt});
    expect(image).toHaveAttribute("src", "/images/projects-hero.jpg");
    expect(image).toHaveClass("hero-image");
    expect(image).toHaveAttribute("data-priority", "true");
    expect(image).toHaveAttribute("sizes", "100vw");

    const actions = section.querySelectorAll(".hero-actions a");
    expect(actions).toHaveLength(3);
    expect(actions[0]).toHaveAttribute("href", "/events?status=open");
    expect(actions[1]).toHaveAttribute("href", "/join");
    expect(actions[2]).toHaveAttribute("href", "/showcase");

    const discover = screen.getByRole("link", {name: new RegExp(bundles[locale].Home.hero.discover)});
    expect(discover).toHaveAttribute("href", "#home-discover");
    expect(discover).toHaveClass("hero-scroll");
  });
});
