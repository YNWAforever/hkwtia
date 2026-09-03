import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

import {milestones} from "@/content/milestones";
import {featuredOnly} from "@/lib/history/milestones";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

// Real milestone titles (e.g. `WTIA "20+1st" Anniversary celebration...`) contain
// regex metacharacters, so a literal RegExp built from the title needs escaping to
// match the text rather than misinterpreting it as a pattern.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("next/image", () => ({
  default: ({alt, src, ...props}: {alt: string; src: string}) => <img alt={alt} src={src} {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("ArchiveStories", () => {
  it("renders one card per featured milestone that has an image, capped at 4, linking to its history page", async () => {
    const {ArchiveStories} = await import("@/components/home/archive-stories");
    render(await ArchiveStories({locale: "en"}));

    const featured = featuredOnly(milestones).filter((milestone) => milestone.images.length > 0);
    const cards = document.querySelectorAll(".archive-photo-card");
    expect(cards).toHaveLength(Math.min(4, featured.length));

    const first = featured[0]!;
    expect(screen.getByRole("heading", {level: 3, name: first.titleEn})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: new RegExp(escapeRegExp(first.titleEn))})).toHaveAttribute("href", `/about/history/${first.slug}`);
    expect(screen.getByRole("link", {name: bundles.en.Home.archiveStories.galleryAction})).toHaveAttribute("href", "https://hkwtia.org/photo-gallery/");
  });

  it("renders nothing when no featured milestone has an image", async () => {
    vi.doMock("@/content/milestones", () => ({milestones: []}));
    vi.resetModules();
    const {ArchiveStories} = await import("@/components/home/archive-stories");
    const element = await ArchiveStories({locale: "en"});

    expect(element).toBeNull();
    vi.doUnmock("@/content/milestones");
  });
});
