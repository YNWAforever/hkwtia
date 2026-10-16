import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const translated: Record<string, string> = {
  metaTitle: "t", metaDescription: "t", eyebrow: "AI-Ops in public", title: "Operational AI, measured in public",
  description: "Hourly, privacy-safe evidence.", currentMonth: "Current Hong Kong month", empty: "No metrics are available for this month yet",
  unavailable: "Metrics are temporarily unavailable", breadcrumbCurrent: "AI-Ops", breadcrumbHome: "Home", breadcrumbLabel: "Breadcrumb",
};

vi.mock("@/lib/db/repos/aiops-public", () => ({aiOpsPublicRepository: {readLatestTwelveMonths: vi.fn().mockResolvedValue(null)}}));
vi.mock("@/lib/db/repos/public-posts", () => ({publicPostsRepository: {listPublishedBuildLogs: vi.fn().mockResolvedValue([])}}));
vi.mock("next-intl/server", () => ({
  // Keyed lookup, not a namespace-wide constant: this page's PageHero call reads both
  // Common.breadcrumbHome and Common.breadcrumbLabel, and they must resolve to different strings.
  getTranslations: vi.fn(async () => (key: string) => translated[key] ?? key),
  setRequestLocale: vi.fn(),
}));
// PageHero renders the real Link from @/i18n/navigation with no intl-context provider in this
// render tree -- the same situation handled in tests/unit/wt-pages/news-page.test.tsx (Task 17's
// established pattern for m6-launchpad-page.test.tsx).
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/ai-ops",
  useRouter: () => ({replace: vi.fn()}),
}));

import AiOpsPage from "@/app/[locale]/(public)/ai-ops/page";

describe("AI-Ops page — extracted PageHero", () => {
  it("renders one page-level h1 with a breadcrumb, and the dashboard starts at the metrics", async () => {
    render(await AiOpsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: translated.title})).toBeInTheDocument();
    expect(screen.getByText(translated.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole("navigation", {name: /breadcrumb/i})).toBeInTheDocument();
  });
});
