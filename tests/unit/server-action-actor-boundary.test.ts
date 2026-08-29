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
const projectRoot = process.cwd();
const actorModuleExports = [
  {fileName: resolve(projectRoot, "lib/membership/lifecycle.ts"), exportName: "Actor"},
  {fileName: resolve(projectRoot, "lib/auth/agent-actor.ts"), exportName: "Actor"},
] as const;

function diagnosticMessage(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

const configPath = resolve(projectRoot, "tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  throw new Error(`Cannot read ${configPath}: ${diagnosticMessage(configFile.error)}`);
}
const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  projectRoot,
  {incremental: false, noEmit: true},
  configPath,
);
if (parsedConfig.errors.length > 0) {
  throw new Error(
    `Cannot parse ${configPath}: ${parsedConfig.errors.map(diagnosticMessage).join("; ")}`,
  );
}

type ActorAnalysis = {
  program: ts.Program;
  checker: ts.TypeChecker;
  actorTypes: readonly ts.Type[];
};

function normalizedPath(fileName: string): string {
  return resolve(fileName).replaceAll("\\", "/").toLowerCase();
}

function createAnalysisProgram(
  rootNames: readonly string[],
  virtualSources: ReadonlyMap<string, string> = new Map(),
): ts.Program {
  const sourcesByPath = new Map(
    [...virtualSources].map(([fileName, source]) => [normalizedPath(fileName), source]),
  );
  const host = ts.createCompilerHost(parsedConfig.options, true);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  const baseGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (fileName) => (
    sourcesByPath.has(normalizedPath(fileName)) || baseFileExists(fileName)
  );
  host.readFile = (fileName) => (
    sourcesByPath.get(normalizedPath(fileName)) ?? baseReadFile(fileName)
  );
  host.getSourceFile = (
    fileName,
    languageVersionOrOptions,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    const source = sourcesByPath.get(normalizedPath(fileName));
    if (source === undefined) {
      return baseGetSourceFile(
        fileName,
        languageVersionOrOptions,
        onError,
        shouldCreateNewSourceFile,
      );
    }
    return ts.createSourceFile(
      fileName,
      source,
      languageVersionOrOptions,
      true,
      fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
  };

  const uniqueRootNames = new Map<string, string>();
  for (const fileName of [...rootNames, ...virtualSources.keys()]) {
    uniqueRootNames.set(normalizedPath(fileName), resolve(fileName));
  }
  return ts.createProgram({
    rootNames: [...uniqueRootNames.values()],
    options: parsedConfig.options,
    host,
  });
}

function sourceFileInProgram(program: ts.Program, fileName: string): ts.SourceFile {
  const normalizedFileName = normalizedPath(fileName);
  const sourceFile = program.getSourceFiles().find(
    (candidate) => normalizedPath(candidate.fileName) === normalizedFileName,
  );
  if (!sourceFile) {
    throw new Error(`Actor analysis Program did not include ${fileName}`);
  }
  return sourceFile;
}

function createActorAnalysis(
  rootNames: readonly string[],
  virtualSources: ReadonlyMap<string, string> = new Map(),
): ActorAnalysis {
  const program = createAnalysisProgram(
    [...rootNames, ...actorModuleExports.map(({fileName}) => fileName)],
    virtualSources,
  );
  const checker = program.getTypeChecker();
  const actorTypes = actorModuleExports.map(({fileName, exportName}) => {
    const moduleFile = sourceFileInProgram(program, fileName);
    const moduleSymbol = checker.getSymbolAtLocation(moduleFile);
    if (!moduleSymbol) {
      throw new Error(`Cannot resolve module symbol for canonical actor module ${fileName}`);
    }
    const exportedSymbol = checker.getExportsOfModule(moduleSymbol).find(
      (candidate) => candidate.name === exportName,
    );
    if (!exportedSymbol) {
      throw new Error(`Cannot resolve canonical actor export ${exportName} from ${fileName}`);
    }
    const targetSymbol = exportedSymbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exportedSymbol)
      : exportedSymbol;
    const actorType = checker.getDeclaredTypeOfSymbol(targetSymbol);
    if (actorType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) {
      throw new Error(
        `Canonical actor export ${exportName} from ${fileName} resolved to `
        + checker.typeToString(actorType),
      );
    }
    return actorType;
  });
  if (actorTypes.length !== actorModuleExports.length) {
    throw new Error("Canonical actor type resolution was incomplete");
  }
  return {program, checker, actorTypes};
}

const actorFixturePrelude = [
  'import type {Actor, AdminActor, Actor as SessionActor} from "@/lib/membership/lifecycle";',
  'import type {AgentRunActor, ScheduledAgentActor, ConciergeAgentActor} from "@/lib/auth/agent-actor";',
].join("\n");

function actorFixtureSource(source: string): string {
  return source.includes('from "@/lib/')
    ? source
    : `${actorFixturePrelude}\n${source}`;
}

type RuntimeFunctionNode =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

type RuntimeExport = {
  name: string;
  functionNode: RuntimeFunctionNode | null;
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return entry.isFile() && (path.endsWith(".ts") || path.endsWith(".tsx")) ? [path] : [];
  });
}

function isUseServerModule(source: string, fileName = "candidate.ts"): boolean {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  for (const statement of file.statements) {
    if (
      !ts.isExpressionStatement(statement)
      || !ts.isStringLiteral(statement.expression)
    ) {
      return false;
    }
    if (statement.expression.text === "use server") return true;
  }
  return false;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => (
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
  ));
}

function localRuntimeExports(file: ts.SourceFile): RuntimeExport[] {
  const runtimeBindings = new Map<string, ts.Node>();
  const erasedBindings = new Set<string>();

  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      if (statement.body && !hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
        runtimeBindings.set(statement.name.text, statement);
      } else {
        erasedBindings.add(statement.name.text);
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const declared = hasModifier(statement, ts.SyntaxKind.DeclareKeyword);
      for (const declaration of statement.declarationList.declarations) {
        const names = bindingNames(declaration.name);
        if (declared) {
          for (const name of names) erasedBindings.add(name);
        } else if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          runtimeBindings.set(declaration.name.text, declaration.initializer);
        }
      }
      continue;
    }

    if (
      ts.isClassDeclaration(statement)
      || ts.isEnumDeclaration(statement)
      || ts.isModuleDeclaration(statement)
    ) {
      if (!statement.name) continue;
      if (hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
        erasedBindings.add(statement.name.text);
      } else {
        runtimeBindings.set(statement.name.text, statement);
      }
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      erasedBindings.add(statement.name.text);
      continue;
    }

    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const {importClause} = statement;
      if (importClause.isTypeOnly) {
        if (importClause.name) erasedBindings.add(importClause.name.text);
        if (importClause.namedBindings) {
          if (ts.isNamespaceImport(importClause.namedBindings)) {
            erasedBindings.add(importClause.namedBindings.name.text);
          } else {
            for (const element of importClause.namedBindings.elements) {
              erasedBindings.add(element.name.text);
            }
          }
        }
      } else if (
        importClause.namedBindings
        && ts.isNamedImports(importClause.namedBindings)
      ) {
        for (const element of importClause.namedBindings.elements) {
          if (element.isTypeOnly) erasedBindings.add(element.name.text);
        }
      }
      continue;
    }

    if (ts.isImportEqualsDeclaration(statement) && statement.isTypeOnly) {
      erasedBindings.add(statement.name.text);
    }
  }

  const resolveFunction = (
    node: ts.Node | undefined,
    seen = new Set<string>(),
  ): RuntimeFunctionNode | null => {
    if (!node) return null;
    if (
      ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node)
    ) {
      return node;
    }
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return null;
      const nextSeen = new Set(seen);
      nextSeen.add(node.text);
      return resolveFunction(runtimeBindings.get(node.text), nextSeen);
    }
    if (
      ts.isParenthesizedExpression(node)
      || ts.isAsExpression(node)
      || ts.isTypeAssertionExpression(node)
      || ts.isSatisfiesExpression(node)
      || ts.isNonNullExpression(node)
    ) {
      return resolveFunction(node.expression, seen);
    }
    return null;
  };

  const exports: RuntimeExport[] = [];
  const addExport = (name: string, node: ts.Node | undefined): void => {
    exports.push({name, functionNode: resolveFunction(node)});
  };

  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      if (!statement.exportClause) {
        addExport("*", undefined);
        continue;
      }
      if (ts.isNamespaceExport(statement.exportClause)) {
        addExport(statement.exportClause.name.text, undefined);
        continue;
      }
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const exportedName = element.name.text;
        if (statement.moduleSpecifier) {
          addExport(exportedName, undefined);
          continue;
        }
        const localName = element.propertyName ?? element.name;
        if (
          ts.isIdentifier(localName)
          && erasedBindings.has(localName.text)
          && !runtimeBindings.has(localName.text)
        ) {
          continue;
        }
        addExport(
          exportedName,
          ts.isIdentifier(localName) ? runtimeBindings.get(localName.text) : undefined,
        );
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      if (
        ts.isIdentifier(statement.expression)
        && erasedBindings.has(statement.expression.text)
        && !runtimeBindings.has(statement.expression.text)
      ) {
        continue;
      }
      addExport(statement.isExportEquals ? "export=" : "default", statement.expression);
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) continue;
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;

    if (ts.isFunctionDeclaration(statement)) {
      // A bodyless overload declaration is erased. Its concrete implementation
      // is inventoried directly or resolved through a local export list.
      if (!statement.body) continue;
      addExport(
        hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
          ? "default"
          : statement.name?.text ?? "default",
        statement,
      );
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          addExport(declaration.name.text, declaration.initializer);
        } else {
          for (const name of bindingNames(declaration.name)) addExport(name, undefined);
        }
      }
      continue;
    }

    if (
      ts.isClassDeclaration(statement)
      || ts.isEnumDeclaration(statement)
      || ts.isModuleDeclaration(statement)
    ) {
      addExport(
        hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
          ? "default"
          : statement.name?.text ?? "default",
        statement,
      );
      continue;
    }

    if (ts.isImportEqualsDeclaration(statement) && !statement.isTypeOnly) {
      addExport(statement.name.text, statement);
    }
  }

  return exports;
}

function isActorType(
  type: ts.Type,
  checker: ts.TypeChecker,
  actorTypes: readonly ts.Type[],
  seen = new Set<ts.Type>(),
): boolean {
  if (seen.has(type)) return false;
  seen.add(type);

  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) {
    return false;
  }
  if (type.isUnion()) {
    return type.types.some((member) => isActorType(member, checker, actorTypes, seen));
  }
  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constraint = checker.getBaseConstraintOfType(type);
    return Boolean(
      constraint
      && constraint !== type
      && isActorType(constraint, checker, actorTypes, seen),
    );
  }
  return actorTypes.some((actorType) => checker.isTypeAssignableTo(type, actorType));
}

function actorTakingExports(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
  actorTypes: readonly ts.Type[],
): string[] {
  return localRuntimeExports(file).flatMap(({name, functionNode}) => {
    if (!functionNode) return [];
    const offending = functionNode.parameters.some((parameter) => {
      const byName = ts.isIdentifier(parameter.name)
        && actorParameterNames.has(parameter.name.text);
      const byType = parameter.type
        ? isActorType(checker.getTypeFromTypeNode(parameter.type), checker, actorTypes)
        : false;
      return byName || byType;
    });
    return offending ? [name] : [];
  });
}

function nonAsyncFunctionExports(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(
    fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  return localRuntimeExports(file)
    .filter(({functionNode}) => (
      !functionNode || !hasModifier(functionNode, ts.SyntaxKind.AsyncKeyword)
    ))
    .map(({name}) => name);
}

const modules = ["lib", "app"]
  .flatMap((root) => sourceFiles(resolve(projectRoot, root)))
  .filter((path) => isUseServerModule(readFileSync(path, "utf8"), path))
  .map((path) => relative(projectRoot, path).replaceAll("\\", "/"))
  .sort();

const repositoryActorAnalysis = createActorAnalysis(
  modules.map((fileName) => resolve(projectRoot, fileName)),
);

describe("Server Action actor boundary", () => {
  it("discovers use-server directives through legal directive prologue trivia", () => {
    const serverModules = [
      '// server actions\n"use server";\nexport async function action() {}',
      '/* server actions */\n"use server"\nexport async function action() {}',
      '/*! licensed */\n\'use server\';\nexport async function action() {}',
      '#!/usr/bin/env node\n"use server";\nexport async function action() {}',
      '"use strict";\n"use server";\nexport async function action() {}',
    ];
    for (const source of serverModules) {
      expect(isUseServerModule(source), source).toBe(true);
    }

    expect(isUseServerModule([
      "const booted = true;",
      '"use server";',
      "export async function action() {}",
    ].join("\n"))).toBe(false);
  });

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
    const file = sourceFileInProgram(
      repositoryActorAnalysis.program,
      resolve(projectRoot, path),
    );
    const offenders = actorTakingExports(
      file,
      repositoryActorAnalysis.checker,
      repositoryActorAnalysis.actorTypes,
    );

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

  it("detects actor-taking runtime functions through every local export shape", () => {
    const hostile: {source: string; offenders: string[]}[] = [
      {
        source: [
          'import type {AuthenticatedActor} from "@/lib/membership/lifecycle";',
          "export async function actual(principal: AuthenticatedActor) { return principal; }",
        ].join("\n"),
        offenders: ["actual"],
      },
      {
        source: [
          'import type {AuthenticatedActor as Principal} from "@/lib/membership/lifecycle";',
          "export async function importedAlias(principal: Principal) { return principal; }",
        ].join("\n"),
        offenders: ["importedAlias"],
      },
      {
        source: [
          'import type {AuthenticatedActor} from "@/lib/membership/lifecycle";',
          "type LocalPrincipal = AuthenticatedActor;",
          "export async function localAlias(principal: LocalPrincipal) { return principal; }",
        ].join("\n"),
        offenders: ["localAlias"],
      },
      {
        source: [
          'import type {AuthenticatedActor} from "@/lib/membership/lifecycle";',
          "type FirstPrincipal = AuthenticatedActor;",
          "type SecondPrincipal = FirstPrincipal;",
          "export async function multiHop(principal: SecondPrincipal) { return principal; }",
        ].join("\n"),
        offenders: ["multiHop"],
      },
      {
        source: [
          'import type {Actor} from "@/lib/membership/lifecycle";',
          "export async function nullable(principal: Actor | null) { return principal; }",
        ].join("\n"),
        offenders: ["nullable"],
      },
      {
        source: [
          'import type {AgentRunActor as AgentPrincipal} from "@/lib/auth/agent-actor";',
          "export const agentAlias = async (principal: AgentPrincipal) => principal;",
        ].join("\n"),
        offenders: ["agentAlias"],
      },
      {
        source: 'export async function a(actor: AdminActor, id: string) { return id; }',
        offenders: ["a"],
      },
      {
        source: 'export async function b(session: Actor) { return session; }',
        offenders: ["b"],
      },
      {
        source: 'export async function c(actor: Extract<Actor, {kind: "member"}>) { return actor; }',
        offenders: ["c"],
      },
      {
        source: 'export const d = async (actor: AdminActor) => actor;',
        offenders: ["d"],
      },
      {
        source: 'export async function e(first: string, actor: Actor) { return actor; }',
        offenders: ["e"],
      },
      {
        source: 'export async function byAlias(sessionActor: unknown) { return sessionActor; }',
        offenders: ["byAlias"],
      },
      {
        source: 'export async function byType(principal: ConciergeAgentActor) { return principal; }',
        offenders: ["byType"],
      },
      {
        source: 'async function hidden(actor: Actor) { return actor; } export {hidden};',
        offenders: ["hidden"],
      },
      {
        source: 'const hidden = async (actor: Actor) => actor; export {hidden};',
        offenders: ["hidden"],
      },
      {
        source: 'async function hidden(actor: Actor) { return actor; } export const alias = hidden;',
        offenders: ["alias"],
      },
      {
        source: [
          "async function hidden(principal: AdminActor) { return principal; }",
          "const first = hidden;",
          "const second = first;",
          "export {second as action};",
        ].join("\n"),
        offenders: ["action"],
      },
      {
        source: 'async function hidden(principal: SessionActor) { return principal; } export {hidden as default};',
        offenders: ["default"],
      },
      {
        source: 'async function hidden(_actor: unknown) { return _actor; } export default hidden;',
        offenders: ["default"],
      },
      {
        source: 'export default async function (actor: Actor) { return actor; }',
        offenders: ["default"],
      },
      {
        source: 'export default async (principal: ScheduledAgentActor) => principal;',
        offenders: ["default"],
      },
      {
        source: [
          "function hidden(principal: Actor): Promise<Actor>;",
          "async function hidden(principal: Actor) { return principal; }",
          "export {hidden};",
        ].join("\n"),
        offenders: ["hidden"],
      },
    ];
    const safe = [
      'export async function f(path: string, formData: FormData) { return path; }',
      'async function g(actor: Actor) { return actor; }',
      'export type H = (actor: Actor) => void;',
      'export async function i(state: unknown, formData: FormData) { return state; }',
      'async function local(value: string) { return value; } export {local};',
      'const local = async (value: string) => value; export {local as default};',
      'type Hidden = (actor: Actor) => void; export {Hidden};',
      'declare function ambient(actor: Actor): Promise<Actor>; export {ambient};',
      'const actor = 1; export {actor};',
      'export {actor} from "./remote";',
      'export async function unrelated(input: {kind: "staff"; label: string}) { return input; }',
      'export async function primitive(input: string | null) { return input; }',
      [
        'import type {AuthenticatedActor} from "@/lib/membership/lifecycle";',
        "async function helper(principal: AuthenticatedActor) { return principal; }",
        "export async function publicAction(state: unknown, formData: FormData) { return state; }",
      ].join("\n"),
    ];

    const hostileFiles = hostile.map(({source}, index) => ({
      fileName: resolve(
        projectRoot,
        "tests/unit/__server-action-fixtures__",
        `hostile-${index}.ts`,
      ),
      source,
    }));
    const safeFiles = safe.map((source, index) => ({
      fileName: resolve(
        projectRoot,
        "tests/unit/__server-action-fixtures__",
        `safe-${index}.ts`,
      ),
      source,
    }));
    const fixtureSources = new Map([
      ...hostileFiles,
      ...safeFiles,
    ].map(({fileName, source}) => [fileName, actorFixtureSource(source)]));
    const fixtureActorAnalysis = createActorAnalysis(
      [...fixtureSources.keys()],
      fixtureSources,
    );

    for (const [{source, offenders}, {fileName}] of hostile.map(
      (hostileCase, index) => [hostileCase, hostileFiles[index]] as const,
    )) {
      const file = sourceFileInProgram(fixtureActorAnalysis.program, fileName);
      expect(
        actorTakingExports(
          file,
          fixtureActorAnalysis.checker,
          fixtureActorAnalysis.actorTypes,
        ),
        source,
      ).toEqual(offenders);
      expect(nonAsyncFunctionExports(source, fileName), source).toEqual([]);
    }
    for (const {source, fileName} of safeFiles) {
      const file = sourceFileInProgram(fixtureActorAnalysis.program, fileName);
      expect(
        actorTakingExports(
          file,
          fixtureActorAnalysis.checker,
          fixtureActorAnalysis.actorTypes,
        ),
        source,
      ).toEqual([]);
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
        "type Local = () => void;",
        "declare function ambient(value: string): Promise<string>;",
        "export {Local, ambient};",
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
