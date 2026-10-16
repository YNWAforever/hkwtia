import {describe, expect, it} from "vitest";

import {buildEventSeriesData} from "@/lib/structured-data";

describe("buildEventSeriesData", () => {
  it("describes a programme as a recurring series, not a single occurrence", () => {
    const data = buildEventSeriesData({
      key: "hkict",
      name: "Hong Kong ICT Awards",
      description: "An annual awards programme.",
    }, "en");

    // EventSeries, not Event: these recur, and Event would claim one dated occurrence.
    expect(data["@type"]).toBe("EventSeries");
    expect(data.name).toBe("Hong Kong ICT Awards");
    // absoluteUrl falls back to localhost when NEXT_PUBLIC_SITE_URL is unset, as in every
    // other unit test in this repo (route-breadcrumbs.test.ts documents the same fallback).
    expect(data.url).toBe("http://localhost:3000/programs/hkict");
    expect((data.organizer as {"@type": string})["@type"]).toBe("Organization");
  });

  it("points the Chinese page at its /zh url", () => {
    const data = buildEventSeriesData({key: "asa", name: "n", description: "d"}, "zh-HK");

    expect(data.url).toBe("http://localhost:3000/zh/programs/asa");
  });
});
