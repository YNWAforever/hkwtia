import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import {ProgrammeGrid} from "@/components/marketing/programme-grid";

const summaries = [
  {id: "cpai" as const, namespace: "programs.cpai", image: "/images/projects-hero.jpg", type: "credential" as const, editionCount: null, latestYear: null, firstYear: null},
  {id: "hkict" as const, namespace: "programs.hkict", image: "/images/projects-hero.jpg", type: "event-series" as const, editionCount: 6, latestYear: 2025, firstYear: 2020},
];
const labels = {
  eventSeriesLabel: "Event series",
  credentialLabel: "Credential",
  credentialFact: "Issued directly by WTIA",
  editionsFact: (count: number, year: number) => `${count} editions since ${year}`,
  action: "View programme",
  items: {
    cpai: {name: "CPAI", description: "Applied innovation."},
    hkict: {name: "HKICT Awards", description: "Recognising excellence."},
    tct: {name: "TCT", description: "Connecting."},
    asa: {name: "ASA", description: "Celebrating."},
  },
};

describe("ProgrammeGrid", () => {
  it("renders one card per summary, the first as .feature, with the typed facts", () => {
    render(<ProgrammeGrid summaries={summaries} labels={labels} />);
    const cards = document.querySelectorAll(".programme-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveClass("feature");
    expect(screen.getByRole("heading", {name: "CPAI"}).closest("article")!.textContent).toContain("Issued directly by WTIA");
    expect(screen.getByRole("heading", {name: "HKICT Awards"}).closest("article")!.textContent).toContain("6 editions since 2025");
    expect(screen.getByRole("heading", {name: "CPAI"}).closest("article")!.querySelector("a")).toHaveAttribute("href", "/programs/cpai");
  });
});
