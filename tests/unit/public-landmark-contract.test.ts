import {existsSync, readFileSync, readdirSync, statSync} from "node:fs";
import {dirname, join, relative, resolve, sep} from "node:path";

import ts from "typescript";
import {describe, expect, it} from "vitest";

type SourceFile = Readonly<{path: string; source: string}>;
type SourceReader = Readonly<{
  publicPageEntrypoints(): readonly string[];
  exists(path: string): boolean;
  read(path: string): string;
}>;

const publicRoot = "app/[locale]/(public)";
const publicLayout = `${publicRoot}/layout.tsx`;
const sourceExtensions = [".ts", ".tsx"] as const;

function normalizePath(path: string): string {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

function collectPublicPageEntrypoints(root: string, directory = join(root, publicRoot)): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectPublicPageEntrypoints(root, path);
    return entry.isFile() && entry.name === "page.tsx" ? [normalizePath(relative(root, path))] : [];
  });
}

function nodeSourceReader(): SourceReader {
  const root = resolve(process.cwd());
  return {
    publicPageEntrypoints: () => collectPublicPageEntrypoints(root),
    exists: (path) => {
      const candidate = join(root, path);
      return existsSync(candidate) && statSync(candidate).isFile();
    },
    read: (path) => readFileSync(join(root, path), "utf8"),
  };
}

function staticSpecifiers(source: string, path: string): string[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return parsed.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
    const specifier = statement.moduleSpecifier;
    return specifier && ts.isStringLiteral(specifier) ? [specifier.text] : [];
  });
}

function resolveLocalImport(from: string, specifier: string, exists: (path: string) => boolean): string | null {
  const base = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? normalizePath(join(dirname(from), specifier))
      : null;
  if (!base) return null;
  const candidates = sourceExtensions.some((extension) => base.endsWith(extension))
    ? [base]
    : [base, ...sourceExtensions.map((extension) => `${base}${extension}`), ...sourceExtensions.map((extension) => `${base}/index${extension}`)];
  return candidates.find(exists) ?? null;
}

function projectSources(reader: SourceReader = nodeSourceReader()): SourceFile[] {
  const pending = [...reader.publicPageEntrypoints(), publicLayout];
  const visited = new Set<string>();
  const sources = new Map<string, SourceFile>();
  const specifiers = new Map<string, string[]>();

  while (pending.length) {
    const path = pending.shift();
    if (!path || visited.has(path) || !reader.exists(path)) continue;
    visited.add(path);

    let source = sources.get(path);
    if (!source) {
      source = {path, source: reader.read(path)};
      sources.set(path, source);
    }

    let imports = specifiers.get(path);
    if (!imports) {
      imports = staticSpecifiers(source.source, path);
      specifiers.set(path, imports);
    }
    for (const specifier of imports) {
      const dependency = resolveLocalImport(path, specifier, reader.exists);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }

  return [...visited].map((path) => sources.get(path)!).filter(Boolean);
}

function inMemorySourceReader(sources: readonly SourceFile[], onRead?: (path: string) => void): SourceReader {
  const byPath = new Map(sources.map((source) => [source.path, source.source]));
  return {
    publicPageEntrypoints: () => sources
      .filter(({path}) => path.startsWith(`${publicRoot}/`) && path.endsWith("/page.tsx"))
      .map(({path}) => path),
    exists: (path) => byPath.has(path),
    read: (path) => {
      onRead?.(path);
      const source = byPath.get(path);
      if (source === undefined) throw new Error(`missing fixture source: ${path}`);
      return source;
    },
  };
}

function publicReachableSources(sources: readonly SourceFile[]): SourceFile[] {
  return projectSources(inMemorySourceReader(sources));
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

  it("reads only public entrypoints, the owner, and each reachable source once", () => {
    const reads: string[] = [];
    const sources: SourceFile[] = [
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: `${publicRoot}/sample/page.tsx`, source: 'import "@/components/site/shared";'},
      {path: "components/site/shared.tsx", source: "export const shared = true;"},
      {path: "components/marketing/unreachable-main.tsx", source: "<main/>"},
    ];

    expect(projectSources(inMemorySourceReader(sources, (path) => reads.push(path))).map(({path}) => path)).toEqual([
      `${publicRoot}/sample/page.tsx`,
      publicLayout,
      "components/site/shared.tsx",
    ]);
    expect(reads).toEqual([
      `${publicRoot}/sample/page.tsx`,
      publicLayout,
      "components/site/shared.tsx",
    ]);
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
