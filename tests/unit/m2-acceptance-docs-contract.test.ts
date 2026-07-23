import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
const source = readFileSync("docs/m2-acceptance.md", "utf8");
describe("M2 acceptance evidence contract", () => {
  it("separates revised local proof from historical PostgreSQL evidence", () => {
    expect(source).toContain("Revised v1.1 local deterministic proof");
    expect(source).toContain("revised production-repository PostgreSQL rerun remains pending");
    expect(source).not.toContain("The production at-risk repository returns exactly");
  });
});