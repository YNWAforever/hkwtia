import {NextIntlClientProvider} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {expect, it, vi} from "vitest";
import type {ReactNode} from "react";
vi.mock("next/navigation", () => ({usePathname: () => "/membership", useRouter: () => ({}), redirect: vi.fn(), permanentRedirect: vi.fn()}));
vi.mock("next/link", () => ({default: ({href, children}: {href: string; children: ReactNode}) => <a href={href}>{children}</a>}));
import {ActionLink} from "@/components/wt/action-link";
it.each([["en", ""], ["zh-HK", "/zh"]] as const)("keeps actual next-intl membership links in %s", (locale, prefix) => {
  const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={{}} timeZone="Asia/Hong_Kong"><ActionLink href="/join?plan=startup">Join</ActionLink><ActionLink href="/portal/billing">Billing</ActionLink></NextIntlClientProvider>);
  expect(html).toContain(`href="${prefix}/join?plan=startup"`);
  expect(html).toContain(`href="${prefix}/portal/billing"`);
});
