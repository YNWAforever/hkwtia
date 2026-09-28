import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  actor: {kind: "staff", userId: "staff", profileId: "staff"},
  preview: vi.fn(async () => ({
    batchId: "11111111-1111-4111-8111-111111111111",
    operation: "profile_patch",
    state: "ready",
    digest: "a".repeat(64),
    expiresAt: "",
    total: 5000,
    eligible: 5000,
    skipped: 0,
    blocked: 0,
    counters: {pending: 5000, running: 0, succeeded: 0, skipped: 0, failed: 0},
    items: [],
    nextCursor: "next-safe",
    retryableFailed: false
  }))
}));
vi.mock("next-intl/server", () => ({getTranslations: vi.fn(async () => (key: string) => key), setRequestLocale: vi.fn()}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NEXT_NOT_FOUND");}}));
vi.mock("next/link", () => ({default: ({children, href, ...props}: {children: React.ReactNode; href: string}) => <a href={href} {...props}>{children}</a>}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: vi.fn(async () => state.actor)}));
vi.mock("@/lib/admin/batches/service", () => ({getBatchPreview: state.preview}));
vi.mock("@/lib/db/repos/admin-batches", () => ({adminBatchesRepository: {}}));
vi.mock("@/components/admin/batch-progress", () => ({BatchProgressPoller: () => null}));
vi.mock("@/lib/admin/batches/actions", () => ({commitAdminBatchAction: vi.fn(), retryAdminBatchAction: vi.fn(), cancelAdminBatchAction: vi.fn()}));

import AdminBatchPage from "@/app/[locale]/(admin)/admin/batches/[id]/page";
const batchId = "11111111-1111-4111-8111-111111111111";
const props = (query: Record<string, string | string[]> = {}) => ({params: Promise.resolve({locale: "en", id: batchId}), searchParams: Promise.resolve(query)});

describe("batch detail pagination", () => {
  beforeEach(() => state.preview.mockClear());
  it("passes a validated scoped cursor to the owner-scoped preview read", async () => {
    render(await AdminBatchPage(props({cursor: "cursor-safe"})));
    expect(state.preview).toHaveBeenCalledWith(state.actor, batchId, expect.anything(), "cursor-safe");
    expect(screen.getByRole("link", {name: "more"})).toHaveAttribute("href", `/admin/batches/${batchId}?cursor=next-safe`);
  });
  it("rejects ambiguous cursor arrays before reading batch items", async () => {
    await expect(AdminBatchPage(props({cursor: ["one", "two"]}))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.preview).not.toHaveBeenCalled();
  });
});