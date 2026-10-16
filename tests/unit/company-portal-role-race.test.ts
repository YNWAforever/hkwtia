import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

const databaseState = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => databaseState.current};
});

import {companiesRepository} from "@/lib/db/repos/companies";

const companyId = "11111111-1111-4111-8111-111111111111";
const actor = {kind: "member", userId: "member-1", profileId: "member-1"} as const;

function fakeDatabase(managerAtLock: boolean) {
  const writes = vi.fn(() => ({
    set: () => ({
      where: () => ({
        returning: async () => [{id: companyId, displayName: "Changed"}],
      }),
    }),
  }));
  const execute = vi.fn(async (query: unknown) => {
    const statement = new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).sql;
    if (statement.includes('"company_members"')) return {rows: managerAtLock ? [{role: "admin"}] : []};
    return {rows: []}; // A company in the join flow may not have a membership row yet.
  });
  const transaction = vi.fn(async <T,>(work: (tx: {execute: typeof execute; update: typeof writes}) => Promise<T>) =>
    work({execute, update: writes}));
  databaseState.current = {execute, update: writes, transaction};
  return {execute, writes, transaction};
}

describe("portal company role revocation", () => {
  it("refuses public-copy writes after a manager is revoked while the role preflight is stale", async () => {
    const {execute, writes, transaction} = fakeDatabase(false);
    await expect(companiesRepository.update(actor, companyId, {displayName: "Unreviewed"}))
      .rejects.toThrow("FORBIDDEN");
    expect(transaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(writes).not.toHaveBeenCalled();
    const roleQuery = new PgDialect().sqlToQuery(execute.mock.calls[1]?.[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(roleQuery.sql).toContain('"company_members"."company_id" =');
    expect(roleQuery.sql).toContain('"company_members"."user_id" =');
    expect(roleQuery.sql).toContain('"company_members"."revoked_at" IS NULL');
    expect(roleQuery.params).toEqual([companyId, actor.profileId]);
  });

  it("lets an active manager update during join before a membership row exists", async () => {
    const {execute, writes} = fakeDatabase(true);
    await expect(companiesRepository.update(actor, companyId, {displayName: "Changed"}))
      .resolves.toMatchObject({id: companyId});
    expect(execute).toHaveBeenCalledTimes(2);
    expect(writes).toHaveBeenCalledOnce();
  });
});