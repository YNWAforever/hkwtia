import {describe, expect, it} from "vitest";

import {decodeScopedCursor, encodeScopedCursor, parsePageQuery} from "@/lib/admin/pagination";

describe("admin cursor pages", () => {
  it("defaults to 20 and refuses unbounded reads", () => {
    expect(parsePageQuery({})).toEqual({search: "", limit: 20, cursor: null});
    expect(parsePageQuery({limit: "50", search: "  Ada  "})).toEqual({search: "Ada", limit: 50, cursor: null});
    expect(() => parsePageQuery({limit: "Infinity"})).toThrow();
    expect(() => parsePageQuery({limit: "500"})).toThrow();
  });

  it("keeps cursor scope and all tie-break fields opaque and validated", () => {
    const cursor = encodeScopedCursor("event:one:attendees:ada", ["ada", "guest", "guest-1"]);
    expect(decodeScopedCursor("event:one:attendees:ada", cursor)).toEqual(["ada", "guest", "guest-1"]);
    expect(() => decodeScopedCursor("event:two:attendees:ada", cursor)).toThrow("INVALID_CURSOR");
    expect(() => decodeScopedCursor("event:one:attendees:ada", "%%%" )).toThrow("INVALID_CURSOR");
  });
});
