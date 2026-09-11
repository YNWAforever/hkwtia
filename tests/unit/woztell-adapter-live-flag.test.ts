import {readdirSync, readFileSync} from "node:fs";
import {join, relative, sep} from "node:path";

import {describe, expect, it} from "vitest";

/**
 * Phase C2 Task 10, S-13. Every construction of the WOZTELL adapter passes
 * `RUN_LIVE_WOZTELL`, discovered rather than remembered.
 *
 * `lib/jobs/runners.ts` carries the incident in a comment: an outbound path that
 * omitted the flag found no live credentials, so `send` returned
 * `{status: "sent", providerId: "mock:…"}` for everything and journey and
 * dunning WhatsApp messages were recorded as delivered while nothing left the
 * building. A member in dunning never received the reminder the log says they
 * got. The failure mode is a clean success, which is why no runtime alert fires
 * and why the check has to be a discovery over the source.
 *
 * ONE construction is deliberately credential-free and therefore deliberately
 * flagless — `lib/api/woztell-backfill-route.ts` builds `createWoztellAdapter({})`
 * so that even a future edit reaching for a send method from the import route
 * could not reach a member's phone. It is named here so that its exemption is a
 * decision on the record rather than an omission nobody noticed.
 */
const CALL = "createWoztellAdapter(";
const CREDENTIAL_FREE_CONSTRUCTIONS = ["lib/api/woztell-backfill-route.ts"] as const;
const MINIMUM_CALL_SITES = 5;

/**
 * The property form, and it is checked against comment-stripped source — two
 * separate defences against the same failure, because this guard went dead once
 * already and nothing went red.
 *
 * C2 Task 13 Step 3 added three lines of comment INSIDE `runners.ts`'s adapter
 * argument explaining the `aiEnv()` move, and one of them names the variable.
 * The predicate was `!argument.includes("RUN_LIVE_WOZTELL")` over the raw
 * balanced argument text, so from that commit the prose alone satisfied it:
 * deleting `RUN_LIVE_WOZTELL: ai.runLiveWoztell` from the very call site whose
 * omission caused the incident this file exists to prevent left the suite green.
 * A comment is not an argument, and `RUN_LIVE_WOZTELL` inside a sentence is not
 * a key, so the check now says both.
 */
const FLAG_KEY = "RUN_LIVE_WOZTELL:";

type CallSite = Readonly<{file: string; argument: string; code: string}>;

/**
 * The balanced argument text of one call. A regex cannot do this: every live
 * construction spreads a credential object over several lines and one of them
 * contains a nested `{}`.
 */
function argumentAt(source: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  throw new Error("UNBALANCED_ADAPTER_CALL");
}

/**
 * `lib/ai/woztell-credentials.ts` names this factory inside a docblock that
 * points forward at this very test, so a scan that trusted the bare substring
 * would try to balance parentheses from the middle of a sentence.
 */
function isCommentLine(source: string, index: number): boolean {
  const line = source.slice(source.lastIndexOf("\n", index) + 1, index).trimStart();
  return line.startsWith("//") || line.startsWith("*") || line.startsWith("/*");
}

/**
 * The argument with its comments removed, so that what the test reads is what
 * the compiler reads. String literals are copied through whole: a credential
 * value of `"https://…"` must not be mistaken for the start of a line comment.
 *
 * Stripping can only ever REMOVE text, so the worst a bug in here can do is
 * report a guarded call site as an offender — the guard fails closed.
 */
export function stripComments(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const pair = source.slice(index, index + 2);
    if (pair === "//") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (pair === "/*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      output += character;
      index += 1;
      while (index < source.length && source[index] !== character) {
        if (source[index] === "\\") {
          output += source.slice(index, index + 2);
          index += 2;
          continue;
        }
        output += source[index];
        index += 1;
      }
      if (index < source.length) output += source[index];
      index += 1;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

export function adapterCallSites(source: string, file: string): CallSite[] {
  const sites: CallSite[] = [];
  let cursor = source.indexOf(CALL);
  while (cursor >= 0) {
    const preceding = source.slice(Math.max(0, cursor - 20), cursor);
    // The declaration itself, and any prose mention, are not calls.
    if (!/function\s+$/.test(preceding) && !isCommentLine(source, cursor)) {
      const argument = argumentAt(source, cursor + CALL.length - 1);
      sites.push({file, argument, code: stripComments(argument)});
    }
    cursor = source.indexOf(CALL, cursor + CALL.length);
  }
  return sites;
}

function sourceFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(path, collected);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) collected.push(path);
  }
  return collected;
}

function repositoryCallSites(): CallSite[] {
  const root = process.cwd();
  const sites: CallSite[] = [];
  for (const file of [...sourceFiles(join(root, "lib")), ...sourceFiles(join(root, "app"))]) {
    const source = readFileSync(file, "utf8");
    if (!source.includes(CALL)) continue;
    sites.push(...adapterCallSites(source, relative(root, file).split(sep).join("/")));
  }
  return sites;
}

describe("WOZTELL adapter construction (S-13)", () => {
  const sites = repositoryCallSites();

  it("finds every construction under lib/ and app/", () => {
    // A floor, not an equality: new send paths are expected, silently losing
    // them to a renamed factory is not.
    expect(sites.length).toBeGreaterThanOrEqual(MINIMUM_CALL_SITES);
    expect(sites.some(({file}) => file === "lib/notifications/dispatch.ts")).toBe(true);
    expect(sites.some(({file}) => file === "lib/jobs/runners.ts")).toBe(true);
  });

  it("passes RUN_LIVE_WOZTELL at every construction that carries credentials", () => {
    // `code`, not `argument`: three of these call sites explain the incident in
    // a comment that names the variable, and a comment sends nothing.
    const offenders = sites.filter(({code}) => !code.includes(FLAG_KEY)).map(({file}) => file);

    expect([...new Set(offenders)].sort()).toEqual([...CREDENTIAL_FREE_CONSTRUCTIONS]);
  });

  it("keeps the exempt construction genuinely credential-free", () => {
    for (const file of CREDENTIAL_FREE_CONSTRUCTIONS) {
      const exempt = sites.filter((site) => site.file === file);
      expect(exempt.length).toBe(1);
      // `{}` and nothing else once comments are out — a comment here would be
      // welcome, a credential would not: it would reach the provider from a
      // route whose whole risk is mass sending.
      expect(exempt[0].code.trim()).toBe("{}");
    }
  });

  // A guard nobody has seen fail is a guard nobody trusts. This is the shape
  // tests/unit/server-action-actor-boundary.test.ts established.
  it("detects the shapes it is meant to catch", () => {
    const hostile = [
      "const channel = createWoztellAdapter({",
      "  ...woztellCredentialsFrom(env),",
      "});",
    ].join("\n");

    const found = adapterCallSites(hostile, "hostile.ts");
    expect(found).toHaveLength(1);
    expect(found[0].code).not.toContain(FLAG_KEY);
    expect(found[0].code.trim()).not.toBe("{}");
  });

  /**
   * The regression that made this whole file decorative between C2 Task 13
   * Step 3 and this fix. Both shapes below are offenders and neither passes the
   * flag; before the fix the first one satisfied the predicate on its own.
   */
  it("does not accept a comment that merely names the flag", () => {
    const shapes = [
      ["  ...woztellCredentialsFrom(env),", "  // C-9 (O-8): RUN_LIVE_WOZTELL is parsed by aiEnv()."],
      ["  ...woztellCredentialsFrom(env),", "  /* RUN_LIVE_WOZTELL: set at the other call sites. */"],
    ];

    for (const body of shapes) {
      const hostile = ["const channel = createWoztellAdapter({", ...body, "});"].join("\n");
      const found = adapterCallSites(hostile, "hostile.ts");
      expect(found).toHaveLength(1);
      expect(found[0].argument).toContain("RUN_LIVE_WOZTELL");
      expect(found[0].code).not.toContain(FLAG_KEY);
    }
  });

  /**
   * Comments come out; credentials stay in. A stripper that ate the object body
   * would report `{}` everywhere and turn the exemption check into a rubber
   * stamp, so the round trip is asserted in both directions.
   */
  it("strips comments without touching code or string literals", () => {
    const source = [
      '  WOZTELL_API_TOKEN: "tok//en", // a trailing comment',
      "  /* a block comment */ RUN_LIVE_WOZTELL: env.runLiveWoztell,",
    ].join("\n");

    const code = stripComments(source);
    expect(code).toContain('WOZTELL_API_TOKEN: "tok//en",');
    expect(code).toContain(FLAG_KEY);
    expect(code).not.toContain("trailing comment");
    expect(code).not.toContain("block comment");
  });

  it("does not mistake the factory's own declaration for a call", () => {
    const declaration = readFileSync(join(process.cwd(), "lib/channels/woztell.ts"), "utf8");
    expect(declaration).toContain(`export function ${CALL}`);
    expect(adapterCallSites(declaration, "lib/channels/woztell.ts")).toHaveLength(0);
  });
});
