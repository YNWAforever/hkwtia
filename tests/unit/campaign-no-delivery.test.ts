import {readFile} from "node:fs/promises";

import {describe, expect, it} from "vitest";

const campaignFiles = ["lib/admin/campaigns.ts", "lib/db/repos/campaigns.ts"];

describe("M2 campaign queue boundaries", () => {
  it("does not contain an external delivery dependency", async () => {
    const source = await Promise.all(campaignFiles.map((file) => readFile(file, "utf8")));

    expect(source.join("\n")).not.toMatch(/resend|RESEND_API_KEY|fetch\(|email-provider/i);
  });
});
