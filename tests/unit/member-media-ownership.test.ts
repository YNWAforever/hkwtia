import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {getMediaOwnedByProfile} from "@/lib/db/repos/media";

const member = {kind: "member", userId: "u", profileId: "profile-member"} as const;
const anonymous = {kind: "anonymous", userId: null} as const;
const mediaId = "11111111-1111-4111-8111-111111111111";

describe("getMediaOwnedByProfile", () => {
  beforeEach(() => {
    database.current = null;
  });

  it("pushes id, ownership, and the archived filter through one SQL query", async () => {
    const statements: Array<{query: string; params: unknown[]}> = [];
    database.current = drizzle(async (query, params) => {
      statements.push({query, params});
      return {rows: []};
    });

    await expect(getMediaOwnedByProfile(member, mediaId)).resolves.toBeNull();

    expect(statements).toHaveLength(1);
    // The ownership check must happen in SQL, not by fetching the row and
    // comparing `registeredByProfileId` in JS afterwards.
    expect(statements[0]?.query).toMatch(/where.*"id".*"registered_by_profile_id".*"archived_at"/is);
    expect(statements[0]?.params).toEqual(expect.arrayContaining([mediaId, member.profileId]));
  });

  it("requires a member actor before opening a connection", async () => {
    const statements: unknown[] = [];
    database.current = drizzle(async (query, params) => {
      statements.push({query, params});
      return {rows: []};
    });

    await expect(getMediaOwnedByProfile(anonymous, mediaId)).rejects.toThrow("FORBIDDEN");
    expect(statements).toHaveLength(0);
  });

  it("returns null for a malformed id without querying the database", async () => {
    const statements: unknown[] = [];
    database.current = drizzle(async (query, params) => {
      statements.push({query, params});
      return {rows: []};
    });

    await expect(getMediaOwnedByProfile(member, "not-a-uuid")).resolves.toBeNull();
    expect(statements).toHaveLength(0);
  });

  it("uses the injected dependency instead of opening a connection when provided", async () => {
    const getOwnedByProfile = vi.fn(async () => null);

    await expect(
      getMediaOwnedByProfile(member, mediaId, {getOwnedByProfile}),
    ).resolves.toBeNull();

    expect(getOwnedByProfile).toHaveBeenCalledWith(mediaId, member.profileId);
  });
});
