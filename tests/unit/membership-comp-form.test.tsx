import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {MembershipCompForm} from "@/components/admin/membership-comp-form";

const labels = {
  title: "Grant a membership",
  description: "Creates an active membership without a payment.",
  planLabel: "Plan",
  submit: "Grant membership",
};

describe("MembershipCompForm", () => {
  it("offers every sellable plan and carries the profile it grants to", () => {
    render(<MembershipCompForm action={async () => ({})} labels={labels} profileId="p-1" />);

    expect(screen.getByRole("combobox", {name: "Plan"})).toBeInTheDocument();
    for (const plan of ["community", "startup", "corporate", "patron"]) {
      expect(screen.getByRole("option", {name: plan})).toBeInTheDocument();
    }
    // The target is submitted, never typed: a free-text profile id on a staff form is a
    // membership granted to whoever was pasted in by mistake.
    expect(screen.getByTestId("membership-comp-form").querySelector('input[name="profileId"]'))
      .toHaveAttribute("value", "p-1");
  });

  it("announces the outcome politely rather than silently", () => {
    render(<MembershipCompForm action={async () => ({})} labels={labels} profileId="p-1" state={{status: "success", message: "Membership granted."}} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Membership granted.");
  });
});
