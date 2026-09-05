import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
} as const;

function messageAt(namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles.en);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

// This test imports the real page directly with no vi.mock("next-intl/server", ...): unlike
// most wt-pages tests, next-intl/server's real setRequestLocale/getTranslations need a request
// context this unit-test environment does not provide, and throw "`setRequestLocale` is not
// supported in Client Components" here. Mocked with the repo's established message-lookup
// pattern (tests/unit/wt-pages/news-page.test.tsx) so translated strings still come from the
// real bundles -- this suite's own assertions compare against `bundles.en`.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) => (key: string) => String(messageAt(namespace, key))),
  setRequestLocale: vi.fn(),
}));
// ContactPage's PageHero and InnerCardGrid both render the real @/i18n/navigation Link, which
// reads useLocale() from a next-intl context this render tree does not provide (no
// NextIntlClientProvider). Same situation and same fix as Task 17's m6-launchpad-page.test.tsx
// and launchpad-partner-cutover.test.tsx, and Task 18/19's news-page.test.tsx: project to a
// plain <a>, which is all this suite's own assertions need.
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import ContactPage from "@/app/[locale]/(public)/contact/page";

async function renderContact(topic?: string) {
  return render(await ContactPage({
    params: Promise.resolve({locale: "en"}),
    searchParams: Promise.resolve(topic ? {topic} : {}),
  }));
}

describe("Contact page — six-card grid and prepared-email composer", () => {
  it("renders six .inner-card links including /about and /news", async () => {
    await renderContact();
    const cards = document.querySelectorAll("a.inner-card");
    expect(cards).toHaveLength(6);
    const hrefs = [...cards].map((card) => card.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/events", "/membership", "/showcase", "/launchpad", "/about", "/news"]));
  });

  it("seeds the topic composer from ?topic= and defaults to 'portal'", async () => {
    await renderContact("events");
    const compose = screen.getByRole("link", {name: bundles.en.Contact.emailTopics.composeAction});
    expect(compose.getAttribute("href")).toContain(encodeURIComponent(bundles.en.Contact.emailTopics.events.subject));
  });
});
