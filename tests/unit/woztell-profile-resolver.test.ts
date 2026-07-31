import {describe, expect, it, vi} from "vitest";

import {
  createWoztellProfileResolverRepository,
} from "@/lib/db/repos/woztell-profile-resolver";

describe("WOZTELL profile resolver", () => {
  it("returns the unique normalized phone match even when already opted out", async () => {
    const execute = vi.fn(async () => ({rows: [{
      id: "profile-opted-out",
      display_name: "Ada",
      locale: "en",
      whatsapp_opt_in: false,
    }]}));
    const repository = createWoztellProfileResolverRepository(
      async () => ({execute}),
    );

    await expect(repository.resolveProfile("+85290000000")).resolves.toEqual({
      id: "profile-opted-out",
      displayName: "Ada",
      locale: "en",
      whatsappOptIn: false,
    });
    expect(execute).toHaveBeenCalledOnce();
  });
});
