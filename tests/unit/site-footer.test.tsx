import {render, screen, within, fireEvent} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

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
        {raw: (key: string) => read(locale, namespace, key)},
      ),
  };
});
vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) => <img {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

import {SiteFooter} from "@/components/layout/site-footer";
import {siteConfig} from "@/config/site";

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  vi.spyOn(window, "location", "get").mockReturnValue({...window.location, assign} as unknown as Location);
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

    const address = footer.querySelector("address")!;
    for (const line of siteConfig.contact.addressLines) expect(address.textContent).toContain(line);
    expect(within(footer).getByRole("link", {name: siteConfig.contact.email}))
      .toHaveAttribute("href", `mailto:${siteConfig.contact.email}`);
    expect(footer.querySelector('a[href^="tel:"]')).toBeNull();
    expect(siteConfig.contact.phone).toBeUndefined();

    expect(within(footer).getByText("Technology + Wisdom. Hong Kong + The World.")).toBeInTheDocument();
    expect(within(footer).getByRole("link", {name: "Privacy statement"})).toHaveAttribute("href", "/privacy");
    expect(within(footer).getByRole("button", {name: "Switch to Chinese"})).toBeInTheDocument();
    expect(within(footer).queryByRole("link", {name: /terms|accessibility/i})).toBeNull();
    expect(footer.querySelector(".footer-bottom small")?.textContent)
      .toContain(`© ${new Date().getFullYear()} WiseTech Hong Kong.`);
  });

  /**
   * The unset phone is a decision, not an oversight (see config/site.ts), so no shipped input
   * reaches the `tel:` branch and the assertion above would pass just as happily against a
   * footer that could never render one. Setting the number on the shared record for a single
   * render is what makes that assertion mean something — and it pins the space-stripping the
   * href needs, which the rendered label deliberately keeps.
   */
  it("renders the tel: line once a phone is configured", async () => {
    const contact = siteConfig.contact as {phone?: string};
    contact.phone = "+852 2989 9164";
    try {
      render(await SiteFooter({locale: "en"}));
      expect(within(screen.getByRole("contentinfo")).getByRole("link", {name: "+852 2989 9164"}))
        .toHaveAttribute("href", "tel:+85229899164");
    } finally {
      delete contact.phone;
    }
  });

  it("prepares an email instead of subscribing, and reports both outcomes", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");
    const input = within(footer).getByLabelText("Work email");
    // Degradation, not decoration: with JavaScript off the submit reaches the same address the
    // island composes rather than doing nothing.
    expect(input.closest("form")).toHaveAttribute("action", `mailto:${siteConfig.contact.email}`);

    fireEvent.change(input, {target: {value: "not-an-email"}});
    fireEvent.click(within(footer).getByRole("button", {name: "Prepare activity-update email"}));
    expect(within(footer).getByRole("alert")).toHaveTextContent("Enter a valid work email.");
    expect(assign).not.toHaveBeenCalled();

    fireEvent.change(input, {target: {value: "reader@example.com"}});
    fireEvent.click(within(footer).getByRole("button", {name: "Prepare activity-update email"}));
    expect(within(footer).getByRole("status")).toHaveTextContent("This page does not create a subscription automatically.");
    expect(assign).toHaveBeenCalledTimes(1);
    const target = assign.mock.calls[0]![0] as string;
    expect(target.startsWith(`mailto:${siteConfig.contact.email}?`)).toBe(true);
    expect(decodeURIComponent(target)).toContain("reader@example.com");
    expect(within(footer).queryByRole("alert")).toBeNull();
  });

  it("keeps the Chinese footer bilingual", async () => {
    render(await SiteFooter({locale: "zh-HK"}));
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("探索")).toBeInTheDocument();
    expect(footer.querySelector("address")!.textContent).toContain("KOHO");
    expect(within(footer).getByText("Technology + Wisdom. Hong Kong + The World.")).toBeInTheDocument();
  });
});
