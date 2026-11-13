import {render, screen, within} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

/**
 * `route` steers the shared pathname the footer's client island reads during render, and
 * `rawOverrides` replaces one `t.raw` value with a shape the bundles do not carry. Both are
 * hoisted so the `vi.mock` factories below — which run before this module's own body — can
 * close over them; a value captured at module load could not be changed between two renders
 * of the same mounted tree, which is exactly what a soft navigation is.
 */
const {route, rawOverrides} = vi.hoisted(() => ({
  route: {pathname: "/"},
  rawOverrides: new Map<string, unknown>(),
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
    getTranslations: async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
      Object.assign(
        (key: string, values?: Record<string, string | number>) =>
          Object.entries(values ?? {}).reduce(
            (text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)),
            String(read(locale, namespace, key)),
          ),
        {
          raw: (key: string) => rawOverrides.has(`${namespace}.${key}`)
            ? rawOverrides.get(`${namespace}.${key}`)
            : read(locale, namespace, key),
        },
      ),
  };
});
vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) => <img {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

import {SiteFooter} from "@/components/layout/site-footer";
import {siteConfig} from "@/config/site";

beforeEach(() => {
  route.pathname = "/";
  rawOverrides.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("SiteFooter", () => {
  it("renders four donor columns, the address and the bottom row", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");

    const columns = footer.querySelectorAll(".footer-links > div");
    expect(columns).toHaveLength(4);
    expect([...columns].map((column) => column.querySelector("strong")?.textContent)).toEqual([
      "Explore", "Membership", "About", "Contact",
    ]);

    // The printed address is `Footer.addressLines` from the message bundle, never
    // config/site.ts. The old assertion looped over `siteConfig.contact.addressLines` and so
    // proved nothing about the bundle: it passed because the English bundle happens to carry
    // the same three lines. Both are pinned now -- what the footer prints, and the config
    // record it has to agree with in English -- and the Chinese list, which is a different,
    // shorter list, has a case of its own below (errata E-68).
    expect(footer.querySelector("address")).toBeNull();
    expect([...siteConfig.contact.addressLines]).toEqual([]);
    expect(within(footer).getByRole("link", {name: siteConfig.contact.email}))
      .toHaveAttribute("href", `mailto:${siteConfig.contact.email}`);
    expect(footer.querySelector('a[href^="tel:"]')).toBeNull();
    expect(siteConfig.contact.phone).toBeUndefined();

    expect(within(footer).getByRole("link", {name: "WTIA on Facebook"})).toHaveAttribute("href", "https://www.facebook.com/wtiawdc");
    expect(within(footer).getByRole("link", {name: "WTIA on LinkedIn"})).toHaveAttribute("href", "https://www.linkedin.com/company/hkwtia");
    expect(within(footer).getByRole("link", {name: "WTIA on YouTube"})).toHaveAttribute("href", "https://www.youtube.com/channel/UCEzOTl6KhFFeQQ8O09Y-ndA");
    expect(within(footer).getByRole("link", {name: "WTIA on Instagram"})).toHaveAttribute("href", "https://www.instagram.com/hkwtia/");
    for (const name of ["WTIA on Facebook", "WTIA on LinkedIn", "WTIA on YouTube", "WTIA on Instagram"]) {
      const link = within(footer).getByRole("link", {name});
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(footer.querySelector("iframe")).toBeNull();
    expect(within(footer).getByText("Technology + Wisdom. Hong Kong + The World.")).toBeInTheDocument();
    expect(within(footer).getByRole("link", {name: "Privacy statement"})).toHaveAttribute("href", "/privacy");
    expect(within(footer).getByRole("button", {name: "中文, Switch to Chinese"})).toBeInTheDocument();
    expect(within(footer).getByRole("link", {name: "Media & Press"})).toHaveAttribute("href", "/media-and-press-coverage");
    expect(within(footer).queryByRole("link", {name: /terms|accessibility/i})).toBeNull();
    expect(footer.querySelector(".footer-bottom small")?.textContent)
      .toContain(`© ${new Date().getFullYear()} WTIA.`);
  });

  /**
   * The conditional in components/layout/site-footer.tsx:162 exists for a future unset phone
   * — `SiteContact.phone` stays optional in config/site.ts precisely so that state can recur —
   * and app/[locale]/(public)/contact/page.tsx mirrors the same check. Neither branch had a
   * regression test for the unset case, so a later edit that dropped the `undefined` guard (and
   * crashed the public page per CLAUDE.md's "degrade, not 500" rule) would have shipped green.
   * Mutating the shared config for one render and restoring it afterward is the accepted
   * pattern in this file (see the deleted `phone`-mutation test this replaces, and its footer
   * counterpart in tests/unit/contact-concierge-launcher.test.tsx).
   */
  it("omits the tel: line when phone is unset", async () => {
    const contact = siteConfig.contact as {phone?: string};
    const original = contact.phone;
    delete contact.phone;
    try {
      render(await SiteFooter({locale: "en"}));
      const footer = screen.getByRole("contentinfo");
      expect(within(footer).queryByRole("link", {name: /^\+852/})).toBeNull();
      expect(footer.querySelector('a[href^="tel:"]')).toBeNull();
    } finally {
      contact.phone = original;
    }
  });

  /**
   * The Chinese address was never pinned. It is not a translation of the English three lines --
   * it is two lines in Chinese address order -- so a bundle edit could have shortened, reordered
   * or emptied it and every footer assertion would have stayed green (errata E-68).
   */
  it("prints no Chinese address while the postal address is unconfirmed", async () => {
    render(await SiteFooter({locale: "zh-HK"}));
    expect(screen.getByRole("contentinfo").querySelector("address")).toBeNull();
  });

  it("shows a contact line and no subscribe form", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("heading", {level: 2, name: "Questions? contact@hkwtia.org"})).toBeInTheDocument();
    expect(footer.querySelector("form")).toBeNull();
    expect(within(footer).queryByLabelText("Work email")).toBeNull();
  });

  it("keeps the Chinese footer bilingual", async () => {
    render(await SiteFooter({locale: "zh-HK"}));
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", {name: "WTIA Facebook"})).toHaveAttribute("href", "https://www.facebook.com/wtiawdc");
    expect(within(footer).getByRole("link", {name: "WTIA Instagram"})).toHaveAttribute("href", "https://www.instagram.com/hkwtia/");
    expect(within(footer).getByText("探索")).toBeInTheDocument();
    expect(footer.querySelector("address")).toBeNull();
    expect(within(footer).getByText("科技 + 智慧。香港 + 世界。")).toBeInTheDocument();
    expect(within(footer).getByRole("link", {name: "傳媒報道"})).toHaveAttribute("href", "/media-and-press-coverage");
  });
});
