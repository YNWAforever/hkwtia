import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {FundingResults} from "@/components/marketing/funding-wizard";

const labels = {heading: "Funding results", eligible: "Check scheme details", ineligible: "Not a match", source: "Official source", asOf: "As of"};
const result = (id: string, disclaimer: string) => ({
  id, name: `Scheme ${id}`, summary: `Summary ${id}`, sourceUrl: `https://example.gov.hk/${id}`,
  potentiallyEligible: true, disclaimer, asOf: "2026-07-27",
});

// The same verify-current-terms disclaimer used to print in every card (five times on
// /launchpad). When all results agree it is stated once, under the heading.
describe("FundingResults", () => {
  it("states a shared disclaimer once, not per card", () => {
    render(<FundingResults labels={labels} results={[result("a", "Informational only."), result("b", "Informational only."), result("c", "Informational only.")]} />);
    expect(screen.getAllByText("Informational only.")).toHaveLength(1);
    expect(screen.getAllByRole("link", {name: /Official source/})).toHaveLength(3);
    expect(screen.getAllByRole("heading", {level: 4})).toHaveLength(3);
  });

  it("keeps per-card disclaimers when they differ", () => {
    render(<FundingResults labels={labels} results={[result("a", "Terms A."), result("b", "Terms B.")]} />);
    expect(screen.getByText("Terms A.")).toBeInTheDocument();
    expect(screen.getByText("Terms B.")).toBeInTheDocument();
  });
});
