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
 * M1 is the sole exemption — its four membership plan rows are real product
 * configuration that production needs, and it writes no synthetic identity.
 */
const UNGUARDED_BY_DESIGN = new Set(["seed-m1.ts"]);

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

  it("db:seed pulls in no fixture seed", () => {
    const source = readFileSync(resolve("scripts/db-seed.ts"), "utf8");
    expect(source).toContain("seed-m1");
    expect(source).not.toMatch(/seed-m[2-9]/);
  });
});
