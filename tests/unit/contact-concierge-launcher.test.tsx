import {readFileSync} from "node:fs";

import {fireEvent, render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import ContactPage from "@/app/[locale]/(public)/contact/page";
import {ContactConciergeLauncher} from "@/components/marketing/contact-concierge-launcher";
import {siteConfig} from "@/config/site";
import {
  CONCIERGE_OPEN_EVENT,
  openConcierge,
} from "@/lib/ai/concierge-open";

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
}));
// Task 19: the rewritten Contact page's PageHero and InnerCardGrid render the real
// @/i18n/navigation Link, which reads useLocale() from a next-intl context this suite's plain
// renderToStaticMarkup call provides no NextIntlClientProvider for. Same situation and same
// fix as Task 17's m6-launchpad-page.test.tsx and launchpad-partner-cutover.test.tsx: project
// to a plain <a>, which is all this suite's own assertions (on rendered href values) need.
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

async function renderContact(locale: "en" | "zh-HK"): Promise<string> {
  return renderToStaticMarkup(await ContactPage({
    params: Promise.resolve({locale}),
  }));
}

describe("Contact durable journeys and Concierge launcher", () => {
  it("renders durable contact channels and four localized route cards without an inquiry form", async () => {
    const en = await renderContact("en");
    const zh = await renderContact("zh-HK");

    expect(en).toContain('href="mailto:contact@hkwtia.org"');
    expect(siteConfig.contact.phone).toBeDefined();
    expect(en).toContain(`href="tel:${siteConfig.contact.phone!.replace(/\s/g, "")}"`);
    expect(en).toContain(siteConfig.contact.phone!);
    // Config-derived assertions above would still pass if config/site.ts itself carried a typo
    // (e.g. a transposed digit) — this literal is the one check that would catch that.
    expect(en).toContain('+852 2989 9164');
    expect(en).toContain('href="/events"');
    expect(en).toContain('href="/membership"');
    expect(en).toContain('href="/showcase"');
    expect(en).toContain('href="/launchpad"');
    expect(en).not.toMatch(/<form\b/);

    expect(zh).toContain('href="/zh/events"');
    expect(zh).toContain('href="/zh/membership"');
    expect(zh).toContain('href="/zh/showcase"');
    expect(zh).toContain('href="/zh/launchpad"');
    expect(zh).not.toMatch(/<form\b/);
  });

  /**
   * app/[locale]/(public)/contact/page.tsx:55-58 mirrors the footer's `phone === undefined`
   * guard (components/layout/site-footer.tsx:162) rather than asserting the field is present.
   * `SiteContact.phone` stays optional in config/site.ts for exactly this state, and CLAUDE.md's
   * "public pages degrade rather than 500" rule makes an unguarded `!` here a page-crashing
   * regression, not a lint nit. This proves the guarded branch: the page still renders, still
   * carries the mailto: link, and prints no tel: link at all when phone is unset.
   */
  it("renders without a tel: link when phone is unset, instead of throwing", async () => {
    const contact = siteConfig.contact as {phone?: string};
    const original = contact.phone;
    delete contact.phone;
    try {
      const en = await renderContact("en");
      expect(en).toContain('href="mailto:contact@hkwtia.org"');
      expect(en).not.toContain('href="tel:');
    } finally {
      contact.phone = original;
    }
  });

  it("dispatches one no-payload same-window event from a native 44px launcher", () => {
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener(CONCIERGE_OPEN_EVENT, listener);

    render(<ContactConciergeLauncher label="Ask WiseTech" />);
    const launcher = screen.getByRole("button", {name: "Ask WiseTech"});
    expect(launcher).toHaveAttribute("type", "button");
    expect(launcher).toHaveClass("min-h-11", "min-w-11");
    fireEvent.click(launcher);

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(Event);
    expect(events[0]).not.toBeInstanceOf(CustomEvent);
    window.removeEventListener(CONCIERGE_OPEN_EVENT, listener);
  });

  it("keeps one existing API runtime while the launcher stays presentation-only", () => {
    const widgetSource = readFileSync(
      "components/ai/concierge-widget.tsx",
      "utf8",
    );
    const launcherSource = readFileSync(
      "components/marketing/contact-concierge-launcher.tsx",
      "utf8",
    );
    const contractSource = readFileSync("lib/ai/concierge-open.ts", "utf8");
    const contactSource = readFileSync(
      "app/[locale]/(public)/contact/page.tsx",
      "utf8",
    );

    expect(widgetSource).toContain(
      "removeEventListener(CONCIERGE_OPEN_EVENT",
    );
    expect(widgetSource.match(/\/api\/ai\/concierge/g)).toHaveLength(1);
    expect(launcherSource).not.toContain("fetch(");
    expect(launcherSource).not.toContain("/api/ai/concierge");
    expect(launcherSource).not.toContain("ConciergeWidget");
    expect(contractSource).toContain("new Event(CONCIERGE_OPEN_EVENT)");
    expect(contractSource).not.toContain("CustomEvent");
    expect(contractSource).not.toContain("detail:");
    expect(contactSource).not.toContain("<form");
    expect(contactSource).not.toContain("ConciergeWidget");
    expect(openConcierge).toBeTypeOf("function");
  });

  it("provides matching localized route-card and launcher messages", () => {
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")).Contact;
    const zh = JSON.parse(readFileSync("messages/zh-HK.json", "utf8")).Contact;

    expect(en).toMatchObject({
      address: "4/F, KOHO, 73-75 Hung To Road, Kwun Tong, Hong Kong",
      routesTitle: "Choose the right next step",
      routes: {
        events: {title: "Events and activities"},
        membership: {title: "Membership"},
        showcase: {title: "Members and solutions"},
        launchpad: {title: "Launch Pad"},
      },
      conciergeLauncher: "Ask WiseTech",
    });
    expect(zh).toMatchObject({
      address: "香港觀塘鴻圖道 73-75 號 KOHO 4 樓",
      routesTitle: "選擇合適的下一步",
      routes: {
        events: {title: "活動及交流"},
        membership: {title: "會員計劃"},
        showcase: {title: "會員及方案"},
        launchpad: {title: "創科加速平台"},
      },
      // Unified with Concierge.launcher in 4158b40: the shell launcher and this page's
      // launcher are the same control to a reader, so they carry one label.
      conciergeLauncher: "問 WiseTech",
    });
  });
});
