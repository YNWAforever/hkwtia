import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const {imagePriorities} = vi.hoisted(() => ({imagePriorities: [] as boolean[]}));

vi.mock("next-intl/server", async () => {
  const {readFileSync} = await import("node:fs");
  const {resolve} = await import("node:path");
  const bundles = {
    en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
    "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
  } as const;
  return {
    getTranslations: async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
      (key: string, values?: Record<string, string | number>) => {
        const value = key.split(".").reduce<unknown>(
          (current, segment) => (current as Record<string, unknown>)[segment],
          (bundles[locale] as Record<string, unknown>)[namespace],
        );
        return Object.entries(values ?? {}).reduce(
          (text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)),
          String(value),
        );
      },
  };
});
vi.mock("next/image", () => ({
  default: ({priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) => {
    imagePriorities.push(Boolean(priority));
    return <img {...props} data-priority={String(Boolean(priority))} />;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/events",
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
}));
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

import {SiteFooter} from "@/components/layout/site-footer";
import {SiteHeader} from "@/components/layout/site-header";

describe("public shell server surfaces", () => {
  it.each([
    ["en", "Events & Programmes", "Find an event", "Operated by WTIA"],
    ["zh-HK", "活動及計劃", "尋找活動", "由 WTIA 營運"],
  ] as const)("renders complete %s header copy", async (locale, group, action, operator) => {
    const view = render(await SiteHeader({locale}));
    expect(screen.getByText("WiseTech Hong Kong")).toBeInTheDocument();
    expect(screen.getByText(operator)).toBeInTheDocument();
    expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", {name: action}).length).toBeGreaterThan(0);
    expect(screen.getByRole("img", {name: "WTIA"})).toHaveAttribute("src", "/images/wtia-logo.png");
    expect(screen.getByRole("img", {name: "WTIA"})).toHaveAttribute("data-priority", "true");
    expect(imagePriorities).toContain(true);
    view.unmount();
  });

  it("derives every English footer journey anchor from the shared navigation model", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");
    const hrefs = within(footer).getAllByRole("link").map((link) => link.getAttribute("href"));
    for (const href of [
      "/events", "/launchpad", "/programs/hkict", "/programs/asa", "/programs/tct", "/programs/cpai",
      "/membership", "/showcase", "/news", "/ai-ops", "/ai-transparency", "/about", "/about/history",
      "/about/chairman", "/about/committees", "/contact", "/privacy",
    ]) expect(hrefs, href).toContain(href);
    expect(within(footer).queryByText(/newsletter/i)).not.toBeInTheDocument();
  });

  it("makes every footer route and contact control a 44px, wrapping-safe target", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");
    const targetHrefs = new Set([
      "/events", "/launchpad", "/programs/hkict", "/programs/asa", "/programs/tct", "/programs/cpai",
      "/membership", "/showcase", "/news", "/ai-ops", "/ai-transparency", "/about", "/about/history",
      "/about/chairman", "/about/committees", "/contact", "/privacy",
      "mailto:contact@hkwtia.org", "tel:+85229899164",
    ]);
    const targets = within(footer).getAllByRole("link").filter((link) =>
      targetHrefs.has(link.getAttribute("href") ?? ""),
    );

    expect(targets).toHaveLength(targetHrefs.size);
    for (const target of targets) {
      expect(target).toHaveClass("inline-flex", "min-h-11", "min-w-11", "max-w-full", "items-center", "break-words");
    }
  });

  it("keeps the public shell owner order and exactly one named main", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/layout.tsx"), "utf8");
    const ordered = ["skip-link", "<AnnouncementBar", "<SiteHeader", "<main id=\"main-content\"", "<SiteFooter", "<ConciergeWidget"];
    const positions = ordered.map((token) => source.indexOf(token));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source.match(/<main\b/g)).toHaveLength(1);
  });

  it("uses a non-landmark layout placeholder for the desktop navigation suspense fallback", () => {
    const source = readFileSync(resolve(process.cwd(), "components/layout/site-header.tsx"), "utf8");

    expect(source).not.toContain("fallback={<nav");
    expect(source).toContain('fallback={<div aria-hidden="true" className="hidden min-h-11 min-w-0 flex-1 lg:block" />}');
  });
});
