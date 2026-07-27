import {mkdtemp, readdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, relative, resolve} from "node:path";

import {describe, expect, it} from "vitest";

const root = resolve(process.cwd(), "lib");
const forbiddenImports = ["@/lib/db/client", "@/lib/db/repos/common"];

async function productionTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.isFile() && (path.endsWith(".ts") || path.endsWith(".tsx")) ? [path] : [];
  }));
  return nested.flat();
}

describe("repository database boundary", () => {
  it("discovers both TS and TSX production files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "repository-boundary-"));
    try {
      await writeFile(join(directory, "server-component.tsx"), "export default function Component() { return null; }", "utf8");
      expect(await productionTypeScriptFiles(directory)).toEqual([join(directory, "server-component.tsx")]);
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  });

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

  it("keeps the Concierge actor outside the general membership Actor union", async () => {
    const lifecycle = await readFile(join(root, "membership", "lifecycle.ts"), "utf8");
    const concierge = await readFile(join(root, "auth", "agent-actor.ts"), "utf8");

    expect(lifecycle).not.toMatch(/kind:\s*["']agent["']/);
    expect(concierge).toContain('kind: "agent"');
    expect(concierge).toContain('agent: "concierge"');
    expect(concierge).not.toMatch(/type\s+Actor\s*=/);
  });
});
