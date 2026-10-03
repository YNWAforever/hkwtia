import {readFileSync} from "node:fs";
import {render, screen} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ReactElement, ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({locale: "en", unauthorized: false, getMessages: vi.fn()}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: (locale: string) => {state.locale = locale;},
  getMessages: state.getMessages,
  getTranslations: async () => Object.assign((key: string) => key, {raw: (key: string) => key}),
}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: async () => {
  if(state.unauthorized) throw Error("UNAUTHORIZED");
  return {kind: "staff", userId: "synthetic-auth", profileId: "synthetic-profile"};
}}));
vi.mock("@/lib/auth/actor", () => ({requireActor: async () => {
  if(state.unauthorized) throw Error("PROVIDER_UNAVAILABLE");
  return {kind: "member", userId: "synthetic-auth", profileId: "synthetic-profile"};
}}));
vi.mock("@/lib/db/repos/profile-identities", () => ({profileIdentityRepository: {getDisplayName: async () => ({name: "Synthetic staff"})}}));
vi.mock("@/lib/config/env", () => ({publicEnv: () => ({})}));
vi.mock("@/components/admin/admin-app-shell", () => ({AdminAppShell: ({children}: {children: ReactNode}) => <main>{children}</main>}));
vi.mock("@/components/internal-shell/app-shell", () => ({InternalAppShell: ({children}: {children: ReactNode}) => <main>{children}</main>}));
vi.mock("@/components/portal/portal-nav", () => ({PortalNav: () => null}));
vi.mock("@/components/ai/concierge-widget", () => ({ConciergeWidget: () => null}));

import LocaleLayout from "@/app/[locale]/layout";
import AdminLayout from "@/app/[locale]/(admin)/admin/layout";
import PortalLayout from "@/app/[locale]/(member)/portal/layout";
import ErrorPage from "@/app/[locale]/error";

type Messages = Record<string, Record<string, unknown>>;
type ProviderTree = ReactElement<{messages: Messages; children: ReactNode}>;
function catalog(locale: string): Messages {
  return JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
}

describe("client translation payload boundaries", () => {
  beforeEach(() => {
    state.unauthorized = false;
    state.getMessages.mockReset().mockImplementation(async () => catalog(state.locale));
  });

  it.each(["en", "zh-HK"])("keeps only usable recovery messages in the %s public root payload", async (locale) => {
    const tree = await LocaleLayout({children: <p>Public content</p>, params: Promise.resolve({locale})});
    const body = tree.props.children as ReactElement<{children: ProviderTree}>;
    const provider = body.props.children;
    expect(provider.props.messages).toEqual({Error: catalog(locale).Error});
    expect(new TextEncoder().encode(JSON.stringify(provider.props.messages)).length).toBeLessThan(1000);
    // Use the real client i18n consumer: recovery must work without other namespaces.
    render(<NextIntlClientProvider locale={locale} messages={provider.props.messages} timeZone="Asia/Hong_Kong">
      <ErrorPage error={Error("synthetic")} reset={() => undefined} />
    </NextIntlClientProvider>);
    expect(screen.getByRole("heading", {level: 1})).toHaveTextContent(String(catalog(locale).Error.title));
    expect(screen.getByRole("button")).toHaveTextContent(String(catalog(locale).Error.retry));
  });

  it.each(["en", "zh-HK"])("preserves the full %s client catalog within authorized private layouts", async (locale) => {
    for (const Layout of [AdminLayout, PortalLayout]) {
      const tree = await Layout({children: <p>Private content</p>, params: Promise.resolve({locale})});
      expect(tree.type).toBe(NextIntlClientProvider);
      expect((tree as ProviderTree).props.messages).toEqual(catalog(locale));
    }
  });

  it("does not load a private client catalog before the actor boundary succeeds", async () => {
    state.unauthorized = true;
    await expect(AdminLayout({children: null, params: Promise.resolve({locale: "en"})})).rejects.toThrow("UNAUTHORIZED");
    await expect(PortalLayout({children: null, params: Promise.resolve({locale: "en"})})).rejects.toThrow("PROVIDER_UNAVAILABLE");
    expect(state.getMessages).not.toHaveBeenCalled();
  });
});
