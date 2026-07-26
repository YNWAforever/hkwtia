import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

describe("root TypeScript package boundary", () => {
  it("leaves the independently installed Cloudflare Worker to its own tsconfig", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "tsconfig.json"), "utf8"),
    ) as {exclude?: string[]};

    expect(config.exclude).toContain("workers");
  });
});
