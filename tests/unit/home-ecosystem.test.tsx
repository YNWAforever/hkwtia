import {fireEvent, render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("buildEcosystemIndustries", () => {
  it("resolves the 6 industries in order, with D-4's real hrefs", async () => {
    const {buildEcosystemIndustries} = await import("@/lib/home/ecosystem-industries");
    const industries = buildEcosystemIndustries((key) => `t:${key}`);

    expect(industries.map((industry) => industry.key)).toEqual([
      "commerce", "manufacturing", "health", "responsibleAi", "retail", "education",
    ]);
    expect(industries.map((industry) => industry.href)).toEqual([
      "/showcase?category=commerce-professional-services",
      "/showcase?category=manufacturing-robotics",
      "/showcase?category=health-life-sciences",
      "/ai-transparency",
      "/showcase?category=retail-creative-industries",
      "/events",
    ]);
    expect(industries[0]!.name).toBe("t:items.commerce.name");
  });
});

describe("Ecosystem", () => {
  const industries = [
    {key: "commerce" as const, signal: "01", href: "/showcase?category=commerce-professional-services", name: "Commerce", brief: "Commerce brief"},
    {key: "manufacturing" as const, signal: "02", href: "/showcase?category=manufacturing-robotics", name: "Manufacturing", brief: "Manufacturing brief"},
  ];
  const labels = {
    eyebrow: "AI + Industry", title: "One ecosystem.", intro: "Six pathways.",
    selectedLabel: "Selected industry pathway", enterAction: "Enter this ecosystem",
    focusAreas: ["Industry challenges", "Relevant solution categories", "Programmes + events"],
  };

  it("shows the first industry's detail by default and switches on click", async () => {
    const {Ecosystem} = await import("@/components/home/ecosystem");
    render(<Ecosystem industries={industries} labels={labels} />);

    expect(screen.getByRole("heading", {level: 3, name: "Commerce"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: /Enter this ecosystem/})).toHaveAttribute("href", industries[0]!.href);

    fireEvent.click(screen.getByRole("button", {name: /Manufacturing/}));
    expect(screen.getByRole("heading", {level: 3, name: "Manufacturing"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: /Enter this ecosystem/})).toHaveAttribute("href", industries[1]!.href);
  });
});
