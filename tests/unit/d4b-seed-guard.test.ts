import {describe, expect, it, vi} from "vitest";

import {verifyPassToken} from "@/lib/tickets/pass-token";

const isolated = "postgres://user:pass@ep-isolated.example.neon.tech/db";
const allowlist = "ep-isolated.example.neon.tech";

function loadSeed() {
  return import("@/scripts/seed-d4b");
}

describe("requireD4bSeedEnvironment", () => {
  it("refuses without the acceptance flag", async () => {
    const {requireD4bSeedEnvironment} = await loadSeed();

    expect(() => requireD4bSeedEnvironment({DATABASE_URL: isolated, DATABASE_URL_TEST: isolated}))
      .toThrow("D4B_ACCEPTANCE_SEED_NOT_AUTHORIZED");
  });

  it("refuses a DATABASE_URL that is not the isolated test database", async () => {
    const {requireD4bSeedEnvironment} = await loadSeed();

    expect(() => requireD4bSeedEnvironment({
      D4B_ACCEPTANCE_SEED: "true", DATABASE_URL: isolated, DATABASE_URL_TEST: `${isolated}-other`,
    })).toThrow("D4B_ACCEPTANCE_DATABASE_URL_MISMATCH");
  });

  it("refuses production", async () => {
    const {requireD4bSeedEnvironment} = await loadSeed();

    expect(() => requireD4bSeedEnvironment({
      D4B_ACCEPTANCE_SEED: "true", DATABASE_URL: isolated, DATABASE_URL_TEST: isolated, NODE_ENV: "production",
    })).toThrow("D4B_ACCEPTANCE_PRODUCTION_FORBIDDEN");
  });

  it("refuses a missing host allowlist", async () => {
    const {requireD4bSeedEnvironment} = await loadSeed();

    expect(() => requireD4bSeedEnvironment({
      D4B_ACCEPTANCE_SEED: "true", DATABASE_URL: isolated, DATABASE_URL_TEST: isolated,
    })).toThrow("D4B_ACCEPTANCE_DATABASE_HOST_ALLOWLIST_REQUIRED");
  });

  it("refuses a host that is not on the allowlist", async () => {
    const {requireD4bSeedEnvironment} = await loadSeed();

    expect(() => requireD4bSeedEnvironment({
      D4B_ACCEPTANCE_SEED: "true", DATABASE_URL: isolated, DATABASE_URL_TEST: isolated,
      D4B_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: "preview.example.neon.tech",
    })).toThrow("D4B_ACCEPTANCE_DATABASE_HOST_NOT_ALLOWED");
  });

  it("returns the isolated database url once every acceptance fact is present", async () => {
    const {requireD4bSeedEnvironment} = await loadSeed();

    expect(requireD4bSeedEnvironment({
      D4B_ACCEPTANCE_SEED: "true", DATABASE_URL: isolated, DATABASE_URL_TEST: isolated,
      D4B_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: ` ${allowlist} , other.example `,
    })).toBe(isolated);
  });
});

describe("runD4bSeed", () => {
  it("runs the guard before opening any connection", async () => {
    const {runD4bSeed} = await loadSeed();
    const createPool = vi.fn((_databaseUrl: string): never => {
      throw new Error("POOL_OPENED");
    });

    await expect(runD4bSeed({
      DATABASE_URL: isolated, DATABASE_URL_TEST: isolated,
      D4B_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: allowlist,
    }, createPool)).rejects.toThrow("D4B_ACCEPTANCE_SEED_NOT_AUTHORIZED");

    expect(createPool).not.toHaveBeenCalled();
  });
});

describe("d4bAcceptanceUrls", () => {
  it("prints one pass and one check-in url per seat, in both locales", async () => {
    const {d4bAcceptanceUrls} = await loadSeed();

    const lines = d4bAcceptanceUrls("https://acceptance.test/", "fixture-pass-secret");

    expect(lines).toHaveLength(12);
    expect(lines.filter((line) => line.startsWith("D4B_PASS_URL_ONE="))).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith("D4B_CHECK_IN_URL_TWO_ZH=") && line.includes("/zh/admin/check-in/"))).toHaveLength(1);
  });

  it("signs the printed pass url with the secret the app verifies against", async () => {
    const {d4bAcceptanceUrls} = await loadSeed();

    const line = d4bAcceptanceUrls("https://acceptance.test/", "fixture-pass-secret")
      .find((candidate) => candidate.startsWith("D4B_PASS_URL_ONE="))!;
    const url = line.slice("D4B_PASS_URL_ONE=".length);
    const token = url.split("/pass/")[1]!;

    expect(url.startsWith("https://acceptance.test/pass/")).toBe(true);
    expect(verifyPassToken(token, "fixture-pass-secret")?.seatId).toBe("d4b00000-0000-4000-8000-000000000001");
  });

  it("prints the D4D cancellation fixture's public and pass urls, on its own event", async () => {
    const seed = await loadSeed();
    const lines = seed.d4bAcceptanceUrls("https://acceptance.test/", "fixture-pass-secret");

    // The cancellation walk needs its own event and its own seat's token: reusing
    // D-4b's event would cancel the one D-4c's refund walk depends on.
    expect(lines).toContain(`D4D_PUBLIC_URL=https://acceptance.test/events/${seed.D4D_EVENT_SLUG}`);
    expect(lines).toContain(`D4D_PUBLIC_URL_ZH=https://acceptance.test/zh/events/${seed.D4D_EVENT_SLUG}`);
    expect(lines.some((line) => line.startsWith("D4D_PASS_URL=https://acceptance.test/pass/"))).toBe(true);
    expect(lines.some((line) => line.startsWith("D4D_PASS_URL_ZH=https://acceptance.test/zh/pass/"))).toBe(true);
    expect(seed.D4D_EVENT_ID).not.toBe(seed.D4B_EVENT_ID);
  });

  it("signs the D4D pass url for the D4D seat and event, so the walk cannot cancel the D4B event", async () => {
    const seed = await loadSeed();

    const line = seed.d4bAcceptanceUrls("https://acceptance.test/", "fixture-pass-secret")
      .find((candidate) => candidate.startsWith("D4D_PASS_URL="))!;
    const token = line.slice("D4D_PASS_URL=".length).split("/pass/")[1]!;
    const claims = verifyPassToken(token, "fixture-pass-secret");

    expect(claims?.seatId).toBe(seed.D4D_SEAT_IDS[0]);
    expect(claims?.eventId).toBe(seed.D4D_EVENT_ID);
  });
});
