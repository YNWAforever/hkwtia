import {describe, expect, it} from "vitest";

import {createFakeRepositories, actorFor, systemActor} from "../helpers/fakes";

describe("actor-first repository scope", () => {
  it("allows a member to read their own profile and denies another profile", async () => {
    const repos = createFakeRepositories();

    await expect(repos.profiles.getById(actorFor("user-a"), "user-a")).resolves.toMatchObject({id: "user-a"});
    await expect(repos.profiles.getById(actorFor("user-a"), "user-b")).rejects.toThrow("FORBIDDEN");
  });

  it("denies a member from reading another company membership", async () => {
    const repos = createFakeRepositories();

    await expect(repos.memberships.getById(actorFor("user-a"), "membership-company-b")).rejects.toThrow("FORBIDDEN");
  });

  it("allows a member to update only their own profile", async () => {
    const repos = createFakeRepositories();

    await expect(repos.profiles.update(actorFor("user-a"), "user-a", {displayName: "Updated"})).resolves.toMatchObject({
      displayName: "Updated",
    });
    await expect(repos.profiles.update(actorFor("user-a"), "user-b", {displayName: "Nope"})).rejects.toThrow("FORBIDDEN");
  });

  it("claims the same webhook run key only once", async () => {
    const repos = createFakeRepositories();

    expect(await repos.jobs.claim(systemActor(), "evt_123", "checkout")).toBe("claimed");
    expect(await repos.jobs.claim(systemActor(), "evt_123", "checkout")).toBe("duplicate");
  });

  it("rejects a member from claiming webhook jobs", async () => {
    const repos = createFakeRepositories();

    await expect(repos.jobs.claim(actorFor("user-a"), "evt_456", "checkout")).rejects.toThrow("FORBIDDEN");
  });
});
