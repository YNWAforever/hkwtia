import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {MembershipGrantForm} from "@/components/admin/membership-grant-form";
import {hktLocalToIso} from "@/lib/admin/membership-grant-core";

describe("finite grant form", () => {
  it("requires an explicit window and reason for a server-bound profile target", () => {
    render(<MembershipGrantForm action={async () => ({})} labels={{title: "Finite grant", description: "Requires approval", plan: "Plan", start: "Starts (Hong Kong time)", expiry: "Expires (Hong Kong time)", reason: "Reason", submit: "Create grant"}}/>);
    expect(screen.getByLabelText("Starts (Hong Kong time)")).toBeRequired();
    expect(screen.getByLabelText("Expires (Hong Kong time)")).toBeRequired();
    expect(screen.getByLabelText("Reason")).toBeRequired();
    expect(screen.queryByRole("textbox", {name: "Profile ID"})).not.toBeInTheDocument();
  });
  it("converts Hong Kong midnight exactly and rejects impossible dates", () => {
    expect(hktLocalToIso("2026-10-01T00:00")).toBe("2026-09-30T16:00:00.000Z");
    expect(() => hktLocalToIso("2026-02-31T00:00")).toThrow("GRANT_DATE_INVALID");
  });
});
