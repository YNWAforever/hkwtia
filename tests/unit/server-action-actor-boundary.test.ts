import {readdirSync, readFileSync} from "node:fs";
import {join, relative, resolve} from "node:path";

import ts from "typescript";
import {describe, expect, it} from "vitest";

/**
 * `"use server"` publishes EVERY export of a module as an HTTP-callable
 * endpoint, not only the ones a form is bound to. An exported function whose
 * caller supplies the `actor` therefore performs no authorization at all: an
 * unauthenticated POST carrying `{"kind":"staff"}` satisfies `requireAdmin`,
 * because that check reads a property off an object the attacker sent.
 *
 * This was live. A cookie-less request to a published action id reached
 * `update "showcase_listings" set "logo_media_id" = $1` with a forged staff
 * actor. Every action module must therefore resolve its own actor from the
 * session, and actor-taking cores belong in a plain `server-only` module.
 */
const actorParameterNames = new Set(["actor", "_actor", "adminActor", "sessionActor"]);
const actorTypeNames = new Set([
  "Actor", "AdminActor", "SessionActor", "AgentRunActor", "ScheduledAgentActor", "ConciergeAgentActor",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return entry.isFile() && (path.endsWith(".ts") || path.endsWith(".tsx")) ? [path] : [];
  });
}

function isUseServerModule(source: string): boolean {
  return /^\s*(["'])use server\1\s*;?/.test(source);
}

function typeNameOf(node: ts.TypeNode | undefined): string | null {
  if (!node) return null;
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName;
    return ts.isIdentifier(name) ? name.text : name.right.text;
  }
  // Extract<Actor, {...}> and unions such as `Actor | null` resolve through here.
  if (ts.isUnionTypeNode(node)) {
    for (const member of node.types) {
      const inner = typeNameOf(member);
      if (inner && actorTypeNames.has(inner)) return inner;
    }
  }
  return null;
}

function actorTakingExports(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(
    fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const offenders: string[] = [];

  for (const statement of file.statements) {
    const exported = ts.canHaveModifiers(statement)
      && ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;

    const declarations: {name: string; parameters: readonly ts.ParameterDeclaration[]}[] = [];
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.push({name: statement.name.text, parameters: statement.parameters});
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (!ts.isIdentifier(declaration.name) || !initializer) continue;
        if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
          declarations.push({name: declaration.name.text, parameters: initializer.parameters});
        }
      }
    }

    for (const {name, parameters} of declarations) {
      const offending = parameters.find((parameter) => {
        const byName = ts.isIdentifier(parameter.name)
          && actorParameterNames.has(parameter.name.text);
        const type = typeNameOf(parameter.type);
        const byType = type !== null && actorTypeNames.has(type);
        return byName || byType;
      });
      if (offending) offenders.push(name);
    }
  }

  return offenders;
}

function nonAsyncFunctionExports(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(
    fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const runtimeBindings = new Map<string, ts.Node>();
  const offenders = new Set<string>();

  const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean => (
    ts.canHaveModifiers(node)
    && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === kind))
  );

  const bindingNames = (name: ts.BindingName): string[] => {
    if (ts.isIdentifier(name)) return [name.text];
    return name.elements.flatMap((element) => (
      ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
    ));
  };

  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      runtimeBindings.set(statement.name.text, statement);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          runtimeBindings.set(declaration.name.text, declaration.initializer);
        }
      }
      continue;
    }
    if (
      (ts.isClassDeclaration(statement)
        || ts.isEnumDeclaration(statement)
        || ts.isModuleDeclaration(statement))
      && statement.name
    ) {
      runtimeBindings.set(statement.name.text, statement);
    }
  }

  const isProvablyAsync = (node: ts.Node | undefined, seen = new Set<string>()): boolean => {
    if (!node) return false;
    if (
      ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node)
    ) {
      return hasModifier(node, ts.SyntaxKind.AsyncKeyword);
    }
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return false;
      const nextSeen = new Set(seen);
      nextSeen.add(node.text);
      return isProvablyAsync(runtimeBindings.get(node.text), nextSeen);
    }
    if (
      ts.isParenthesizedExpression(node)
      || ts.isAsExpression(node)
      || ts.isTypeAssertionExpression(node)
      || ts.isSatisfiesExpression(node)
      || ts.isNonNullExpression(node)
    ) {
      return isProvablyAsync(node.expression, seen);
    }
    return false;
  };

  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      if (!statement.exportClause) {
        offenders.add("*");
        continue;
      }
      if (ts.isNamespaceExport(statement.exportClause)) {
        offenders.add(statement.exportClause.name.text);
        continue;
      }
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const exportedName = element.name.text;
        if (statement.moduleSpecifier) {
          offenders.add(exportedName);
          continue;
        }
        const localName = element.propertyName ?? element.name;
        if (!ts.isIdentifier(localName) || !isProvablyAsync(localName)) {
          offenders.add(exportedName);
        }
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      if (!isProvablyAsync(statement.expression)) {
        offenders.add(statement.isExportEquals ? "export=" : "default");
      }
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) continue;
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;

    if (ts.isFunctionDeclaration(statement)) {
      // A bodyless overload declaration is erased; its concrete implementation
      // is inventoried separately (or resolved through a local export list).
      if (!statement.body) continue;
      const exportedName = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
        ? "default"
        : statement.name?.text ?? "default";
      if (!isProvablyAsync(statement)) offenders.add(exportedName);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const names = bindingNames(declaration.name);
        if (
          !ts.isIdentifier(declaration.name)
          || !isProvablyAsync(declaration.initializer)
        ) {
          for (const name of names) offenders.add(name);
        }
      }
      continue;
    }

    if (
      ts.isClassDeclaration(statement)
      || ts.isEnumDeclaration(statement)
      || ts.isModuleDeclaration(statement)
    ) {
      const exportedName = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
        ? "default"
        : statement.name?.text ?? "default";
      offenders.add(exportedName);
      continue;
    }

    if (ts.isImportEqualsDeclaration(statement) && !statement.isTypeOnly) {
      offenders.add(statement.name.text);
    }
  }

  return [...offenders];
}

const modules = ["lib", "app"]
  .flatMap((root) => sourceFiles(resolve(process.cwd(), root)))
  .filter((path) => isUseServerModule(readFileSync(path, "utf8")))
  .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"))
  .sort();

describe("Server Action actor boundary", () => {
  it("discovers every \"use server\" module", () => {
    // Vacuous-pass guard: a broken walk would make every assertion below
    // trivially true.
    expect(modules.length).toBeGreaterThanOrEqual(15);
    for (const known of [
      "lib/admin/showcase-actions.ts",
      "lib/admin/media-actions.ts",
      "lib/portal/commands.ts",
      "lib/showcase/member-actions.ts",
      "lib/launchpad/member-actions.ts",
      "app/[locale]/(join)/join/actions.ts",
    ]) {
      expect(modules, known).toContain(known);
    }
  });

  it.each(modules)("%s exports no function that accepts an actor", (path) => {
    const offenders = actorTakingExports(readFileSync(resolve(process.cwd(), path), "utf8"), path);

    expect(
      offenders,
      `${path} exports ${offenders.join(", ")} taking a caller-supplied actor. `
      + '"use server" publishes every export as an HTTP endpoint, so authorization '
      + "would be checking an object the caller sent. Move the core into a "
      + "server-only module and keep only the formData wrapper here.",
    ).toEqual([]);
  });

  it.each(modules)("%s exports only provably async runtime functions", (path) => {
    const offenders = nonAsyncFunctionExports(
      readFileSync(resolve(process.cwd(), path), "utf8"),
      path,
    );

    expect(
      offenders,
      `${path} has runtime exports that are not provably async functions: ${offenders.join(", ")}. `
      + 'Top-level "use server" exposes every runtime export as a Server Action, '
      + "and Next.js requires each one to be an async function. Keep only locally "
      + "resolvable async function exports here; move values, re-exports, and pure "
      + "helpers into a plain module.",
    ).toEqual([]);
  });

  it("detects the shapes it is meant to catch", () => {
    const hostile = [
      'export async function a(actor: AdminActor, id: string) { return id; }',
      'export async function b(session: Actor) { return session; }',
      'export async function c(actor: Extract<Actor, {kind: "member"}>) { return actor; }',
      'export const d = async (actor: AdminActor) => actor;',
      'export async function e(first: string, actor: Actor) { return actor; }',
    ];
    for (const source of hostile) {
      expect(actorTakingExports(source, "candidate.ts"), source).not.toEqual([]);
    }

    const safe = [
      'export async function f(path: string, formData: FormData) { return path; }',
      'async function g(actor: Actor) { return actor; }',
      'export type H = (actor: Actor) => void;',
      'export async function i(state: unknown, formData: FormData) { return state; }',
    ];
    for (const source of safe) {
      expect(actorTakingExports(source, "candidate.ts"), source).toEqual([]);
    }
  });

  it("inventories every runtime export and requires provably async functions", () => {
    const hostile: {source: string; offenders: string[]}[] = [
      {source: "export function a() { return true; }", offenders: ["a"]},
      {source: "export const b = () => true;", offenders: ["b"]},
      {source: "export const c = function () { return true; };", offenders: ["c"]},
      {
        source: "function hidden() { return true; } export {hidden};",
        offenders: ["hidden"],
      },
      {
        source: 'export {remote, other as renamed} from "./actions";',
        offenders: ["remote", "renamed"],
      },
      {source: 'export * from "./actions";', offenders: ["*"]},
      {source: "export default function () { return true; }", offenders: ["default"]},
      {source: "export = function () { return true; };", offenders: ["export="]},
      {
        source: "function hidden() { return true; } export const alias = hidden;",
        offenders: ["alias"],
      },
      {source: "export const value = 1, config = {};", offenders: ["value", "config"]},
      {source: "export const action = createAction();", offenders: ["action"]},
      {source: "const value = 1; export default value;", offenders: ["default"]},
      {
        source: 'import {action} from "./actions"; export {action};',
        offenders: ["action"],
      },
      {source: "export class Service {}", offenders: ["Service"]},
      {source: "export enum Mode {One}", offenders: ["Mode"]},
    ];
    for (const {source, offenders} of hostile) {
      expect(nonAsyncFunctionExports(source, "candidate.ts"), source).toEqual(offenders);
    }

    const safe = [
      "export async function direct() { return true; }",
      "export const arrow = async () => true;",
      "async function local() { return true; } export {local};",
      [
        "const first = async () => true;",
        "const second = first;",
        "const third = second;",
        "export {third as action};",
      ].join("\n"),
      [
        "type Local = () => void;",
        "interface Shape {value: string}",
        "export type Alias = Local;",
        "export interface PublicShape extends Shape {}",
        "export {type Local};",
        'export type {Remote} from "./types";',
      ].join("\n"),
      [
        "export function overloaded(value: string): Promise<string>;",
        "export async function overloaded(value: string) { return value; }",
      ].join("\n"),
      [
        "function localOverload(value: string): Promise<string>;",
        "async function localOverload(value: string) { return value; }",
        "export {localOverload};",
      ].join("\n"),
      "export default async function () { return true; }",
      "export default async () => true;",
    ];
    for (const source of safe) {
      expect(nonAsyncFunctionExports(source, "candidate.ts"), source).toEqual([]);
    }
  });
});
