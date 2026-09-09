import {describe, expect, it, vi} from "vitest";

import {approveMemberEvent, rejectMemberEvent} from "@/lib/admin/event-review-core";
import type {Actor} from "@/lib/membership/lifecycle";

const EVENT = "22222222-2222-4222-8222-222222222222";
const staff: Actor = {kind: "staff", userId: "s", profileId: "staff-1"};
const member: Actor = {kind: "member", userId: "u", profileId: "m"};

describe("event review core (programme B-3)", () => {
  it("requires an admin and a uuid, then delegates the decision", async () => {
    const review = vi.fn(async () => ({id: EVENT, status: "published" as const, slug: "acme-launch"}));
    await expect(approveMemberEvent(member, EVENT, {review})).rejects.toThrow();
    await expect(approveMemberEvent(staff, "nope", {review})).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
    await expect(approveMemberEvent(staff, EVENT, {review})).resolves.toMatchObject({status: "published"});
    expect(review).toHaveBeenCalledWith(staff, EVENT, {decision: "approve"});
    await rejectMemberEvent(staff, EVENT, " duplicate ", {review});
    expect(review).toHaveBeenLastCalledWith(staff, EVENT, {decision: "reject", reason: "duplicate"});
  });

  it("refuses an empty or oversized rejection reason before delegating", async () => {
    const review = vi.fn(async () => ({id: EVENT, status: "rejected" as const, slug: "acme-launch"}));
    await expect(rejectMemberEvent(staff, EVENT, "   ", {review})).rejects.toThrow();
    await expect(rejectMemberEvent(staff, EVENT, "x".repeat(1_001), {review})).rejects.toThrow();
    await expect(rejectMemberEvent(member, EVENT, "duplicate", {review})).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
});
