import {describe, expect, it} from "vitest";

import packageLock from "../package-lock.json";
import packageJson from "../package.json";

type PackageMetadata = Readonly<{
  engines?: Readonly<{node?: string}>;
}>;

type Lockfile = Readonly<{
  packages: Readonly<Record<string, PackageMetadata | undefined>>;
}>;

describe("Worker package runtime contract", () => {
  it("keeps the package and lockfile Node engine aligned with Wrangler", () => {
    const manifest = packageJson as PackageMetadata;
    const lock = packageLock as Lockfile;

    expect(manifest.engines?.node).toBe(">=22.0.0");
    expect(lock.packages[""]?.engines?.node).toBe(">=22.0.0");
    expect(lock.packages["node_modules/wrangler"]?.engines?.node).toBe(
      ">=22.0.0",
    );
  });
});
