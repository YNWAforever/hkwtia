import {describe, expect, it} from "vitest";

import {directoryPaging} from "@/lib/portal/directory-paging";

describe("directoryPaging", () => {
  it("has no first link on page one", () => {
    expect(directoryPaging({query: "", cursor: null, nextCursor: null})).toEqual({first: null, next: null});
    expect(directoryPaging({query: "robotics", cursor: null, nextCursor: "c2"}).first).toBeNull();
  });

  it("offers first on a cursor page and keeps the search", () => {
    expect(directoryPaging({query: "", cursor: "c1", nextCursor: null}).first).toEqual({});
    expect(directoryPaging({query: "robotics", cursor: "c1", nextCursor: null}).first).toEqual({q: "robotics"});
  });

  it("offers next only with a nextCursor, carrying the search", () => {
    expect(directoryPaging({query: "", cursor: "c1", nextCursor: null}).next).toBeNull();
    expect(directoryPaging({query: "robotics", cursor: null, nextCursor: "c2"}).next).toEqual({q: "robotics", cursor: "c2"});
    expect(directoryPaging({query: "", cursor: null, nextCursor: "c2"}).next).toEqual({cursor: "c2"});
  });
});
