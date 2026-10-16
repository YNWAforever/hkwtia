import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  draft: {profile: null, company: null} as {profile: Record<string, unknown> | null; company: Record<string, unknown> | null},
  defaults: {} as Record<string, string>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({setRequestLocale: vi.fn(), getTranslations: async () => (key: string) => `localized:${key}`}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); },
}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => ({kind: "member", userId: "u", profileId: "p"})}));
vi.mock("@/lib/membership/join-draft", () => ({getJoinDraft: async () => state.draft}));
vi.mock("@/lib/membership/policy-view", () => ({getPolicyConfirmation: async () => ({canProceed: true})}));
vi.mock("@/lib/membership/join-invite-attribution", () => ({inviteDefaults: async () => state.defaults}));
vi.mock("@/components/join/policy-confirmation", () => ({PolicyConfirmation: () => null}));
vi.mock("@/components/join/progress", () => ({JoinProgress: () => null}));
vi.mock("@/components/join/join-form", () => ({JoinForm: ({children}: {children: unknown}) => children}));
vi.mock("../../app/[locale]/(join)/join/actions", () => ({saveProfile: {bind: () => vi.fn()}, saveCompany: {bind: () => vi.fn()}}));

import CompanyPage from "@/app/[locale]/(join)/join/company/page";
import ProfilePage from "@/app/[locale]/(join)/join/profile/page";

const APPLICATION_ID = "8a1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8";

function profileHtml() {
  return ProfilePage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({plan: "community"})}).then(renderToStaticMarkup);
}
function companyHtml(locale = "en") {
  return CompanyPage({params: Promise.resolve({locale}), searchParams: Promise.resolve({plan: "startup", application: APPLICATION_ID})}).then(renderToStaticMarkup);
}
function valueOf(html: string, name: string) {
  const tag = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
  return tag.match(/value="([^"]*)"/)?.[1];
}

describe("join pages with an invite prefill", () => {
  it.each(["en", "zh-HK"])("shows an existing equal company name for confirmation in %s", async (locale) => {
    state.defaults = {};
    state.draft = {profile: null, company: {legalName: "Original Limited", displayName: "Original Limited"}};
    const doc = new DOMParser().parseFromString(await companyHtml(locale), "text/html");
    const display = doc.querySelector<HTMLInputElement>('[name="companyDisplayName"]')!;
    expect(display.value).toBe("Original Limited");
    expect(display.closest("details")?.open).toBe(true);
    expect(display.required).toBe(false);
  });

  it("preserves a custom brand and shows it when resuming", async () => {
    state.defaults = {};
    state.draft = {profile: null, company: {legalName: "Original Limited", displayName: "My Brand"}};
    const doc = new DOMParser().parseFromString(await companyHtml(), "text/html");
    const display = doc.querySelector<HTMLInputElement>('[name="companyDisplayName"]')!;
    expect(display.value).toBe("My Brand");
    expect(display.closest("details")?.open).toBe(true);
  });

  beforeEach(() => {
    state.draft = {profile: null, company: null};
    state.defaults = {displayName: "Chan Tai Man", whatsappNumber: "+85291234567", legalName: "Acme Ltd", companyDisplayName: "Acme"};
  });

  it("prefers the saved draft's display name over the invite's", async () => {
    state.draft = {profile: {displayName: "Saved Name", whatsappNumber: null}, company: null};
    const html = await profileHtml();
    expect(valueOf(html, "displayName")).toBe("Saved Name");
    expect(html).not.toContain("Chan Tai Man");
  });

  it("shows the invite's name and phone for an empty draft", async () => {
    const html = await profileHtml();
    expect(valueOf(html, "displayName")).toBe("Chan Tai Man");
    expect(valueOf(html, "whatsappNumber")).toBe("+85291234567");
  });

  it("fills legal name and company display name from the organisation", async () => {
    const html = await companyHtml();
    expect(valueOf(html, "legalName")).toBe("Acme Ltd");
    expect(valueOf(html, "companyDisplayName")).toBe("Acme");
  });

  it("lets a saved company draft win", async () => {
    state.draft = {profile: null, company: {legalName: "Saved Legal"}};
    const html = await companyHtml();
    expect(valueOf(html, "legalName")).toBe("Saved Legal");
    expect(valueOf(html, "companyDisplayName")).toBe("Acme");
  });

  it("shows only the required name before optional profile details for a new member", async () => {
    state.defaults = {};
    const doc = new DOMParser().parseFromString(await profileHtml(), "text/html");
    expect(doc.querySelector('input[name="displayName"]')?.closest("details")).toBeNull();
    expect(doc.querySelector('input[name="displayName"]')?.hasAttribute("required")).toBe(true);
    for (const name of ["phone", "jobTitle", "whatsappNumber", "whatsappOptIn"]) {
      const disclosure = doc.querySelector(`[name="${name}"]`)?.closest("details");
      expect(disclosure).not.toBeNull();
      expect(disclosure?.hasAttribute("open")).toBe(false);
      expect(disclosure?.querySelector("summary")?.textContent).toContain("localized:optionalProfileTitle");
    }
  });

  it("keeps saved contact details and explicit consent visible when resuming", async () => {
    state.defaults = {};
    state.draft = {profile: {phone: "+85291234567", whatsappOptIn: true}, company: null};
    const doc = new DOMParser().parseFromString(await profileHtml(), "text/html");
    expect(doc.querySelector('[name="phone"]')?.closest("details")?.hasAttribute("open")).toBe(true);
    expect(doc.querySelector('[name="whatsappOptIn"]')?.hasAttribute("checked")).toBe(true);
  });

  it("requires one company name and keeps its optional presentation details collapsed", async () => {
    state.defaults = {};
    const doc = new DOMParser().parseFromString(await companyHtml(), "text/html");
    expect(doc.querySelector('[name="legalName"]')?.hasAttribute("required")).toBe(true);
    const displayName = doc.querySelector('[name="companyDisplayName"]');
    expect(displayName?.hasAttribute("required")).toBe(false);
    expect(displayName?.closest("details")).not.toBeNull();
    expect(displayName?.closest("details")?.hasAttribute("open")).toBe(false);
    expect(doc.body.textContent).toContain("localized:companyDisplayNameHint");
  });

  it("renders blank fields when there is no invite", async () => {
    state.defaults = {};
    const html = await profileHtml();
    expect(valueOf(html, "displayName")).toBe("");
  });
});
