import {readFileSync, readdirSync} from "node:fs";
import {dirname, join, relative, resolve, sep} from "node:path";

import ts from "typescript";
import {describe, expect, it} from "vitest";

type SourceFile = Readonly<{path: string; source: string}>;

const publicRoot = "app/[locale]/(public)";
const publicLayout = `${publicRoot}/layout.tsx`;
const sourceExtensions = [".ts", ".tsx"] as const;

function normalizePath(path: string): string {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    if ([".git", ".next", "node_modules", ".worktrees"].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return entry.isFile() && sourceExtensions.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

function projectSources(): SourceFile[] {
  const root = resolve(process.cwd());
  return collectSourceFiles(root).map((file) => ({
    path: normalizePath(relative(root, file)),
    source: readFileSync(file, "utf8"),
  }));
}

function staticSpecifiers(source: string, path: string): string[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return parsed.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
    const specifier = statement.moduleSpecifier;
    return specifier && ts.isStringLiteral(specifier) ? [specifier.text] : [];
  });
}

function resolveLocalImport(from: string, specifier: string, available: ReadonlySet<string>): string | null {
  const base = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? normalizePath(join(dirname(from), specifier))
      : null;
  if (!base) return null;
  const candidates = sourceExtensions.some((extension) => base.endsWith(extension))
    ? [base]
    : [base, ...sourceExtensions.map((extension) => `${base}${extension}`), ...sourceExtensions.map((extension) => `${base}/index${extension}`)];
  return candidates.find((candidate) => available.has(candidate)) ?? null;
}

function publicReachableSources(sources: readonly SourceFile[]): SourceFile[] {
  const byPath = new Map(sources.map((source) => [source.path, source]));
  const available = new Set(byPath.keys());
  const pending = sources.filter(({path}) => path.startsWith(`${publicRoot}/`) && path.endsWith("/page.tsx")).map(({path}) => path);
  const visited = new Set<string>();
  while (pending.length) {
    const path = pending.pop();
    if (!path || visited.has(path)) continue;
    visited.add(path);
    const source = byPath.get(path);
    if (!source) continue;
    for (const specifier of staticSpecifiers(source.source, path)) {
      const dependency = resolveLocalImport(path, specifier, available);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited].map((path) => byPath.get(path)!).filter(Boolean);
}

function nestedMainOffenders(sources: readonly SourceFile[]): string[] {
  return publicReachableSources(sources)
    .filter(({path, source}) => path !== publicLayout && /<main\b/.test(source))
    .map(({path}) => path)
    .sort();
}

function jsxMainElements(source: string): ts.JsxOpeningLikeElement[] {
  const parsed = ts.createSourceFile("owner.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const elements: ts.JsxOpeningLikeElement[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && node.tagName.text === "main") {
      elements.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return elements;
}

function hasMainContentId(main: ts.JsxOpeningLikeElement): boolean {
  return main.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
    && ts.isIdentifier(attribute.name)
    && attribute.name.text === "id"
    && !!attribute.initializer
    && ts.isStringLiteral(attribute.initializer)
    && attribute.initializer.text === "main-content");
}

function ownerMainIssues(source: string | undefined): string[] {
  const mains = source ? jsxMainElements(source) : [];
  if (mains.length !== 1) return [`expected exactly one <main>, found ${mains.length}`];
  return hasMainContentId(mains[0]!) ? [] : ["owner <main> must have id=\"main-content\""];
}

describe("public landmark contract", () => {
  it("requires the public layout to own exactly one named main landmark", () => {
    const owner = projectSources().find(({path}) => path === publicLayout)?.source;
    expect(ownerMainIssues(owner)).toEqual([]);
  });

  it("rejects hostile owner markup", () => {
    expect(ownerMainIssues(undefined)).toEqual(["expected exactly one <main>, found 0"]);
    expect(ownerMainIssues("<main/><main id=\"main-content\"/>"))
      .toEqual(["expected exactly one <main>, found 2"]);
    expect(ownerMainIssues("<main id=\"other\"/>"))
      .toEqual(["owner <main> must have id=\"main-content\""]);
    expect(ownerMainIssues("<main/>"))
      .toEqual(["owner <main> must have id=\"main-content\""]);
    expect(ownerMainIssues('<main data-id="main-content"/>'))
      .toEqual(["owner <main> must have id=\"main-content\""]);
  });

  it("discovers nested mains through public import and re-export reachability", () => {
    const sources: SourceFile[] = [
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: `${publicRoot}/sample/page.tsx`, source: 'import "@/components/site/external-main"; import "@/components/site/barrel";'},
      {path: "components/site/external-main.tsx", source: "<main/>"},
      {path: "components/site/barrel.ts", source: 'export * from "./reexported-main";'},
      {path: "components/site/reexported-main.tsx", source: "<main/>"},
      {path: "components/marketing/unreferenced-main.tsx", source: "<main/>"},
    ];
    expect(nestedMainOffenders(sources)).toEqual([
      "components/site/external-main.tsx",
      "components/site/reexported-main.tsx",
    ]);
  });

  it("keeps the public layout as the sole reachable main landmark owner", () => {
    expect(nestedMainOffenders(projectSources())).toEqual([]);
  });
});
