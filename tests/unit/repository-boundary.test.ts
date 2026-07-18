import {readdir, readFile} from "node:fs/promises";
import {join, relative, resolve} from "node:path";

import {describe, expect, it} from "vitest";

const root = resolve(process.cwd(), "lib");
const forbiddenImports = ["@/lib/db/client", "@/lib/db/repos/common"];

async function productionTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  }));
  return nested.flat();
}

describe("repository database boundary", () => {
  it("allows database client and common repository imports only within repositories", async () => {
    const violations: string[] = [];
    for (const file of await productionTypeScriptFiles(root)) {
      const relativePath = relative(root, file).replaceAll("\\", "/");
      if (relativePath.startsWith("db/repos/")) continue;
      const source = await readFile(file, "utf8");
      if (forbiddenImports.some((specifier) => source.includes(specifier))) violations.push(relativePath);
    }

    expect(violations).toEqual([]);
  });
});
