import {describe, expect, it} from "vitest";

import {portalContentRepository} from "@/lib/db/repos/portal-content";
import type {Actor} from "@/lib/membership/lifecycle";

const actors: Actor[] = [
  {kind: "anonymous", userId: null},
  {kind: "staff", userId: "staff-auth", profileId: "staff-profile"},
];

describe("portal content repository runtime authorization", () => {
  it.each(actors)("rejects $kind actors from company role reads", async (actor) => {
    await expect(portalContentRepository.getCompanyRole(actor, "company-1")).rejects.toThrow("FORBIDDEN");
  });

  it.each(actors)("rejects $kind actors from directory reads", async (actor) => {
    await expect(portalContentRepository.listDirectory(actor)).rejects.toThrow("FORBIDDEN");
  });
});
