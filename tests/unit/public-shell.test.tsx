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
  const read = (locale: "en" | "zh-HK", namespace: string, key: string) =>
    key.split(".").reduce<unknown>(
      (current, segment) => (current as Record<string, unknown>)[segment],
      (bundles[locale] as Record<string, unknown>)[namespace],
    );
  return {
    // `raw` as well as the callable: the footer reads `Footer.addressLines` (an array) and
    // `Footer.newsletter.mailBody` (which carries a literal `{email}` the island interpolates),
    // and next-intl resolves neither through `t()`.
    getTranslations: async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
      Object.assign(
        (key: string, values?: Record<string, string | number>) =>
          Object.entries(values ?? {}).reduce(
            (text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)),
            String(read(locale, namespace, key)),
          ),
        {raw: (key: string) => read(locale, namespace, key)},
      ),
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

import {MegaMenuPanel} from "@/components/layout/mega-menu-panel";
import {SiteFooter} from "@/components/layout/site-footer";
import {SiteHeader} from "@/components/layout/site-header";
import {localizeNavigation} from "@/config/navigation";

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

    // Every slot is now pinned to the element the shipped header actually renders. The loose
    // "either spelling" markers this test used to carry were scaffolding for Tasks 4 and 5,
    // which owned the desktop navigation and the mobile trigger; both landed in this branch,
    // so the donor classes are the real markup and a rename has to fail here.
    const slots = {
      headerInner: markup.indexOf('class="header-inner"'),
      brand: markup.indexOf('class="brand'),
      desktopNav: markup.indexOf('<nav class="desktop-nav"'),
      actions: markup.indexOf('class="header-actions"'),
      search: markup.indexOf('class="search-link"'),
      language: markup.indexOf("language-link"),
      signIn: markup.indexOf('class="signin-link"'),
      join: markup.indexOf("button button-small"),
      mobileTrigger: markup.indexOf('class="mobile-trigger"'),
    };
    // The trigger's accessible name is part of the slot, not a fallback for finding it.
    expect(markup).toContain(`aria-label="${openMenuLabel}"`);

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
    expect(within(footer).getByRole("heading", {level: 2, name: "What should Hong Kong build next?"}))
      .toBeInTheDocument();
  });

  it("makes every footer route and contact control a 44px, wrapping-safe target", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");
    const expectedHrefs = [
      "/events", "/launchpad", "/programs/hkict", "/programs/asa", "/programs/tct", "/programs/cpai",
      "/membership", "/showcase", "/news", "/ai-ops", "/ai-transparency", "/about", "/about/history",
      "/about/chairman", "/about/committees", "/contact", "/privacy",
      // The Membership column carries the two action destinations as well; without them here a
      // dropped Join or Member sign-in link would leave the sweep untouched.
      "/join", "/portal",
      "mailto:contact@hkwtia.org",
    ];
    const targetHrefs = new Set(expectedHrefs);
    const targets = within(footer).getAllByRole("link").filter((link) =>
      targetHrefs.has(link.getAttribute("href") ?? ""),
    );

    // A cardinality check passed a swap: pointing the member sign-in entry at the join href
    // dropped /portal from the footer and duplicated /join, leaving the total at 20. The sorted
    // multiset is the every-leaf-once property this test claims, and it names the two hrefs.
    expect(targets.map((target) => target.getAttribute("href")).sort())
      .toEqual([...expectedHrefs].sort());
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

  it.each([
    ["events-programmes", "See what is open before you plan.", "Browse what is open", "/events", true],
    ["membership-ecosystem", "Bring a real business need into the network.", "Submit a challenge", "/contact", false],
    ["impact-insights", "Practical progress needs responsible choices.", "AI transparency", "/ai-transparency", false],
    ["about-wtia", "Read the association's own record.", "Read the history", "/about/history", false],
  ] as const)("gives %s a heading, titled columns and a feature aside", (groupId, title, cta, href, eventFirst) => {
    const groups = localizeNavigation((key) => key).groups;
    const group = groups.find(({id}) => id === groupId)!;
    const {container} = render(
      <MegaMenuPanel
        group={{
          ...group,
          label: "Group label",
          feature: {label: "Status", title, copy: "Feature copy", cta, href},
        }}
        exploreLabel="Explore"
        viewOverviewLabel="View overview"
        pathname="/events"
        onNavigate={() => undefined}
      />,
    );

    const panel = container.querySelector(".mega-menu-v2")!;
    expect(panel.classList.contains("mega-event")).toBe(eventFirst);
    expect(within(panel as HTMLElement).getByText("Explore")).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText("Group label").tagName).toBe("STRONG");
    expect(within(panel as HTMLElement).getByRole("link", {name: "View overview"}))
      .toHaveAttribute("href", group.landingHref);

    expect(panel.querySelectorAll(".mega-column")).toHaveLength(group.columns.length);
    expect(panel.querySelectorAll(".mega-column-title")).toHaveLength(group.columns.length);

    const aside = panel.querySelector(".mega-feature-v2")!;
    expect(within(aside as HTMLElement).getByText("Status")).toHaveClass("status-label");
    expect(within(aside as HTMLElement).getByText(title).tagName).toBe("STRONG");
    expect(within(aside as HTMLElement).getByText("Feature copy")).toBeInTheDocument();
    expect(within(aside as HTMLElement).getByRole("link", {name: cta})).toHaveAttribute("href", href);
  });

  it("marks the exact current leaf inside a panel", () => {
    const group = localizeNavigation((key) => key).groups[0]!;
    const {container} = render(
      <MegaMenuPanel
        group={group}
        exploreLabel="Explore"
        viewOverviewLabel="View overview"
        pathname="/events"
        onNavigate={() => undefined}
      />,
    );
    const links = [...container.querySelectorAll(".mega-column a")];
    const marked = links.filter((link) => link.getAttribute("aria-current") === "page");
    // Both halves have to name the same element. Asserting "exactly one is marked" and "the
    // first leaf is /events" separately let the mark land on any other leaf and still pass.
    expect(marked).toHaveLength(1);
    expect(marked[0]).toBe(links[0]);
    expect(marked[0]).toHaveAttribute("href", "/events");
  });

  it("marks the event-first trigger and keeps the trigger hook", async () => {
    const markup = renderToStaticMarkup(await SiteHeader({locale: "en", hasAnnouncement: true}));
    expect(markup).toContain("nav-button event-first");
    expect(markup).toContain('data-navigation-trigger="events-programmes"');
    expect(markup).toContain('class="desktop-nav"');
  });
});
