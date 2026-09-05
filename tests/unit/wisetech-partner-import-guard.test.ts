import {describe, expect, it} from "vitest";

import {assertPartnerImportAuthorized} from "@/scripts/lib/partner-import-guard";

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    WISETECH_PARTNER_IMPORT: "true",
    WISETECH_IMPORT_ACTOR_PROFILE_ID: "profile-abc-123",
    ...overrides,
  };
}

const disposable = async () => 1;
const notDisposable = async () => 0;

describe("assertPartnerImportAuthorized", () => {
  it("refuses when WISETECH_PARTNER_IMPORT is not exactly \"true\"", async () => {
    await expect(assertPartnerImportAuthorized(env({WISETECH_PARTNER_IMPORT: "false"}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_NOT_AUTHORIZED");
    await expect(assertPartnerImportAuthorized(env({WISETECH_PARTNER_IMPORT: undefined}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_NOT_AUTHORIZED");
  });

  it("refuses when the actor profile id is missing or blank", async () => {
    await expect(assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_PROFILE_ID: undefined}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_ACTOR_REQUIRED");
    await expect(assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_PROFILE_ID: "   "}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_ACTOR_REQUIRED");
  });

  it("refuses an actor kind outside staff/exco/superadmin, and defaults to staff when unset", async () => {
    await expect(assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_KIND: "member"}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_ACTOR_KIND_INVALID");
    const result = await assertPartnerImportAuthorized(env(), disposable);
    expect(result.actorKind).toBe("staff");
  });

  it("accepts a confirmed-disposable database with no production override needed", async () => {
    const result = await assertPartnerImportAuthorized(env(), disposable);
    expect(result).toEqual({actorProfileId: "profile-abc-123", actorKind: "staff"});
  });

  it("accepts a non-disposable database only when WISETECH_IMPORT_ALLOW_PRODUCTION is exactly \"true\"", async () => {
    await expect(assertPartnerImportAuthorized(env(), notDisposable))
      .rejects.toThrow("PARTNER_IMPORT_PRODUCTION_NOT_CONFIRMED");
    const result = await assertPartnerImportAuthorized(
      env({WISETECH_IMPORT_ALLOW_PRODUCTION: "true"}),
      notDisposable,
    );
    expect(result.actorKind).toBe("staff");
  });

  it("treats an unreadable sentinel table as a distinct, always-fatal failure", async () => {
    const queryError = new Error("relation does not exist");

    expect.assertions(2);
    try {
      await assertPartnerImportAuthorized(
        env({WISETECH_IMPORT_ALLOW_PRODUCTION: "true"}),
        async () => {
          throw queryError;
        },
      );
    } catch (error) {
      expect(error).toHaveProperty("message", "PARTNER_IMPORT_SENTINEL_CHECK_FAILED");
      expect(error).toHaveProperty("cause", queryError);
    }
  });

  it("accepts an explicit staff actor kind", async () => {
    const result = await assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_KIND: "staff"}), disposable);
    expect(result.actorKind).toBe("staff");
  });

  it("accepts an explicit exco actor kind", async () => {
    const result = await assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_KIND: "exco"}), disposable);
    expect(result.actorKind).toBe("exco");
  });

  it("accepts an explicit superadmin actor kind", async () => {
    const result = await assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_KIND: "superadmin"}), disposable);
    expect(result.actorKind).toBe("superadmin");
  });

  it("rejects a whitespace-only actor kind as invalid", async () => {
    await expect(assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_KIND: "   "}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_ACTOR_KIND_INVALID");
  });
});
