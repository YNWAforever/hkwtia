import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

const {imagePriorities, pathnameState} = vi.hoisted(() => ({
  imagePriorities: [] as boolean[],
  pathnameState: {current: "/events"},
}));

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
  usePathname: () => pathnameState.current,
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
}));
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

import {SiteFooter} from "@/components/layout/site-footer";
import {SiteHeader} from "@/components/layout/site-header";

describe("public shell server surfaces", () => {
  it.each([
    ["en", "Events & Programmes", "Join WiseTech", "The evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association", "Search WiseTech"],
    ["zh-HK", "活動及計劃", "加入 WiseTech", "Hong Kong Wireless Technology Industry Association 持續發展中的 AI+ 產業平台 · 中文法定名稱待正式批准", "搜尋 WiseTech"],
  ] as const)("renders complete %s header copy", async (locale, group, join, descriptor, search) => {
    const view = render(await SiteHeader({locale, hasAnnouncement: true}));
    expect(screen.getByText("WiseTech Hong Kong")).toBeInTheDocument();
    expect(screen.getByText(descriptor)).toBeInTheDocument();
    expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", {name: join})).toHaveAttribute("href", "/join");
    expect(screen.getByRole("link", {name: search})).toHaveAttribute("href", "/showcase");
    expect(screen.getByRole("img", {name: "WTIA"})).toHaveAttribute("src", "/images/wtia-logo.png");
    expect(screen.getByRole("img", {name: "WTIA"})).toHaveAttribute("data-priority", "true");
    expect(imagePriorities).toContain(true);
    view.unmount();
  });

  it("carries the route's variant and the announcement modifier on the header element", async () => {
    pathnameState.current = "/";
    const overlay = renderToStaticMarkup(await SiteHeader({locale: "en", hasAnnouncement: true}));
    expect(overlay).toContain('data-variant="overlay"');
    expect(overlay).toContain('class="site-header"');

    pathnameState.current = "/events";
    const solid = renderToStaticMarkup(await SiteHeader({locale: "en", hasAnnouncement: false}));
    expect(solid).toContain('data-variant="solid"');
    expect(solid).toContain("site-header no-announcement");
  });

  it("emits the donor's header slots in order inside .header-inner", async () => {
    pathnameState.current = "/";
    const markup = renderToStaticMarkup(await SiteHeader({locale: "en", hasAnnouncement: true}));
    const openMenuLabel = (JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")) as {
      Navigation: {openMenu: string};
    }).Navigation.openMenu;

    // Each slot is identified by the marker that survives Tasks 4 and 5: those tasks own what
    // the desktop navigation and the mobile trigger render inside, so the earliest of either
    // spelling — today's element or the donor class it is moving to — stands for the slot.
    const earliestOf = (...markers: string[]) => {
      const found = markers.map((marker) => markup.indexOf(marker)).filter((index) => index >= 0);
      return found.length === 0 ? -1 : Math.min(...found);
    };
    const slots = {
      headerInner: markup.indexOf('class="header-inner"'),
      brand: markup.indexOf('class="brand'),
      desktopNav: earliestOf("desktop-nav", "<nav"),
      actions: markup.indexOf('class="header-actions"'),
      search: markup.indexOf('class="search-link"'),
      language: markup.indexOf("language-link"),
      signIn: markup.indexOf('class="signin-link"'),
      join: markup.indexOf("button button-small"),
      mobileTrigger: earliestOf("mobile-trigger", `aria-label="${openMenuLabel}"`),
    };

    for (const [slot, index] of Object.entries(slots)) expect(index, slot).toBeGreaterThan(-1);
    const order = Object.values(slots);
    expect(order).toEqual([...order].sort((first, second) => first - second));
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
    expect(source).toContain('fallback={<div aria-hidden="true" className="desktop-nav" />}');
    expect(source).toContain("<HeaderShell hasAnnouncement={hasAnnouncement}>");
  });
});
