import {describe, expect, it} from "vitest";

import packageLock from "../package-lock.json";
import packageJson from "../package.json";
// @ts-expect-error -- Vitest supports raw text imports for non-code assets.
import wranglerToml from "../wrangler.toml?raw";

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

  it("keeps exactly one hourly cron trigger", () => {
    expect(wranglerToml.match(/"0 \* \* \* \*"/g)).toHaveLength(1);
  });
});
