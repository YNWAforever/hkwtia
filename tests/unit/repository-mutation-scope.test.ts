import {describe, expect, it} from "vitest";

import {actorFor, createFakeRepositories, systemActor} from "../helpers/fakes";

describe("actor-first mutation boundaries", () => {
  it("allows a webhook system actor to remove only the requested company", async () => {
    const repos = createFakeRepositories();

    await repos.companies.remove(systemActor(), "company-a");

    await expect(repos.companies.getById(systemActor(), "company-a")).resolves.toBeNull();
    await expect(repos.companies.getById(systemActor(), "company-b")).resolves.toMatchObject({id: "company-b"});
  });

  it("denies a member from moving a membership to another company", async () => {
    const repos = createFakeRepositories();

    await expect(
      repos.memberships.update(actorFor("user-a"), "membership-company-a", {companyId: "company-b"} as never),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("denies a member from moving an application to another company", async () => {
    const repos = createFakeRepositories();

    await expect(
      repos.applications.update(actorFor("user-a"), "application-a", {companyId: "company-b"} as never),
    ).rejects.toThrow("FORBIDDEN");
  });
});
