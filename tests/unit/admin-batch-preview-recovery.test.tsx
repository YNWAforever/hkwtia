import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/components/admin/batch-progress", () => ({BatchProgressPoller: () => null}));
vi.mock("@/lib/admin/batches/actions", () => ({commitAdminBatchAction: vi.fn(), retryAdminBatchAction: vi.fn(), cancelAdminBatchAction: vi.fn()}));

import {BatchPreviewPanel, type BatchLabels} from "@/components/admin/batch-preview";
import type {BatchPreview} from "@/lib/admin/batches/types";

const labels: BatchLabels = {title: "Batch", description: "Review", back: "Back", states: {completed_with_errors: "Completed with errors", failed: "Failed"}, counters: {pending: "Pending", running: "Running", succeeded: "Succeeded", skipped: "Skipped", failed: "Failed"}, total: "Total", eligible: "Eligible", blocked: "Blocked", operation: "Operation", target: "Target", before: "Before", after: "After", reason: "Reason", attempts: "Attempts", result: "Result", commit: "Commit", retry: "Retry failed items", cancel: "Cancel", expires: "Expires", empty: "Empty", manualReview: "Review this error before any further action", more: "Next page", progressUnavailable: "Progress unavailable", locale: "en", change: "Changes", noChange: "No changed fields", idLabel: "Technical ID", targetTypes: {profile: "Member"}, fieldNames: {locale: "Locale", tags: "Tags"}, reasonTransient: "Temporary provider issue", reasonChanged: "Changed since preview", reasonUnchanged: "No change needed", reasonOther: "Review this outcome"};
const preview = (code: string): BatchPreview => ({batchId: "11111111-1111-4111-8111-111111111111", operation: "profile_patch", state: "completed_with_errors", digest: "a".repeat(64), expiresAt: "", total: 1, eligible: 1, skipped: 0, blocked: 0, counters: {pending: 0, running: 0, succeeded: 0, skipped: 0, failed: 1}, items: [{target: {type: "profile", id: "synthetic"}, previewStatus: "eligible", eligible: true, reasonCode: null, before: {}, after: {}, expectedVersion: "version", state: "failed", attemptCount: 1, errorCode: code, resultRef: null}]});

describe("batch recovery actions", () => {
  it("does not offer a retry for a permanent failure", () => {
    render(<BatchPreviewPanel labels={labels} preview={preview("PERMANENT_VALIDATION")}/>);
    expect(screen.queryByRole("button", {name: "Retry failed items"})).not.toBeInTheDocument();
    expect(screen.getByText("Review this error before any further action")).toBeInTheDocument();
  });
  it("uses global retryability even when the failed item is on another page", () => {
    render(<BatchPreviewPanel labels={labels} preview={{...preview("PERMANENT_VALIDATION"), retryableFailed: true}}/>);
    expect(screen.getByRole("button", {name: "Retry failed items"})).toBeInTheDocument();
  });
  it("renders only the supplied item page and offers its scoped next cursor", () => {
    const item = preview("PERMANENT_VALIDATION").items[0]!;
    const items = Array.from({length: 50}, (_, index) => ({...item, target: {...item.target, id: `synthetic-${index}`}}));
    render(<BatchPreviewPanel labels={labels} pageHref="/admin/batches/11111111-1111-4111-8111-111111111111" preview={{...preview("PERMANENT_VALIDATION"), total: 5000, items, nextCursor: "cursor-safe"}}/>);
    expect(screen.getAllByRole("row")).toHaveLength(51);
    expect(screen.getByRole("link", {name: "Next page"})).toHaveAttribute("href", "/admin/batches/11111111-1111-4111-8111-111111111111?cursor=cursor-safe");
  });
  it("shows a human target, changed values and a readable failure while retaining technical IDs", () => {
    const item = preview("TRANSIENT_PROVIDER").items[0]!;
    const named = {...item, target: {...item.target, id: "synthetic-profile-id"}, before: {targetName: "Synthetic Member", locale: "en", tags: ["ai"]}, after: {targetName: "Synthetic Member", locale: "zh-HK", tags: ["ai"]}};
    render(<BatchPreviewPanel labels={labels} preview={{...preview("TRANSIENT_PROVIDER"), items: [named]}}/>);
    expect(screen.getByText("Synthetic Member")).toBeInTheDocument();
    expect(screen.getByText(/Locale.*en.*zh-HK/)).toBeInTheDocument();
    expect(screen.queryByText(/Tags.*ai/)).not.toBeInTheDocument();
    expect(screen.getByText("Temporary provider issue")).toBeInTheDocument();
    expect(screen.getByText(/synthetic-profile-id/)).toBeInTheDocument();
    expect(screen.getByText("TRANSIENT_PROVIDER")).toBeInTheDocument();
  });  it("offers retry only for a transient failed item", () => {
    render(<BatchPreviewPanel labels={labels} preview={preview("TRANSIENT_NETWORK")}/>);
    expect(screen.getByRole("button", {name: "Retry failed items"})).toBeInTheDocument();
  });
});
