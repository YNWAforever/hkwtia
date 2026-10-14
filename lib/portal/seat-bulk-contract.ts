import type {Actor} from "@/lib/membership/lifecycle";
export type SeatBatchRole = "member" | "admin" | "owner";
export type SeatBatchItemState = "preview" | "blocked" | "pending" | "delivery_pending" | "sending" | "succeeded" | "skipped" | "failed" | "uncertain";
export type SeatInviteRow = Readonly<{position: number; email: string; role: SeatBatchRole; issue: string | null}>;
export type SeatBatchView = Readonly<{
  batchId: string; companyId: string; state: "preview" | "committed"; available: number; canCommit: boolean; expiresAt: string;
  items: readonly Readonly<{itemId: string; position: number; email: string; role: SeatBatchRole; state: SeatBatchItemState; code: string | null; retryable: boolean}>[];
}>;
export type SeatBatchTarget = Readonly<{companyId: string; batchId: string}>;
export type SeatBatchCommit = Readonly<{companyId: string; snapshotId: string; requestId: string; selectedItemIds: readonly string[]; confirmElevated: boolean}>;
export type SeatDeliveryClaim = Readonly<{itemId: string; claimId: string; email: string; token: string; locale: "en" | "zh-HK"}>;
export type SeatBatchStore = Readonly<{
  preview: (actor: Actor, input: {companyId: string; locale: "en" | "zh-HK"; rows: readonly SeatInviteRow[]}) => Promise<SeatBatchView>;
  commit: (actor: Actor, input: SeatBatchCommit) => Promise<SeatBatchView>;
  read: (actor: Actor, input: SeatBatchTarget) => Promise<SeatBatchView>;
  retry: (actor: Actor, input: SeatBatchTarget) => Promise<SeatBatchView>;
  cancel: (actor: Actor, input: SeatBatchTarget) => Promise<SeatBatchView>;
  prepareNext: (actor: Actor, input: SeatBatchTarget) => Promise<boolean>;
  claimDelivery: (actor: Actor, input: SeatBatchTarget) => Promise<SeatDeliveryClaim | null>;
  settleDelivery: (actor: Actor, input: SeatBatchTarget & {itemId: string; claimId: string; outcome: "succeeded" | "uncertain"}) => Promise<void>;
}>;
export type SeatBulkState = Readonly<{status: "idle"}> | Readonly<{status: "ready"; view: SeatBatchView}> | Readonly<{status: "error"; code: "invalid" | "forbidden" | "expired" | "capacity" | "confirmation" | "unavailable"; view?: SeatBatchView}>;
