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

type CallSite = Readonly<{file: string; argument: string}>;

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

export function adapterCallSites(source: string, file: string): CallSite[] {
  const sites: CallSite[] = [];
  let cursor = source.indexOf(CALL);
  while (cursor >= 0) {
    const preceding = source.slice(Math.max(0, cursor - 20), cursor);
    // The declaration itself, and any prose mention, are not calls.
    if (!/function\s+$/.test(preceding) && !isCommentLine(source, cursor)) {
      sites.push({file, argument: argumentAt(source, cursor + CALL.length - 1)});
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
    const offenders = sites
      .filter(({argument}) => !argument.includes("RUN_LIVE_WOZTELL"))
      .map(({file}) => file);

    expect([...new Set(offenders)].sort()).toEqual([...CREDENTIAL_FREE_CONSTRUCTIONS]);
  });

  it("keeps the exempt construction genuinely credential-free", () => {
    for (const file of CREDENTIAL_FREE_CONSTRUCTIONS) {
      const exempt = sites.filter((site) => site.file === file);
      expect(exempt.length).toBe(1);
      // `{}` and nothing else. A credential added here would reach the provider
      // from a route whose whole risk is mass sending.
      expect(exempt[0].argument.trim()).toBe("{}");
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
    expect(found[0].argument).not.toContain("RUN_LIVE_WOZTELL");
    expect(found[0].argument.trim()).not.toBe("{}");
  });

  it("does not mistake the factory's own declaration for a call", () => {
    const declaration = readFileSync(join(process.cwd(), "lib/channels/woztell.ts"), "utf8");
    expect(declaration).toContain(`export function ${CALL}`);
    expect(adapterCallSites(declaration, "lib/channels/woztell.ts")).toHaveLength(0);
  });
});
