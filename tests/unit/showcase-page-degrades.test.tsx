import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const showcase = vi.hoisted(() => ({listPublished: vi.fn()}));

vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
// next-intl's server helpers refuse to run outside a request scope, so the
// page cannot be rendered at all without these. `getTranslations` echoes the
// key, which also keeps the assertions about the empty-state *branch* rather
// than about the English copy.
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key === "emptyTitle" ? "No showcase listings" : key,
}));

import ShowcasePage from "@/app/[locale]/(public)/showcase/page";

/**
 * `/news` wraps its reads in `.catch(() => [])` so an unreachable database
 * degrades to the empty state rather than a 500. `/showcase` awaits
 * `listPublished` bare, so the same outage takes the page down — and it is a
 * redirect destination for eight migrated member stories, so a visitor
 * following a link from a 2017 interview would get an error page.
 */
async function render(): Promise<string> {
  return renderToStaticMarkup(await ShowcasePage({
    params: Promise.resolve({locale: "en"}),
    searchParams: Promise.resolve({}),
  }));
}

describe("public Showcase degradation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state when the listing read fails", async () => {
    showcase.listPublished.mockRejectedValue(new Error("TRANSIENT_DATABASE_READ"));

    const html = await render();

    expect(html).toContain("No showcase listings");
  });

  it("still renders listings when the read succeeds", async () => {
    showcase.listPublished.mockResolvedValue([]);

    await expect(render()).resolves.toContain("No showcase listings");
    expect(showcase.listPublished).toHaveBeenCalledOnce();
  });
});
