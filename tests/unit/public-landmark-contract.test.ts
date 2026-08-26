import {readFileSync, readdirSync} from "node:fs";
import {join, relative, resolve, sep} from "node:path";

import {describe, expect, it} from "vitest";

type SourceFile = Readonly<{path: string; source: string}>;

const publicRoot = "app/[locale]/(public)";
const publicLayout = `${publicRoot}/layout.tsx`;

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function findNestedPublicMains(sources: readonly SourceFile[]): string[] {
  return sources.filter(({path, source}) => path !== publicLayout && /<main\b/.test(source)).map(({path}) => path).sort();
}

function publicLandmarkSources(): SourceFile[] {
  const root = resolve(process.cwd());
  const publicPages = collectTsxFiles(join(root, publicRoot));
  const marketingComponents = collectTsxFiles(join(root, "components", "marketing"));
  return [...publicPages, ...marketingComponents].map((file) => ({
    path: relative(root, file).split(sep).join("/"),
    source: readFileSync(file, "utf8"),
  }));
}

describe("public landmark contract", () => {
  it("detects hostile nested main markup in-memory", () => {
    expect(findNestedPublicMains([
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: "components/marketing/hostile.tsx", source: "<main/>"},
    ])).toEqual(["components/marketing/hostile.tsx"]);
  });

  it("keeps the public layout as the sole main landmark owner", () => {
    expect(findNestedPublicMains(publicLandmarkSources())).toEqual([]);
  });
});
