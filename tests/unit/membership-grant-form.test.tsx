import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {MembershipGrantForm} from "@/components/admin/membership-grant-form";
import {hktLocalToIso, parseBatchGrantForm} from "@/lib/admin/membership-grant-core";

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
  it.each([false, true])("collects concrete batch targets and respects the company option flag (%s)", (companyAllowed) => {
    render(<MembershipGrantForm action={async () => ({})} labels={{title: "Finite grant", description: "Requires approval", plan: "Plan", start: "Starts (Hong Kong time)", expiry: "Expires (Hong Kong time)", reason: "Reason", submit: "Preview grants"}} batchTargets={{companyAllowed, idempotencyKey: "11111111-1111-4111-8111-111111111111", labels: {kind: "Target type", profile: "Individual profiles", company: "Companies", ids: "Target IDs", help: "One ID per line; inspect the preview before committing."}}}/>);
    expect(screen.getByLabelText("Target IDs")).toBeRequired();
    expect(screen.getByRole("option", {name: "Individual profiles"})).toBeInTheDocument();
    expect(screen.queryByRole("option", {name: "Companies"}) !== null).toBe(companyAllowed);
    const form = screen.getByRole("button", {name: "Preview grants"}).closest("form")!;
    expect(new FormData(form).get("idempotencyKey")).toBe("11111111-1111-4111-8111-111111111111");
  });  it("parses explicit batch IDs and Hong Kong dates without client eligibility or actor fields", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({targetKind: "company", targetIds: "11111111-1111-4111-8111-111111111111\n22222222-2222-4222-8222-222222222222", idempotencyKey: "33333333-3333-4333-8333-333333333333", planCode: "corporate", effectiveAt: "2026-10-01T00:00", expiresAt: "2026-11-01T00:00", reason: "Verified association decision", actor: "forged", eligible: "true"})) form.set(key, value);
    expect(parseBatchGrantForm(form)).toEqual({operation: "membership_grant", idempotencyKey: "33333333-3333-4333-8333-333333333333", targets: [{kind: "company", companyId: "11111111-1111-4111-8111-111111111111"}, {kind: "company", companyId: "22222222-2222-4222-8222-222222222222"}], payload: {planCode: "corporate", effectiveAt: "2026-09-30T16:00:00.000Z", expiresAt: "2026-10-31T16:00:00.000Z", reason: "Verified association decision"}});
    form.set("targetKind", "staff");
    expect(() => parseBatchGrantForm(form)).toThrow();
    form.set("targetKind", "company"); form.set("targetIds", "not-a-company-id");
    expect(() => parseBatchGrantForm(form)).toThrow();
  });});
