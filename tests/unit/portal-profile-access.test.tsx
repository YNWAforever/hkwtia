import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({reads: [] as string[]}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => ({kind: "member", userId: "auth-id", profileId: "own-profile"})}));
vi.mock("@/lib/portal/queries", () => ({getDashboard: async () => { throw new Error("MEMBERSHIP_INACTIVE"); }}));
vi.mock("@/lib/portal/commands", () => ({updateProfileAction: vi.fn()}));
vi.mock("@/lib/db/repos/profiles", () => ({profilesRepository: {getById: async (_actor: unknown, id: string) => {
  state.reads.push(id);
  if (id !== "own-profile") throw new Error("FORBIDDEN");
  return {id, displayName: "Own Member", phone: "123", jobTitle: null, locale: "en", onboardingState: "complete", directoryVisible: false, whatsappNumber: null, whatsappOptIn: false};
}}}));

import ProfilePage from "@/app/[locale]/(member)/portal/profile/page";

describe("own profile remains available when dashboard entitlement is inactive", () => {
  beforeEach(() => { state.reads = []; });
  it.each(["en", "zh-HK"])("renders own editable preferences in %s", async (locale) => {
    const page = ProfilePage({params: Promise.resolve({locale})});
    await expect(page).resolves.toBeDefined();
    const html = renderToStaticMarkup(await page);
    expect(html).toContain('value="Own Member"');
    expect(html).toContain('name="whatsappOptIn"');
    expect(state.reads).toEqual(["own-profile"]);
  });
});
