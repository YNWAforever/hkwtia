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
});
