import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => Object.assign((key: string) => key, {raw: (key: string) => key})),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/auth/actor", () => ({requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"}))}));
vi.mock("@/lib/portal/queries", () => ({
  getDashboard: vi.fn(async () => ({
    profile: {id: "p1", displayName: "Ada", phone: "123", jobTitle: "CTO", locale: "en", directoryVisible: true, whatsappNumber: null, whatsappOptIn: true},
  })),
}));
// The server action is never invoked here; a stub keeps the page free of the auth/db graph.
vi.mock("@/lib/portal/commands", () => ({updateProfileAction: vi.fn()}));

import ProfilePage from "@/app/[locale]/(member)/portal/profile/page";

async function render() {
  return renderToStaticMarkup(await ProfilePage({params: Promise.resolve({locale: "en"})}));
}

describe("portal profile form", () => {
  it("groups the fields into Contact then WhatsApp updates", async () => {
    const html = await render();
    expect(html.match(/<fieldset/g)).toHaveLength(2);
    expect(html.indexOf("profileGroups.contact")).toBeGreaterThan(-1);
    expect(html.indexOf("profileGroups.contact")).toBeLessThan(html.indexOf("profileGroups.whatsapp"));
    expect(html).toMatch(/<form[^>]*class="[^"]*portal-form/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("submits exactly the fields updateProfileAction reads", async () => {
    const html = await render();
    const names = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1]);
    expect([...names].sort()).toEqual(["directoryVisible", "displayName", "jobTitle", "locale", "phone", "whatsappNumber", "whatsappOptIn"].sort());
  });

  it("has one submit button and keeps the consent copy", async () => {
    const html = await render();
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(html).toContain("whatsapp.optIn");
    expect(html).toContain("whatsapp.consent");
  });

  it("describes the directory checkbox with its help text", async () => {
    const html = await render();
    const input = html.match(/<input[^>]*name="directoryVisible"[^>]*>/)?.[0] ?? "";
    const id = input.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<p[^>]*id="${id}"[^>]*>profileGroups.directoryHelp</p>`));
  });
});
