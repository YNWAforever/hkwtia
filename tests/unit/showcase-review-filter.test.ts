import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it} from "vitest";

import {databaseStore} from "@/lib/db/repos/showcase";
import type {Database} from "@/lib/db/repos/common";

describe("showcase review queue", () => {
  it("filters the pending queue in SQL while retaining the all-status management read", async () => {
    const statements: string[] = [];
    const database = drizzle(async (statement) => {
      statements.push(statement);
      return {rows: []};
    });
    const store = databaseStore(async () => database as unknown as Database);

    await store.listForReview("pending_review");
    await store.listForReview();

    expect(statements[0]).toMatch(/"showcase_listings"\."status"\s*=\s*\$1/);
    expect(statements[1]).not.toMatch(/"showcase_listings"\."status"\s*=/);
  });
});