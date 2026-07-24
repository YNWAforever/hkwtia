import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
const source = readFileSync("docs/m2-acceptance.md", "utf8");
describe("M2 acceptance evidence contract", () => {
  it("separates revised local proof from historical PostgreSQL evidence", () => {
    expect(source).toContain("Revised v1.1 local deterministic proof");
    expect(source).toContain("Revised v1.1 isolated PostgreSQL acceptance passed 9/9 tests");
    expect(source).toContain("production at-risk repository returns exactly");
  });
});