import {describe, expect, it, vi} from "vitest";

const showcaseRepository = vi.hoisted(() => ({recordView: vi.fn()}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository}));

import {createShowcaseViewTracker} from "@/lib/showcase/views";
import {GET} from "@/app/api/showcase/[slug]/view/route";

describe("showcase view tracker", () => {
  it("writes once per slug/viewer inside the debounce window and again after expiry", async () => {
    let now = 1_000;
    const writes: string[] = [];
    const tracker = createShowcaseViewTracker({
      now: () => now,
      debounceMs: 10_000,
      record: async (slug) => {writes.push(slug);},
    });

    await expect(tracker.record("harbour-vision-ai", "viewer-a")).resolves.toBe(true);
    await expect(tracker.record("harbour-vision-ai", "viewer-a")).resolves.toBe(false);
    await expect(tracker.record("harbour-vision-ai", "viewer-b")).resolves.toBe(true);
    now += 10_000;
    await expect(tracker.record("harbour-vision-ai", "viewer-a")).resolves.toBe(true);
    expect(writes).toEqual(["harbour-vision-ai", "harbour-vision-ai", "harbour-vision-ai"]);
  });

  it("does not retain a debounce mark when the database write fails", async () => {
    const record = vi.fn().mockRejectedValueOnce(new Error("database down")).mockResolvedValue(undefined);
    const tracker = createShowcaseViewTracker({now: () => 1_000, debounceMs: 10_000, record});

    await expect(tracker.record("harbour-vision-ai", "viewer-a")).rejects.toThrow("database down");
    await expect(tracker.record("harbour-vision-ai", "viewer-a")).resolves.toBe(true);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it("returns 204 without touching the repository for invalid slugs", async () => {
    const response = await GET(new Request("https://hkwtia.example"), {params: Promise.resolve({slug: "Bad Slug"})});

    expect(response.status).toBe(204);
    expect(showcaseRepository.recordView).not.toHaveBeenCalled();
  });

  it("counts one view when a single client varies its user agent", async () => {
    showcaseRepository.recordView.mockClear();
    showcaseRepository.recordView.mockResolvedValue(undefined);
    const params = Promise.resolve({slug: "ua-rotation-listing"});
    const beacon = (userAgent: string) => GET(
      new Request("https://hkwtia.test/api/showcase/ua-rotation-listing/view", {
        headers: {"x-vercel-forwarded-for": "203.0.113.44", "user-agent": userAgent},
      }),
      {params},
    );

    // The user agent is attacker-controlled. When it was part of the viewer
    // key, each variation minted a fresh key and the debounce never fired.
    await beacon("Mozilla/5.0 (one)");
    await beacon("Mozilla/5.0 (two)");
    await beacon("Mozilla/5.0 (three)");

    expect(showcaseRepository.recordView).toHaveBeenCalledOnce();
  });

  it("records nothing when no trusted client IP is present", async () => {
    showcaseRepository.recordView.mockClear();
    showcaseRepository.recordView.mockResolvedValue(undefined);

    const response = await GET(
      new Request("https://hkwtia.test/api/showcase/no-ip-listing/view"),
      {params: Promise.resolve({slug: "no-ip-listing"})},
    );

    expect(response.status).toBe(204);
    expect(showcaseRepository.recordView).not.toHaveBeenCalled();
  });
});