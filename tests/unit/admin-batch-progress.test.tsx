import {act, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({useRouter: () => ({refresh})}));

import {BatchProgressPoller} from "@/components/admin/batch-progress";

const batchId = "11111111-1111-4111-8111-111111111111";
const counters = {pending: 10, running: 0, succeeded: 0, skipped: 0, failed: 0};
const labels = {states: {running: "Running", completed: "Completed"}, counters: {pending: "Pending", running: "Running", succeeded: "Succeeded", skipped: "Skipped", failed: "Failed"}, unavailable: "Progress unavailable"};

describe("batch progress polling", () => {
  beforeEach(() => {vi.useFakeTimers(); refresh.mockClear();});
  afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});
  it("reads only the status endpoint and updates counters without refreshing while running", async () => {
    const fetchStatus = vi.fn(async () => Response.json({batchId, state: "running", counters: {...counters, pending: 8, succeeded: 2}}));
    vi.stubGlobal("fetch", fetchStatus);
    render(<BatchProgressPoller batchId={batchId} state="running" counters={counters} labels={labels}/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(5000);});
    expect(fetchStatus).toHaveBeenCalledWith(`/api/admin/batches/${batchId}/status`, expect.objectContaining({cache: "no-store"}));
    expect(screen.getByText("2").closest("dd")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("refreshes once after terminal status and stops polling", async () => {
    const fetchStatus = vi.fn(async () => Response.json({batchId, state: "completed", counters: {...counters, pending: 0, succeeded: 10}}));
    vi.stubGlobal("fetch", fetchStatus);
    render(<BatchProgressPoller batchId={batchId} state="running" counters={counters} labels={labels}/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(15000);});
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});