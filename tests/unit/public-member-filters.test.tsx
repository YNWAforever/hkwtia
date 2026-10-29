import {render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {MemberFilters} from "@/components/marketing/member-filters";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const labels = {
  search: "Search members", tag: "Industry", anyTag: "All industries", plan: "Membership", anyPlan: "All tiers",
  submit: "Search", apply: "Apply filters", clear: "Clear",
  plans: {community: "Community", startup: "Startup", corporate: "Corporate", patron: "Patron", individual: "Individual", platinum: "Platinum"},
} as const;

describe("public member directory filters", () => {
  it.each([["en", en.Members.plans], ["zh-HK", zh.Members.plans]] as const)("offers the actual paid plan codes with shipped %s labels", (locale, plans) => {
    render(<MemberFilters filters={{q: null, tag: null, plan: "platinum"}} labels={{...labels, plans}} locale={locale} />);
    const select = screen.getByRole("combobox", {name: labels.plan});
    expect(within(select).getAllByRole("option").map((option) => (option as HTMLOptionElement).value))
      .toEqual(["", "community", "individual", "corporate", "platinum"]);
    expect(select).toHaveValue("platinum");
  });

  it("keeps a legacy tier filter selected under its public name", () => {
    render(<MemberFilters filters={{q: null, tag: null, plan: "patron"}} labels={{...labels, plans: en.Members.plans}} locale="en" />);
    expect(screen.getByRole("combobox", {name: labels.plan})).toHaveValue("platinum");
  });

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
