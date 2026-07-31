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

type ConstAliases = ReadonlyMap<string, ts.Expression>;

function unwrapTransparentExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function collectConstAliases(sourceFile: ts.SourceFile): ConstAliases {
  const candidates = new Map<string, ts.Expression>();
  const ambiguous = new Set<string>();
  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isVariableDeclarationList(node.parent)
      && Boolean(node.parent.flags & ts.NodeFlags.Const)
    ) {
      const name = node.name.text;
      if (candidates.has(name)) {
        candidates.delete(name);
        ambiguous.add(name);
      } else if (!ambiguous.has(name)) {
        candidates.set(name, node.initializer);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return candidates;
}

function staticModuleText(
  expression: ts.Expression,
  aliases: ConstAliases,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  const current = unwrapTransparentExpression(expression);
  if (ts.isIdentifier(current)) {
    if (resolving.has(current.text)) return null;
    const initializer = aliases.get(current.text);
    if (!initializer) return null;
    return staticModuleText(
      initializer,
      aliases,
      new Set([...resolving, current.text]),
    );
  }
  if (ts.isStringLiteralLike(current)) return current.text;
  if (
    ts.isBinaryExpression(current)
    && current.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticModuleText(current.left, aliases, resolving);
    const right = staticModuleText(current.right, aliases, resolving);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(current)) {
    let value = current.head.text;
    for (const span of current.templateSpans) {
      const interpolated = staticModuleText(span.expression, aliases, resolving);
      if (interpolated === null) return null;
      value += interpolated + span.literal.text;
    }
    return value;
  }
  return null;
}

function leadingStaticModuleText(
  expression: ts.Expression,
  aliases: ConstAliases,
  resolving: ReadonlySet<string> = new Set(),
): string {
  const current = unwrapTransparentExpression(expression);
  if (ts.isIdentifier(current)) {
    if (resolving.has(current.text)) return "";
    const initializer = aliases.get(current.text);
    if (!initializer) return "";
    return leadingStaticModuleText(
      initializer,
      aliases,
      new Set([...resolving, current.text]),
    );
  }
  if (ts.isStringLiteralLike(current)) return current.text;
  if (ts.isTemplateExpression(current)) return current.head.text;
  if (
    ts.isBinaryExpression(current)
    && current.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticModuleText(current.left, aliases, resolving);
    return left ?? leadingStaticModuleText(current.left, aliases, resolving);
  }
  return "";
}

function classifiedDatabaseSpecifier(
  expression: ts.Expression,
  aliases: ConstAliases,
): string | null {
  const exact = staticModuleText(expression, aliases);
  if (exact !== null) return repositoryOnlyRuntimeImports.has(exact) ? exact : null;
  const prefix = leadingStaticModuleText(expression, aliases);
  return prefix && [...repositoryOnlyRuntimeImports].some((specifier) => specifier.startsWith(prefix))
    ? "@/lib/db/*"
    : null;
}

function runtimeDatabaseImportSpecifiers(
  source: string,
  scriptKind: ts.ScriptKind = ts.ScriptKind.TS,
): string[] {
  const sourceFile = ts.createSourceFile(
    "candidate.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const specifiers = new Set<string>();
  const aliases = collectConstAliases(sourceFile);

  function addExpression(expression: ts.Expression): void {
    const specifier = classifiedDatabaseSpecifier(expression, aliases);
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

    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const firstArgument = node.arguments[0];
      if ((isDynamicImport || isRequire) && firstArgument) addExpression(firstArgument);
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
      const scriptKind = file.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS;
      for (const specifier of runtimeDatabaseImportSpecifiers(source, scriptKind)) {
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

  it.each([
    [
      "parenthesized expression",
      'void import(("@/lib/db/server-schema"));',
      "@/lib/db/server-schema",
    ],
    [
      "as expression",
      'void import("@/lib/db/server-schema" as string);',
      "@/lib/db/server-schema",
    ],
    [
      "satisfies expression",
      'void import("@/lib/db/server-schema" satisfies string);',
      "@/lib/db/server-schema",
    ],
    [
      "non-null expression",
      'void import("@/lib/db/server-schema"!);',
      "@/lib/db/server-schema",
    ],
    [
      "type assertion expression",
      'void import(<string>"@/lib/db/server-schema");',
      "@/lib/db/server-schema",
    ],
    [
      "wrapped require",
      'const schema = require((("@/lib/db/server-schema" as string)!));',
      "@/lib/db/server-schema",
    ],
    [
      "direct const alias",
      'const schemaPath = "@/lib/db/server-schema" as const; void import(schemaPath);',
      "@/lib/db/server-schema",
    ],
    [
      "const alias chain",
      'const first = "@/lib/db/server-schema"; const second = first; void import(second);',
      "@/lib/db/server-schema",
    ],
    [
      "const alias with unresolved DB prefix",
      'declare const name: string; const path = "@/lib/db/" + name; void import(path);',
      "@/lib/db/*",
    ],
    [
      "two-argument dynamic import",
      'void import("@/lib/db/server-schema", {with: {type: "json"}});',
      "@/lib/db/server-schema",
    ],
  ])("normalizes and resolves %s", (_name, source, expectedSpecifier) => {
    expect(runtimeDatabaseImportSpecifiers(source)).toContain(expectedSpecifier);
  });

  it.each([
    "const first = second; const second = first; void import(first);",
    "declare const unknownPath: string; void import(unknownPath);",
  ])("handles cyclic or unknown aliases without classifying: %s", (source) => {
    expect(runtimeDatabaseImportSpecifiers(source)).toEqual([]);
  });

  it("keeps agent-run actors outside the membership Actor union", async () => {
    const lifecycle = await readFile(join(root, "membership", "lifecycle.ts"), "utf8");
    const agentActor = await readFile(join(root, "auth", "agent-actor.ts"), "utf8");
    const membershipActor = lifecycle.match(/export type Actor\s*=([\s\S]*?);/)?.[0];

    expect(membershipActor).toBeDefined();
    expect(membershipActor).not.toMatch(
      /kind:\s*["']agent["']|AgentRunActor/,
    );
    expect(agentActor).toContain('kind: "agent"');
    expect(agentActor).toContain(
      "export type AgentRunActor = ConciergeAgentActor | ScheduledAgentActor;",
    );
    expect(agentActor).toContain(
      "export type Actor = SessionActor | AgentRunActor;",
    );
  });
});
