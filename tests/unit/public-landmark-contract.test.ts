import {readFileSync, readdirSync, realpathSync, statSync} from "node:fs";
import {dirname, extname, join, relative, resolve, sep} from "node:path";

import ts from "typescript";
import {describe, expect, it} from "vitest";

type SourceFile = Readonly<{path: string; source: string}>;
type SourceReader = Readonly<{
  root: string;
  publicPageEntrypoints(): readonly string[];
  canonicalFile(path: string): string | null;
  read(canonicalPath: string): string;
}>;

const publicRoot = "app/[locale]/(public)";
const publicLayout = `${publicRoot}/layout.tsx`;
const sourceExtensions = [".ts", ".tsx"] as const;

function normalizePath(path: string): string {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

function isWithin(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path);
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !pathFromRoot.startsWith("../") && !pathFromRoot.startsWith("..\\") && !pathFromRoot.includes(":");
}

function collectPublicPageEntrypoints(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectPublicPageEntrypoints(path);
    return entry.isFile() && /^page\.tsx?$/.test(entry.name) ? [realpathSync(path)] : [];
  });
}

function nodeSourceReader(): SourceReader {
  const root = realpathSync(resolve(process.cwd()));
  return {
    root,
    publicPageEntrypoints: () => collectPublicPageEntrypoints(join(root, publicRoot)),
    canonicalFile: (path) => {
      try {
        const canonicalPath = realpathSync(path);
        return statSync(canonicalPath).isFile() ? canonicalPath : null;
      } catch {
        return null;
      }
    },
    read: (canonicalPath) => readFileSync(canonicalPath, "utf8"),
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

function resolveLocalImport(from: string, specifier: string, reader: SourceReader): string | null {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
  const explicitExtension = extname(specifier);
  if (explicitExtension && !sourceExtensions.includes(explicitExtension as (typeof sourceExtensions)[number])) return null;
  const base = specifier.startsWith("@/")
    ? resolve(reader.root, specifier.slice(2))
    : resolve(dirname(from), specifier);
  const candidates = explicitExtension
    ? [base]
    : sourceExtensions.flatMap((extension) => [`${base}${extension}`, join(base, `index${extension}`)]);
  for (const candidate of candidates) {
    const canonicalPath = reader.canonicalFile(candidate);
    if (canonicalPath && isWithin(reader.root, canonicalPath)) return canonicalPath;
  }
  return null;
}

function projectSources(reader: SourceReader = nodeSourceReader()): SourceFile[] {
  const owner = reader.canonicalFile(join(reader.root, publicLayout));
  const pending = [...reader.publicPageEntrypoints(), ...(owner ? [owner] : [])];
  const visited = new Set<string>();
  const sources = new Map<string, SourceFile>();
  const specifiers = new Map<string, string[]>();

  while (pending.length) {
    const canonicalPath = pending.shift();
    if (!canonicalPath || visited.has(canonicalPath) || !isWithin(reader.root, canonicalPath)) continue;
    visited.add(canonicalPath);
    let source = sources.get(canonicalPath);
    if (!source) {
      source = {path: normalizePath(relative(reader.root, canonicalPath)), source: reader.read(canonicalPath)};
      sources.set(canonicalPath, source);
    }
    let imports = specifiers.get(canonicalPath);
    if (!imports) {
      imports = staticSpecifiers(source.source, source.path);
      specifiers.set(canonicalPath, imports);
    }
    for (const specifier of imports) {
      const dependency = resolveLocalImport(canonicalPath, specifier, reader);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited].map((path) => sources.get(path)!).filter(Boolean);
}

function inMemorySourceReader(sources: readonly SourceFile[], onRead?: (path: string) => void): SourceReader {
  const root = resolve("landmark-contract-fixture");
  const byCanonicalPath = new Map(sources.map((source) => [resolve(root, source.path), source.source]));
  return {
    root,
    publicPageEntrypoints: () => sources
      .filter(({path}) => path.startsWith(`${publicRoot}/`) && /\/page\.tsx?$/.test(path))
      .map(({path}) => resolve(root, path)),
    canonicalFile: (path) => {
      const canonicalPath = resolve(path);
      return byCanonicalPath.has(canonicalPath) ? canonicalPath : null;
    },
    read: (canonicalPath) => {
      onRead?.(normalizePath(relative(root, canonicalPath)));
      const source = byCanonicalPath.get(canonicalPath);
      if (source === undefined) throw new Error(`missing fixture source: ${canonicalPath}`);
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
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && node.tagName.text === "main") elements.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return elements;
}

function hasMainContentId(main: ts.JsxOpeningLikeElement): boolean {
  return main.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
    && ts.isIdentifier(attribute.name) && attribute.name.text === "id" && !!attribute.initializer
    && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "main-content");
}

function ownerMainIssues(source: string | undefined): string[] {
  const mains = source ? jsxMainElements(source) : [];
  if (mains.length !== 1) return [`expected exactly one <main>, found ${mains.length}`];
  return hasMainContentId(mains[0]!) ? [] : ["owner <main> must have id=\"main-content\""];
}

describe("public landmark contract", () => {
  it("requires the public layout to own exactly one named main landmark", () => {
    expect(ownerMainIssues(projectSources().find(({path}) => path === publicLayout)?.source)).toEqual([]);
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
    expect(projectSources(inMemorySourceReader(sources, (path) => reads.push(path))).map(({path}) => path))
      .toEqual([`${publicRoot}/sample/page.tsx`, publicLayout, "components/site/shared.tsx"]);
    expect(reads).toEqual([`${publicRoot}/sample/page.tsx`, publicLayout, "components/site/shared.tsx"]);
  });

  it("discovers public page.ts re-exports of TSX landmark offenders", () => {
    expect(nestedMainOffenders([
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: `${publicRoot}/typed/page.ts`, source: 'export {default} from "@/components/site/typed-offender";'},
      {path: "components/site/typed-offender.tsx", source: "<main/>"},
    ])).toEqual(["components/site/typed-offender.tsx"]);
  });

  it("never reads explicit JSON or CSS imports", () => {
    const reads: string[] = [];
    const sources: SourceFile[] = [
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: `${publicRoot}/assets/page.tsx`, source: 'import "@/fixtures/hostile.json"; import "@/fixtures/hostile.css";'},
      {path: "fixtures/hostile.json", source: "<main/>"}, {path: "fixtures/hostile.css", source: "<main/>"},
    ];
    expect(projectSources(inMemorySourceReader(sources, (path) => reads.push(path))).map(({path}) => path))
      .toEqual([`${publicRoot}/assets/page.tsx`, publicLayout]);
    expect(reads).toEqual([`${publicRoot}/assets/page.tsx`, publicLayout]);
  });

  it("does not let an extensionless file shadow a TypeScript sibling", () => {
    const reads: string[] = [];
    const sources: SourceFile[] = [
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: `${publicRoot}/shadow/page.tsx`, source: 'import "@/components/site/shadow";'},
      {path: "components/site/shadow", source: "<main/>"}, {path: "components/site/shadow.tsx", source: "export const safe = true;"},
    ];
    expect(nestedMainOffenders(sources)).toEqual([]);
    expect(projectSources(inMemorySourceReader(sources, (path) => reads.push(path))).map(({path}) => path))
      .toEqual([`${publicRoot}/shadow/page.tsx`, publicLayout, "components/site/shadow.tsx"]);
    expect(reads).toEqual([`${publicRoot}/shadow/page.tsx`, publicLayout, "components/site/shadow.tsx"]);
  });

  it("canonicalizes alias and relative dot segments to one cached physical source", () => {
    const reads: string[] = [];
    const sources: SourceFile[] = [
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: `${publicRoot}/cache/page.tsx`, source: 'import "@/components/site/./alias-shared"; import "@/components/site/./shared"; import "../../../../components/site/./shared";'},
      {path: "components/site/alias-shared.tsx", source: "export const aliasShared = true;"},
      {path: "components/site/shared.tsx", source: "export const shared = true;"},
    ];
    expect(projectSources(inMemorySourceReader(sources, (path) => reads.push(path))).map(({path}) => path))
      .toEqual([`${publicRoot}/cache/page.tsx`, publicLayout, "components/site/alias-shared.tsx", "components/site/shared.tsx"]);
    expect(reads).toEqual([`${publicRoot}/cache/page.tsx`, publicLayout, "components/site/alias-shared.tsx", "components/site/shared.tsx"]);
  });

  it("never reads alias or relative imports that escape the repository root", () => {
    const reads: string[] = [];
    const sources: SourceFile[] = [
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: `${publicRoot}/escape/page.tsx`, source: 'import "@/../outside"; import "../../../../../outside";'},
      {path: "../outside.tsx", source: "<main/>"},
    ];
    expect(projectSources(inMemorySourceReader(sources, (path) => reads.push(path))).map(({path}) => path))
      .toEqual([`${publicRoot}/escape/page.tsx`, publicLayout]);
    expect(reads).toEqual([`${publicRoot}/escape/page.tsx`, publicLayout]);
  });

  it("resolves index.tsx from a public page.ts entrypoint", () => {
    expect(nestedMainOffenders([
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: `${publicRoot}/indexed/page.ts`, source: 'export * from "@/components/site/indexed";'},
      {path: "components/site/indexed/index.tsx", source: "<main/>"},
    ])).toEqual(["components/site/indexed/index.tsx"]);
  });

  it("discovers nested mains through public import and re-export reachability", () => {
    expect(nestedMainOffenders([
      {path: publicLayout, source: '<main id="main-content"/>'},
      {path: `${publicRoot}/sample/page.tsx`, source: 'import "@/components/site/external-main"; import "@/components/site/barrel";'},
      {path: "components/site/external-main.tsx", source: "<main/>"},
      {path: "components/site/barrel.ts", source: 'export * from "./reexported-main";'},
      {path: "components/site/reexported-main.tsx", source: "<main/>"},
      {path: "components/marketing/unreferenced-main.tsx", source: "<main/>"},
    ])).toEqual(["components/site/external-main.tsx", "components/site/reexported-main.tsx"]);
  });

  it("keeps the public layout as the sole reachable main landmark owner", () => {
    expect(nestedMainOffenders(projectSources())).toEqual([]);
  });
});
