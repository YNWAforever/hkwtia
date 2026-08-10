import {describe, expect, it} from "vitest";

import {requireAdmin} from "@/lib/auth/authorize";
import {actorFor, anonymousActor} from "@/tests/helpers/fakes";

describe("staff repository authorization", () => {
  it.each(["anonymous", "member"] as const)("denies %s to staff repositories", (kind) => {
    const actor = kind === "anonymous" ? anonymousActor() : actorFor("member-1");

    expect(() => requireAdmin(actor)).toThrow("FORBIDDEN");
  });
});
