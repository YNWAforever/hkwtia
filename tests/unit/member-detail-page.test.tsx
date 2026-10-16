import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

/**
 * The outage-versus-miss contract for `/members/[slug]` (B-6, D-11).
 *
 * `getPublishedBySlug` returns `PublicMemberProfile | null`, and the page body must keep those two
 * outcomes distinct: a `null` row is a real miss and 404s, while a *rejected* read is a transient
 * database outage and has to travel out of the page as a 500. The tempting `.catch(() => null)` —
 * which the Phase B2 plan asked for before this file corrected it — collapses the pair and turns
 * every outage into "this member does not exist". That is expensive here for two reasons: the page
 * is the destination of the retired `/members/:id` 307s, and it emits Organization and
 * BreadcrumbList JSON-LD. A false 404 tells a crawler to drop a reviewed member page; a 5xx tells
 * it to come back. `/showcase/[slug]` already draws the line in the same place — bare in the body,
 * `.catch` only in `generateMetadata` — and this file is what stops a future edit from quietly
 * moving it. CLAUDE.md's "public pages degrade rather than 500" rule is about *list* pages, which
 * have an empty state to fall back to; a detail page has nothing honest to render.
 *
 * `notFound` is mocked to a sentinel rather than Next's real control-flow error so the rejection
 * case can assert the negative: the promise rejected *and* `notFound()` was never reached.
 */
const NOT_FOUND_SENTINEL = "NEXT_NOT_FOUND_SENTINEL";
const OUTAGE = "TRANSIENT_DATABASE_READ";

const profiles = vi.hoisted(() => ({getPublishedBySlug: vi.fn()}));
const navigation = vi.hoisted(() => ({
  notFound: vi.fn((): never => { throw new Error("NEXT_NOT_FOUND_SENTINEL"); }),
}));
const intl = vi.hoisted(() => ({getTranslations: vi.fn(async () => (key: string) => key)}));

vi.mock("@/lib/db/repos/company-profiles", () => ({companyProfilesRepository: profiles}));
vi.mock("next/navigation", () => navigation);
// next-intl's server helpers refuse to run outside a request scope, so the page cannot render at
// all without these. `getTranslations` echoes the key, which keeps every assertion on the *branch*
// rather than on the English copy — `tests/unit/wt-pages/members-page.test.tsx` pins the copy.
vi.mock("next-intl/server", () => ({setRequestLocale: () => undefined, getTranslations: intl.getTranslations}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/image", () => ({
  default: ({unoptimized, ...props}: {unoptimized?: boolean; [key: string]: unknown}) => <img {...props} data-unoptimized={String(unoptimized)} />,
}));

import MemberDetailPage, {generateMetadata} from "@/app/[locale]/(public)/members/[slug]/page";

const profile = {
  id: "3f1f0a1e-0000-4000-8000-000000000001",
  slug: "harbour-vision-ai",
  name: "Harbour Vision AI",
  tagline: {en: "Trade intelligence", zhHk: "貿易智能"},
  tags: ["ai"],
  plan: "patron" as const,
  website: "https://harbourvision.example/",
  logoUrl: null,
  description: {en: "Public description", zhHk: "公開描述"},
  industry: "software",
  sizeBand: "11-50",
  showcase: null,
  events: [],
};

function renderPage(slug = profile.slug): Promise<ReactNode> {
  return MemberDetailPage({params: Promise.resolve({locale: "en", slug})});
}

describe("/members/[slug] outage versus miss (B-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s on a null row, which is the only real miss", async () => {
    profiles.getPublishedBySlug.mockResolvedValue(null);

    await expect(renderPage("nope")).rejects.toThrow(NOT_FOUND_SENTINEL);
    expect(navigation.notFound).toHaveBeenCalledOnce();
  });

  it("propagates a rejected read instead of calling notFound()", async () => {
    profiles.getPublishedBySlug.mockRejectedValue(new Error(OUTAGE));

    // The regression pin. If someone adds `.catch(() => null)` to the body this line still passes
    // but the next one fails: an outage would have been reported to the crawler as a 404.
    await expect(renderPage()).rejects.toThrow(OUTAGE);
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it("renders the member and both JSON-LD blocks when the read succeeds", async () => {
    profiles.getPublishedBySlug.mockResolvedValue(profile);

    const html = renderToStaticMarkup(await renderPage());

    expect(html).toContain("Harbour Vision AI");
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(navigation.notFound).not.toHaveBeenCalled();
  });
});

describe("/members/[slug] metadata fallback (D-11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // `generateMetadata` is the one place the catch belongs: it runs even for the request that is
  // about to 404, and it has an honest fallback the body does not — the directory's own branded
  // pair. Naming a company here that the page will not show would be worse than saying "Members".
  it("falls back to the directory's own branded pair when the read fails", async () => {
    profiles.getPublishedBySlug.mockRejectedValue(new Error(OUTAGE));

    const metadata = await generateMetadata({params: Promise.resolve({locale: "en", slug: "harbour-vision-ai"})});

    expect(metadata.title).toBe("metaTitle");
    expect(metadata.description).toBe("metaDescription");
    expect(intl.getTranslations).toHaveBeenCalledWith({locale: "en", namespace: "Members"});
    expect(metadata.alternates?.canonical).toContain("/members/harbour-vision-ai");
  });

  it("brands the member's own name when the read succeeds", async () => {
    profiles.getPublishedBySlug.mockResolvedValue(profile);

    const metadata = await generateMetadata({params: Promise.resolve({locale: "en", slug: profile.slug})});

    expect(String(metadata.title)).toContain("Harbour Vision AI");
    expect(metadata.description).toBe("Trade intelligence");
  });
});
