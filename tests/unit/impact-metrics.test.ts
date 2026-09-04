import {describe, expect, it, vi} from "vitest";

const countPublic = vi.hoisted(() => vi.fn());
const listPublished = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {countPublic}}));
vi.mock("@/lib/db/repos/partners", () => ({partnersRepository: {listPublished}}));

describe("loadImpactMetrics", () => {
  it("computes pastEvents and publishedPartners from the repositories, and asaRegions from the typed record", async () => {
    countPublic.mockResolvedValueOnce(3);
    listPublished.mockResolvedValueOnce([{category: "supporting"}, {category: "regional"}]);
    const {loadImpactMetrics} = await import("@/lib/home/impact-metrics");
    const asOf = new Date("2026-09-01T00:00:00.000Z");

    const metrics = await loadImpactMetrics(asOf);

    expect(metrics.pastEvents).toEqual({value: 3, asOf});
    expect(metrics.publishedPartners).toEqual({value: 2, asOf});
    expect(metrics.asaRegions).not.toBeNull();
    expect(metrics.asaRegions!.value).toBeGreaterThan(0);
    expect(countPublic).toHaveBeenCalledWith(
      {kind: "anonymous", userId: null},
      {status: "past", asOf},
    );
  });

  it("omits a tile whose count is 0, per D-8", async () => {
    countPublic.mockResolvedValueOnce(0);
    listPublished.mockResolvedValueOnce([]);
    const {loadImpactMetrics} = await import("@/lib/home/impact-metrics");

    const metrics = await loadImpactMetrics();

    expect(metrics.pastEvents).toBeNull();
    expect(metrics.publishedPartners).toBeNull();
  });

  it("omits a tile whose read rejects", async () => {
    countPublic.mockRejectedValueOnce(new Error("db down"));
    listPublished.mockRejectedValueOnce(new Error("db down"));
    const {loadImpactMetrics} = await import("@/lib/home/impact-metrics");

    const metrics = await loadImpactMetrics();

    expect(metrics.pastEvents).toBeNull();
    expect(metrics.publishedPartners).toBeNull();
  });

  it("omits pastEvents when partners resolve but events reject, and vice versa", async () => {
    countPublic.mockRejectedValueOnce(new Error("db down"));
    listPublished.mockResolvedValueOnce([{category: "supporting"}]);
    const {loadImpactMetrics} = await import("@/lib/home/impact-metrics");
    const asOf = new Date("2026-09-01T00:00:00.000Z");

    const firstMetrics = await loadImpactMetrics(asOf);
    expect(firstMetrics.pastEvents).toBeNull();
    expect(firstMetrics.publishedPartners).toEqual({value: 1, asOf});

    countPublic.mockResolvedValueOnce(2);
    listPublished.mockRejectedValueOnce(new Error("db down"));
    const secondMetrics = await loadImpactMetrics(asOf);
    expect(secondMetrics.pastEvents).toEqual({value: 2, asOf});
    expect(secondMetrics.publishedPartners).toBeNull();
  });
});
