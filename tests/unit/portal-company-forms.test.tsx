import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";

// Real English copy, so the assertions read as what a member sees ("Save draft"), not as keys.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) => {
    const scope = namespace.split(".").reduce<Record<string, unknown>>((node, part) => node[part] as Record<string, unknown>, en as Record<string, unknown>);
    const raw = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], scope);
    return Object.assign((key: string, values?: Record<string, string>) => String(raw(key)).replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? ""), {raw});
  }),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/auth/actor", () => ({getActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"}))}));
vi.mock("@/lib/portal/queries", () => ({getDashboard: vi.fn()}));
// Neither server action runs here; stubs keep the page out of the auth/db graph.
vi.mock("@/lib/portal/commands", () => ({updateCompanyAction: vi.fn()}));
vi.mock("@/lib/portal/company-profile-actions", () => ({saveCompanyProfileAction: vi.fn()}));

import CompanyPage from "@/app/[locale]/(member)/portal/company/page";
import {getDashboard} from "@/lib/portal/queries";

const logoId = "11111111-2222-4333-8444-555555555555";

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1", legalName: "Acme Ltd", displayName: "Acme", website: "https://acme.example", industry: "AI", sizeBand: "11-50", description: "About",
    canManage: true, slug: "acme", taglineEn: "Hello", taglineZhHk: "你好", descriptionZhHk: "簡介", logoMediaId: logoId, tags: ["fintech"],
    publicProfileStatus: "hidden", profileRejectionReason: null, ...overrides,
  };
}

async function render(overrides: Record<string, unknown> = {}) {
  vi.mocked(getDashboard).mockResolvedValue({companies: [company(overrides)]} as never);
  return renderToStaticMarkup(await CompanyPage({params: Promise.resolve({locale: "en"})}));
}

const names = (html: string) => [...html.matchAll(/<(?:input|select|textarea|button)\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1]);
// React serialises attributes in its own order, so find a control by name and then read its attributes.
const control = (html: string, name: string) => html.match(new RegExp(String.raw`<input\b[^>]*\bname="${name}"[^>]*>`))?.[0] ?? "";
// Each form is found through the section that names it, not by its position on the page.
function section(html: string, headingId: string) {
  return html.split("<section").find((part) => part.includes(`aria-labelledby="${headingId}"`)) ?? "";
}
function forms(html: string) {
  return {details: section(html, "company-details-heading"), pub: section(html, "company-public-heading")};
}
const primaries = (part: string) => part.match(/<button\b[^>]*class="(?:[^"]* )?button(?: [^"]*)?"[^>]*>/g) ?? [];

describe("portal company page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows two titled sections with their purpose", async () => {
    const html = await render();
    expect(html).toContain("Registered details");
    expect(html).toContain("Used for your membership and seats.");
    // The page title and the first section heading must not read the same.
    expect(html.match(/<h1[^>]*>Company details<\/h1>/)).not.toBeNull();
    expect(html).not.toMatch(/<h2[^>]*>Company details<\/h2>/);
    expect(html).toContain("Public member page");
    expect(html).toContain("WTIA reviews this page before it goes live in the member directory.");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("details form submits exactly the fields updateCompanyAction reads, with one primary button", async () => {
    const {details} = forms(await render());
    expect(names(details).sort()).toEqual(["companyId", "description", "directoryVisible", "directoryVisibleShown", "displayName", "industry", "legalName", "sizeBand", "website"]);
    expect(details.match(/type="submit"/g)).toHaveLength(1);
    expect(details.match(/<fieldset/g)).toHaveLength(1);
  });

  // The company switch used to have no control at all, so every save of these details wrote
  // `directoryVisible: false` and hid the whole company from the member directory.
  it("renders the company directory switch with its stored value and a marker that it was shown", async () => {
    const on = forms(await render({directoryVisible: true})).details;
    expect(control(on, "directoryVisible")).toContain('type="checkbox"');
    expect(control(on, "directoryVisible")).toContain("checked");
    expect(control(on, "directoryVisibleShown")).toContain('type="hidden"');
    expect(on).toContain("List our team in the member directory");
    const off = forms(await render({directoryVisible: false})).details;
    expect(control(off, "directoryVisible")).not.toContain("checked");
  });

  it("disables the directory switch for members who cannot manage the company", async () => {
    const {details} = forms(await render({canManage: false, directoryVisible: true}));
    expect(control(details, "directoryVisible")).toContain("disabled");
  });

  it("public form submits exactly the fields the profile action reads, plus the two intents", async () => {
    const {pub} = forms(await render());
    const unique = [...new Set(names(pub))].sort();
    expect(unique).toEqual(["descriptionZhHk", "intent", "logoMediaId", "slug", "tags", "taglineEn", "taglineZhHk", "website"].sort());
    // React serialises a function `formAction` button without its `name` (it replays the submitter on
    // the client), so only the publish button shows `name="intent"` here; both carry the intent value.
    const intents = [...pub.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).filter((tag) => /value="(save|publish)"/.test(tag));
    expect(intents.map((tag) => tag.match(/value="(\w+)"/)?.[1])).toEqual(["save", "publish"]);
    expect(intents[1]).toContain('name="intent"');
    expect(pub).toMatch(/<button[^>]*value="save"[^>]*>Save draft</);
    expect(pub).toMatch(/<button[^>]*value="publish"[^>]*>Submit for review</);
    const primary = primaries(pub);
    expect(primary).toHaveLength(1);
    expect(primary[0]).toContain('value="publish"');
  });

  it("groups the public fields and pairs the English and Chinese taglines", async () => {
    const {pub} = forms(await render());
    for (const heading of ["Page address and links", "Tagline", "Description"]) expect(pub).toContain(heading);
    expect(pub).toMatch(/portal-pair[^]*name="taglineEn"[^]*name="taglineZhHk"/);
  });

  it("keeps the logo id out of sight and the tag limit at 8", async () => {
    const {pub} = forms(await render());
    expect(control(pub, "logoMediaId")).toContain('type="hidden"');
    expect(control(pub, "logoMediaId")).toContain(`value="${logoId}"`);
    expect(pub).not.toContain("Logo image id");
    expect(pub).toContain(`src="/api/media/${logoId}"`);
    expect(pub).toContain("1 / 8 selected");
  });

  it("shows Changes needed and the reason for a rejected page", async () => {
    const {pub} = forms(await render({publicProfileStatus: "rejected", profileRejectionReason: "Logo is blurry"}));
    expect(pub).toContain("Changes needed");
    expect(pub).toContain("Logo is blurry");
    expect(pub.match(/<button[^>]*value="publish"[^>]*>/)?.[0]).not.toContain("disabled");
  });

  it("renders the rejection reason as readable alert text, not inside the 11px status label", async () => {
    const {pub} = forms(await render({publicProfileStatus: "rejected", profileRejectionReason: "Logo is blurry"}));
    const alert = pub.match(/<p\b[^>]*role="alert"[^>]*>(.*?)<\/p>/s);
    expect(alert?.[0]).toContain('class="portal-form-alert"');
    expect(alert?.[1]).toBe("Returned by WTIA: Logo is blurry");
    // The status word itself stays a status label.
    expect(pub).toMatch(/class="[^"]*status-label[^"]*"[^>]*>Changes needed</);
  });

  for (const status of ["published", "pending_review"] as const) {
    it(`a ${status} page offers one primary Save changes (intent=save) with the review note, and no Submit for review`, async () => {
      const {pub} = forms(await render({publicProfileStatus: status}));
      expect(pub).not.toContain("Submit for review");
      expect(pub).not.toContain("Save draft");
      expect(pub).not.toContain('value="publish"');
      const primary = primaries(pub);
      expect(primary).toHaveLength(1);
      expect(primary[0]).toContain('value="save"');
      expect(primary[0]).toContain('name="intent"');
      expect(primary[0]).toContain('aria-describedby="company-save-note"');
      expect(primary[0]).not.toContain("disabled");
      expect(pub).toMatch(/<button[^>]*value="save"[^>]*>Save changes</);
      expect(pub).toMatch(/id="company-save-note"[^>]*>Saving sends your changes to WTIA for review\.</);
    });
  }

  it("explains why Submit for review is unavailable while the page address is empty", async () => {
    const {pub} = forms(await render({slug: null}));
    const publish = pub.match(/<button[^>]*value="publish"[^>]*>/)?.[0] ?? "";
    expect(publish).toContain("disabled");
    expect(publish).toContain('aria-describedby="company-publish-note"');
    expect(pub).toMatch(/id="company-publish-note"[^>]*>Add a page address to submit for review\.</);
  });

  it("shows no address note when the page has an address", async () => {
    const {pub} = forms(await render());
    expect(pub).not.toContain("company-publish-note");
    expect(pub.match(/<button[^>]*value="publish"[^>]*>/)?.[0]).not.toContain("aria-describedby");
  });

  it("labels the other statuses", async () => {
    expect(forms(await render({publicProfileStatus: "pending_review"})).pub).toContain("Under review");
    const live = forms(await render({publicProfileStatus: "published"})).pub;
    expect(live).toContain(">Live<");
    expect(live).toContain('href="/members/acme"');
  });

  it("disables everything for a read-only member and drops Upload/Remove", async () => {
    const html = await render({canManage: false});
    const {details, pub} = forms(html);
    expect(details).toContain("Only company owners and admins can edit these details.");
    expect(pub).toContain("Only company owners and admins can edit these details.");
    for (const part of [details, pub]) {
      const controls = [...part.matchAll(/<(?:input|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((tag) => !tag.includes('type="hidden"'));
      expect(controls.length).toBeGreaterThan(0);
      for (const tag of controls) expect(tag).toContain("disabled");
    }
    expect(pub).not.toContain('type="file"');
    expect(pub).not.toContain("Remove");
    expect(pub).not.toContain('name="intent"');
    expect(details).not.toContain('type="submit"');
    // The review notice describes what an edit does; a member who cannot edit does not see it.
    expect(pub).not.toContain("Editing a page that is already live");
  });

  it("tells a member who can edit that editing a live page sends it back to review", async () => {
    const {pub} = forms(await render());
    expect(pub).toContain("Editing a page that is already live");
  });

  it("submits an empty logoMediaId for a company with no logo", async () => {
    const {pub} = forms(await render({logoMediaId: null}));
    expect(control(pub, "logoMediaId")).toContain('type="hidden"');
    expect(control(pub, "logoMediaId")).toContain('value=""');
    expect(pub).toContain("No logo yet");
    expect(pub).not.toContain("<img");
  });
});
