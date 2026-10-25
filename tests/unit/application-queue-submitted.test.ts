import {describe, expect, it} from "vitest";
import {resolveApplicationQueueStatuses} from "@/lib/admin/application-queue-filter";
import {createTranslator} from "next-intl";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {applicationQueueQuerySchema} from "@/lib/db/repos/admin-members";

describe("submitted application queue", () => {
  it("accepts the dashboard submitted view without replacing explicit status filters", () => {
    expect(applicationQueueQuerySchema.safeParse({status: "submitted"}).success).toBe(true);
    for (const status of ["draft", "pending_review", "pending_payment"]) {
      expect(applicationQueueQuerySchema.parse({status}).status).toBe(status);
    }
  });
  it("selects exact review/payment IDs even when drafts have the same count", () => {
    const rows = [
      {id: "draft-1", status: "draft"}, {id: "draft-2", status: "draft"}, {id: "draft-3", status: "draft"},
      {id: "review-1", status: "pending_review"}, {id: "review-2", status: "pending_review"},
      {id: "payment-1", status: "pending_payment"},
    ] as const;
    const statuses = resolveApplicationQueueStatuses("submitted");
    expect(rows.filter(row => statuses.includes(row.status)).map(row => row.id)).toEqual(["review-1", "review-2", "payment-1"]);
    expect(resolveApplicationQueueStatuses("draft")).toEqual(["draft"]);
    expect(resolveApplicationQueueStatuses("pending_review")).toEqual(["pending_review"]);
    expect(resolveApplicationQueueStatuses("pending_payment")).toEqual(["pending_payment"]);
  });
  it.each([["en", en, "Submitted"], ["zh-HK", zh, "已提交"]] as const)("resolves %s submitted label in the real namespace", (locale, messages, expected) => {
    const t = createTranslator({locale, messages, namespace: "Admin.applicationQueue.viewsLabels"});
    expect(t("submitted")).toBe(expected);
  });
});
