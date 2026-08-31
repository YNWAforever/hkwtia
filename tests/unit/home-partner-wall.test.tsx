import {existsSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import type {PartnerProjection} from "@/lib/db/repos/partners";

vi.mock("next/image", () => ({
  default: ({unoptimized, ...props}: {unoptimized?: boolean; alt: string; src: string}) =>
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    <img data-unoptimized={unoptimized ? "true" : undefined} {...props} />,
}));

const partner: PartnerProjection = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "核准夥伴",
  category: "supporting",
  websiteUrl: "https://partner.example.test/",
  logoUrl: "/api/media/33333333-3333-4333-8333-333333333333",
  logoAlt: "核准標誌",
  displayOrder: 1,
  featured: true,
};

const wallPath = resolve(process.cwd(), "components/marketing/home-partner-wall.tsx");
const wallModule = "@/components/marketing/home-partner-wall";

async function loadWall() {
  return vi.importActual<typeof import("@/components/marketing/home-partner-wall")>(wallModule);
}

describe("HomePartnerWall", () => {
  it("hides on an empty approved projection", async () => {
    expect(existsSync(wallPath)).toBe(true);
    const {HomePartnerWall} = await loadWall();
    expect(render(<HomePartnerWall partners={[]} title="合作夥伴" intro="已核准的合作夥伴" />).container).toBeEmptyDOMElement();
  });

  it("uses localized alt text, safe HTTPS links, and unoptimized private-media delivery", async () => {
    expect(existsSync(wallPath)).toBe(true);
    const {HomePartnerWall} = await loadWall();
    render(<HomePartnerWall partners={[partner]} title="合作夥伴" intro="已核准的合作夥伴" />);

    expect(screen.getByRole("img", {name: "核准標誌"})).toHaveAttribute("src", partner.logoUrl);
    expect(screen.getByRole("img", {name: "核准標誌"})).toHaveAttribute("data-unoptimized", "true");
    expect(screen.getByRole("link", {name: "核准夥伴"})).toHaveAttribute("href", partner.websiteUrl);
    expect(screen.getByRole("link", {name: "核准夥伴"})).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", {name: "核准夥伴"})).toHaveAttribute("rel", "noopener noreferrer");
  });
});
