import {readFileSync} from "node:fs";

import {fireEvent, render, screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import ContactPage from "@/app/[locale]/(public)/contact/page";
import {ContactConciergeLauncher} from "@/components/marketing/contact-concierge-launcher";
import {
  CONCIERGE_OPEN_EVENT,
  openConcierge,
} from "@/lib/ai/concierge-open";

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
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
    expect(en).toContain('href="tel:+85229899164"');
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
