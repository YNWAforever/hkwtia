import {readFileSync, readdirSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

/**
 * A discovery test, in the style of the "use server" boundary test: it finds
 * the files itself, so a seed added later is covered without anyone
 * remembering to list it here.
 *
 * The pattern is `/^seed-/` rather than the narrower `/^seed-m\d/` so that
 * `seed-demo.ts` — the guarded db:seed:demo entry point, which doesn't follow
 * the numbered-milestone naming — is part of the same invariant instead of
 * escaping it by name alone. `db-seed.ts` and `db-migrate.ts` don't start
 * with `seed-`, so they're unaffected.
 *
 * Two seeds are exempt, on the same grounds: everything they write is real
 * product configuration that production needs, and neither writes a synthetic
 * identity. `seed-m1.ts` writes the four membership plan rows.
 * `seed-m4a-knowledge.ts` writes the funding-scheme sources into the Concierge
 * knowledge base — the half of `runM4ASeed` that had to stay reachable in
 * production once the other half, which reconciles a fake member and two fake
 * events, went behind the guard.
 *
 * An exemption is a hole by construction, so it is not granted on a comment
 * alone: the case below proves each exempted file cannot reach fixture content.
 * Adding a third entry here should be as uncomfortable as it looks.
 */
const UNGUARDED_BY_DESIGN = new Set(["seed-m1.ts", "seed-m4a-knowledge.ts"]);

/**
 * What an exempted seed must never touch. These are the symbols that write, or
 * name, synthetic data — a reference to any of them means the file is no longer
 * only-real-configuration and has to be guarded like everything else.
 */
const FIXTURE_SYMBOLS = [
  "M4A_ACCEPTANCE_SOURCES",
  "M4A_DEFAULT_SOURCES",
  "M4A_ACCEPTANCE_FIXTURE",
  "reconcileM4AAcceptanceFixture",
  "createM4AAcceptanceFixtureRepository",
  "example.test",
] as const;

describe("every fixture seed is isolation-guarded", () => {
  const seeds = readdirSync(resolve("scripts"))
    .filter((name) => /^seed-/.test(name) && name.endsWith(".ts"));

  it("finds the seed scripts", () => {
    expect(seeds.length).toBeGreaterThanOrEqual(6);
  });

  it.each(seeds.filter((name) => !UNGUARDED_BY_DESIGN.has(name)))(
    "%s routes through the shared guard",
    (name) => {
      const source = readFileSync(resolve("scripts", name), "utf8");
      expect(source).toContain("assertIsolatedSeedEnvironment");
    },
  );

  // The exemption is only defensible while the file writes real configuration
  // and nothing else. Guarding is a runtime check; this is the static one, and
  // it is what actually keeps an unguarded seed honest as the code moves.
  it.each([...UNGUARDED_BY_DESIGN])(
    "%s, which runs unguarded, cannot reach fixture content",
    (name) => {
      const source = readFileSync(resolve("scripts", name), "utf8");
      for (const symbol of FIXTURE_SYMBOLS) {
        expect(source, `${name} references ${symbol}`).not.toContain(symbol);
      }
    },
  );

  it("db:seed pulls in no fixture seed", () => {
    const source = readFileSync(resolve("scripts/db-seed.ts"), "utf8");
    expect(source).toContain("seed-m1");
    expect(source).not.toMatch(/seed-m[2-9]/);
  });
});
