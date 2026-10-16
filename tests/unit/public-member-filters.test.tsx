import {render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {MemberFilters} from "@/components/marketing/member-filters";

const labels = {
  search: "Search members", tag: "Industry", anyTag: "All industries", plan: "Membership", anyPlan: "All tiers",
  submit: "Search", apply: "Apply filters", clear: "Clear",
  plans: {community: "Community", startup: "Startup", corporate: "Corporate", patron: "Patron"},
} as const;

describe("public member directory filters", () => {
  it("labels each facet visibly, not only for screen readers", () => {
    render(<MemberFilters filters={{q: null, tag: null, plan: null}} labels={labels} locale="en" />);

    // A sighted reader saw two bare selects whose only label was their first option; once a
    // value was chosen ("Cybersecurity") nothing on screen said what the control filtered.
    for (const name of [labels.tag, labels.plan]) {
      const select = screen.getByRole("combobox", {name});
      const label = document.querySelector(`label[for="${select.id}"]`);
      expect(label, name).not.toBeNull();
      expect(label).not.toHaveClass("sr-only");
    }
  });

  it("can apply a facet change from the facet row itself", () => {
    const {container} = render(<MemberFilters filters={{q: null, tag: "cybersecurity", plan: null}} labels={labels} locale="en" />);

    // The only submit used to sit beside the search box above, so choosing an industry and
    // looking for a button in the facet row found nothing to press.
    const facets = container.querySelector(".directory-actions") as HTMLElement;
    const apply = within(facets).getByRole("button", {name: labels.apply});
    expect(apply).toHaveAttribute("type", "submit");
    expect(apply.closest("form")).toBe(container.querySelector("form"));
    expect(within(facets).getByRole("combobox", {name: labels.tag})).toHaveValue("cybersecurity");
  });
});
