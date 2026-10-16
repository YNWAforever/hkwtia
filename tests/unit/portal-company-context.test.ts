import {describe, expect, it} from "vitest";
import {selectPortalCompany} from "@/lib/portal/company-context";

const a = {id: "a", displayName: "Alpha", canManage: false};
const b = {id: "b", displayName: "Bravo", canManage: true};
describe("explicit portal company selection", () => {
  it("defaults to the same manageable company independent of row order", () => {
    expect(selectPortalCompany([a, b])).toEqual({ok: true, company: b});
    expect(selectPortalCompany([b, a])).toEqual({ok: true, company: b});
    expect(selectPortalCompany([{...b, id: "z"}, b])).toEqual({ok: true, company: b});
  });
  it("lets a member explicitly view their read-only company", () => {
    expect(selectPortalCompany([b, a], "a")).toEqual({ok: true, company: a});
  });
  it.each(["", "unknown", ["a", "b"], null])("never defaults when a provided selection is invalid: %s", (id) => {
    expect(selectPortalCompany([a, b], id)).toEqual({ok: false});
  });
  it("does not mutate rows and represents no company honestly", () => {
    const rows = Object.freeze([b, a]);
    selectPortalCompany(rows);
    expect(rows).toEqual([b, a]);
    expect(selectPortalCompany([])).toEqual({ok: true, company: null});
  });
});
