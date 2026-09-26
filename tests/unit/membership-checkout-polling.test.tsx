import {act, render, screen} from "@testing-library/react";
import type {ComponentProps} from "react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {CheckoutStatus} from "@/components/billing/checkout-status";

const labels = {processing: "Waiting for webhook", active: "Open portal", review: "Under review", failed: "Check status"};
const props = {status: "processing" as const, labels, membershipId: "membership-a", statusUrl: "/api/membership/checkout-status?membershipId=membership-a", timeoutLabel: "Still processing"};

afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});

describe("membership checkout polling", () => {
  it("reads status after three seconds and stops after an active webhook projection", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({status: "active"})});
    vi.stubGlobal("fetch", fetchMock);
    render(<CheckoutStatus {...props as ComponentProps<typeof CheckoutStatus>}/>);
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {await vi.advanceTimersByTimeAsync(3000);});
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("Open portal");
    await act(async () => {await vi.advanceTimersByTimeAsync(6000);});
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("stops after twenty processing reads and offers manual verification without declaring failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({status: "processing"})});
    vi.stubGlobal("fetch", fetchMock);
    render(<CheckoutStatus {...props as ComponentProps<typeof CheckoutStatus>}/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(60_000);});
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(screen.getByRole("status").textContent).toBe("Waiting for webhook");
    expect(screen.getByRole("note").textContent).toBe("Still processing");
    await act(async () => {await vi.advanceTimersByTimeAsync(30_000);});
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it("stops on unmount without making a status request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const view = render(<CheckoutStatus {...props as ComponentProps<typeof CheckoutStatus>}/>);
    view.unmount();
    await act(async () => {await vi.advanceTimersByTimeAsync(6000);});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
