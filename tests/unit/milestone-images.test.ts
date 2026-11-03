import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const source = readFileSync(resolve(process.cwd(), "content/milestones.ts"), "utf8");

function imagePaths(text: string): string[] {
  return [...text.matchAll(/src: '(\/images\/[^']+)'/g)].map((match) => match[1]);
}

function missingPublicFiles(paths: readonly string[]): string[] {
  return paths.filter((src) => !existsSync(resolve(process.cwd(), "public", src.slice(1))));
}

describe("milestone image files", () => {
  it("detects a path that is not in public/", () => {
    expect(missingPublicFiles(["/images/history/not-a-real-file.jpg"])).toEqual([
      "/images/history/not-a-real-file.jpg",
    ]);
    expect(missingPublicFiles([])).toEqual([]);
  });

  it("finds a file for every image path in content/milestones.ts", () => {
    const paths = imagePaths(source);
    // The archive references far more than the eight interviews. A broken
    // extractor that returns nothing must not pass.
    expect(paths.length).toBeGreaterThan(40);
    expect(missingPublicFiles(paths)).toEqual([]);
  });
});
