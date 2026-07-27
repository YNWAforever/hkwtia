import {mkdtemp, readdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, relative, resolve} from "node:path";

import ts from "typescript";
import {describe, expect, it} from "vitest";

const root = resolve(process.cwd(), "lib");
const repositoryOnlyRuntimeImports = new Set([
  "@/lib/db/client",
  "@/lib/db/repos/common",
  "@/lib/db/server-schema",
]);

function staticModuleText(expression: ts.Expression): string | null {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (
    ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticModuleText(expression.left);
    const right = staticModuleText(expression.right);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const interpolated = staticModuleText(span.expression);
      if (interpolated === null) return null;
      value += interpolated + span.literal.text;
    }
    return value;
  }
  return null;
}

function leadingStaticModuleText(expression: ts.Expression): string {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) return expression.head.text;
  if (
    ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticModuleText(expression.left);
    return left ?? leadingStaticModuleText(expression.left);
  }
  return "";
}

function classifiedDatabaseSpecifier(expression: ts.Expression): string | null {
  const exact = staticModuleText(expression);
  if (exact !== null) return repositoryOnlyRuntimeImports.has(exact) ? exact : null;
  const prefix = leadingStaticModuleText(expression);
  return prefix && [...repositoryOnlyRuntimeImports].some((specifier) => specifier.startsWith(prefix))
    ? "@/lib/db/*"
    : null;
}

function runtimeDatabaseImportSpecifiers(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    "candidate.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const specifiers = new Set<string>();

  function addExpression(expression: ts.Expression): void {
    const specifier = classifiedDatabaseSpecifier(expression);
    if (specifier) specifiers.add(specifier);
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const isRuntime = !clause
        || (!clause.isTypeOnly && (
          Boolean(clause.name)
          || (bindings && ts.isNamespaceImport(bindings))
          || (bindings && ts.isNamedImports(bindings) && (
            bindings.elements.length === 0
            || bindings.elements.some((element) => !element.isTypeOnly)
          ))
        ));
      if (isRuntime) addExpression(node.moduleSpecifier);
      return;
    }

    if (ts.isImportEqualsDeclaration(node)) {
      if (
        !node.isTypeOnly
        && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression
      ) {
        addExpression(node.moduleReference.expression);
      }
      return;
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const clause = node.exportClause;
      const isRuntime = !node.isTypeOnly && (
        !clause
        || ts.isNamespaceExport(clause)
        || (ts.isNamedExports(clause) && (
          clause.elements.length === 0
          || clause.elements.some((element) => !element.isTypeOnly)
        ))
      );
      if (isRuntime) addExpression(node.moduleSpecifier);
      return;
    }

    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) addExpression(node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...specifiers];
}

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

  it("allows runtime database imports only within repositories", async () => {
    const violations: string[] = [];
    for (const file of await productionTypeScriptFiles(root)) {
      const relativePath = relative(root, file).replaceAll("\\", "/");
      if (relativePath.startsWith("db/repos/")) continue;
      const source = await readFile(file, "utf8");
      for (const specifier of runtimeDatabaseImportSpecifiers(source)) {
        violations.push(`${relativePath}: ${specifier}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("distinguishes runtime server-schema imports from type-only imports", () => {
    expect(runtimeDatabaseImportSpecifiers(
      'import {profiles} from "@/lib/db/server-schema";',
    )).toEqual(["@/lib/db/server-schema"]);
    expect(runtimeDatabaseImportSpecifiers(
      'import type {Profile} from "@/lib/db/server-schema";',
    )).toEqual([]);
    expect(runtimeDatabaseImportSpecifiers(
      'import {type Profile} from "@/lib/db/server-schema";',
    )).toEqual([]);
  });

  it.each([
    ["dynamic server schema", 'void import("@/lib/db/server-schema");', "@/lib/db/server-schema"],
    ["dynamic client", 'void import("@/lib/db/client");', "@/lib/db/client"],
    ["dynamic common", 'void import("@/lib/db/repos/common");', "@/lib/db/repos/common"],
    ["CommonJS require", 'const schema = require("@/lib/db/server-schema");', "@/lib/db/server-schema"],
    ["TypeScript import equals", 'import client = require("@/lib/db/client");', "@/lib/db/client"],
    ["runtime named re-export", 'export {profiles} from "@/lib/db/server-schema";', "@/lib/db/server-schema"],
    ["runtime export star", 'export * from "@/lib/db/client";', "@/lib/db/client"],
    [
      "mixed runtime re-export",
      'export {type Profile, profiles} from "@/lib/db/server-schema";',
      "@/lib/db/server-schema",
    ],
    [
      "computed dynamic import",
      'void import("@/lib/db/" + "server-schema");',
      "@/lib/db/server-schema",
    ],
    [
      "unresolved DB-alias dynamic import",
      'declare const moduleName: string; void import(`@/lib/db/${moduleName}`);',
      "@/lib/db/*",
    ],
  ])("detects %s", (_name, source, expectedSpecifier) => {
    expect(runtimeDatabaseImportSpecifiers(source)).toContain(expectedSpecifier);
  });

  it.each([
    'import type {Profile} from "@/lib/db/server-schema";',
    'import {type Profile, type Company} from "@/lib/db/server-schema";',
    'import type schema = require("@/lib/db/server-schema");',
    'export type {Profile} from "@/lib/db/server-schema";',
    'export {type Profile, type Company} from "@/lib/db/server-schema";',
    'export type * from "@/lib/db/server-schema";',
  ])("allows type-only database module syntax: %s", (source) => {
    expect(runtimeDatabaseImportSpecifiers(source)).toEqual([]);
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
