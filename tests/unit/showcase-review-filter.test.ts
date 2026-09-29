import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it} from "vitest";

import {databaseStore} from "@/lib/db/repos/showcase";
import {encodeScopedCursor} from "@/lib/admin/pagination";
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
    await store.listForReview("pending_review", encodeScopedCursor("showcase-review:pending_review", ["2026-09-29T00:00:00.000Z", "synthetic-slug", "11111111-1111-4111-8111-111111111111"]));

    expect(statements[0]).toMatch(/"showcase_listings"\."status"\s*=\s*\$1/);
    expect(statements[1]).not.toMatch(/"showcase_listings"\."status"\s*=/);
    expect(statements[0]).toMatch(/limit \$\d+/i);
    expect(statements[2]).toMatch(/"showcase_listings"\."updated_at".*</i);
  });
});