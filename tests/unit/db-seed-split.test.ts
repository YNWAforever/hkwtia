import {describe, expect, it, vi} from "vitest";

vi.mock("@/scripts/seed-m1", () => ({runM1Seed: vi.fn(async () => undefined)}));
vi.mock("@/scripts/seed-m2", () => ({runM2Seed: vi.fn(async () => undefined)}));

import {runM1Seed} from "@/scripts/seed-m1";
import {runM2Seed} from "@/scripts/seed-m2";
import {seedDatabase} from "@/scripts/db-seed";

describe("db:seed no longer carries fixtures", () => {
  // The whole defect: `npm run db:seed` is the documented setup command, and it
  // used to write 30 synthetic profiles into whatever DATABASE_URL pointed at.
  it("seeds the real plan rows and nothing else", async () => {
    await seedDatabase({DATABASE_URL: "postgres://db.test/wtia", NODE_ENV: "test"} as NodeJS.ProcessEnv);

    expect(runM1Seed).toHaveBeenCalledOnce();
    expect(runM2Seed).not.toHaveBeenCalled();
  });

  it("reports why a seed failed instead of swallowing the cause", async () => {
    vi.mocked(runM1Seed).mockRejectedValueOnce(new Error("PLAN_UPSERT_CONFLICT"));

    await expect(seedDatabase({DATABASE_URL: "postgres://db.test/wtia", NODE_ENV: "test"} as NodeJS.ProcessEnv))
      .rejects.toThrow("PLAN_UPSERT_CONFLICT");
  });
});
