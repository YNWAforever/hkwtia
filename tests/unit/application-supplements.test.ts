import {describe, expect, it} from "vitest";
import {memberSupplementView, type SupplementRequest} from "@/lib/membership/application-supplements";
const actor = {kind: "member", userId: "a", profileId: "a"} as const;
const request = {id: "req", applicationId: "app", applicantUserId: "a", version: 1, status: "published", items: [{itemId: "website", label: "Company website", required: true}], dueAt: null, staffContext: "STAFF-ONLY-SENTINEL"} satisfies SupplementRequest & {staffContext: string};
describe("member-visible supplement projection", () => {
  it("never exposes a staff-only field even when the repository row contains one", () => {
    expect(JSON.stringify(memberSupplementView(actor, request))).not.toContain("STAFF-ONLY-SENTINEL");
  });
  it("hides unpublished drafts from their applicant", () => {
    expect(memberSupplementView(actor, {...request, status: "draft"})).toBeNull();
  });
  it("denies another applicant, including a same-company owner", () => {
    expect(() => memberSupplementView({...actor, profileId: "b"}, request)).toThrow("FORBIDDEN");
  });
  it("projects a published request's member fields", () => {
    expect(memberSupplementView(actor, request)).toEqual({id: "req", applicationId: "app", version: 1, status: "published", items: request.items, dueAt: null});
  });
  it.each(["responded", "closed", "cancelled"] as const)("preserves %s history", status => {
    expect(memberSupplementView(actor, {...request, status})?.status).toBe(status);
  });
});
