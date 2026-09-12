import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {profilesRepository} from "@/lib/db/repos/profiles";
import {WHATSAPP_CONSENT_TEXT_VERSION} from "@/lib/whatsapp/consent";

const actor = {kind: "member", userId: "auth-1", profileId: "member-1"} as const;

/** `profiles` in column order — what a positional proxy driver hands back. */
function profileRow(whatsappOptIn: boolean): unknown[] {
  return [
    "member-1", "auth-1", "ada@example.hk", "member", null, false, [], "Ada", null, null,
    "en", "complete", false, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-09-11T00:00:00.000Z"),
    whatsappOptIn, "+85291234567", null, null, null, null,
  ];
}

type Recorded = Readonly<{sql: string; params: readonly unknown[]; depth: number}>;

/**
 * A proxy driver that records every statement WITH the transaction depth it ran
 * at, because "in the same transaction as the change" is the property boundary
 * 11 actually asks for and a bare call count cannot see it.
 *
 * `drizzle/pg-proxy` has no transaction support of its own, so the shim below
 * supplies one. That is honest here: what is under test is which statements the
 * repository issues and where, not whether Postgres can open a transaction.
 */
function proxyDatabase(priorOptIn: boolean | null) {
  const statements: Recorded[] = [];
  let depth = 0;
  const handler = async (sql: string, params: unknown[]) => {
    statements.push({sql, params, depth});
    const text = sql.toLowerCase();
    if (text.startsWith("select")) return {rows: priorOptIn === null ? [] : [[priorOptIn]]};
    if (text.startsWith(`update "profiles"`)) {
      const setNew = /"whatsapp_opt_in" = \$(\d+)/.exec(text);
      const next = setNew ? Boolean(params[Number(setNew[1]) - 1]) : Boolean(priorOptIn);
      return {rows: [profileRow(next)]};
    }
    return {rows: []};
  };
  const proxy = drizzle(handler);
  (proxy as unknown as {transaction: unknown}).transaction = async (
    work: (transaction: unknown) => Promise<unknown>,
  ) => {
    depth += 1;
    try {
      return await work(proxy);
    } finally {
      depth -= 1;
    }
  };
  database.current = proxy;
  return {statements};
}

function audits(statements: readonly Recorded[]): readonly Recorded[] {
  return statements.filter((statement) => statement.sql.toLowerCase().startsWith(`insert into "audit_events"`));
}

function actionOf(statement: Recorded | undefined): unknown {
  return (statement?.params ?? []).find(
    (value) => typeof value === "string" && value.startsWith("consent.whatsapp."),
  );
}

/**
 * Boundary 11 on the surface members actually use. `lib/portal/command-core.ts`
 * and `/join` both write a WhatsApp consent GRANT or WITHDRAWAL through
 * `profilesRepository.update`, and it was a bare `UPDATE profiles` — no audit
 * row, no suppression bookkeeping, nothing. The withdrawal side of it is also
 * what left `suppressionsRepository.optOutWhatsApp` with no trustworthy
 * re-consent record to reason about.
 *
 * The gate lives in the repository rather than in the two callers, per boundary
 * 1/2: a third surface that writes the flag inherits the audit row instead of
 * having to remember it.
 */
describe("profilesRepository.update audits a WhatsApp consent change", () => {
  beforeEach(() => { database.current = null; });

  it("writes consent.whatsapp.granted in the same transaction as the grant", async () => {
    const recorder = proxyDatabase(false);

    await profilesRepository.update(actor, "member-1", {
      displayName: "Ada",
      whatsappNumber: "+85291234567",
      whatsappOptIn: true,
      whatsappConsentSource: "portal",
      whatsappConsentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
    });

    const written = audits(recorder.statements);
    expect(written).toHaveLength(1);
    expect(actionOf(written[0])).toBe("consent.whatsapp.granted");
    expect(written[0]?.depth).toBe(1);
    // Same transaction as the change, not merely "also written".
    const update = recorder.statements.find((statement) => statement.sql.toLowerCase().startsWith(`update "profiles"`));
    expect(update?.depth).toBe(1);
  });

  it("writes consent.whatsapp.revoked when the member withdraws", async () => {
    const recorder = proxyDatabase(true);

    await profilesRepository.update(actor, "member-1", {
      displayName: "Ada",
      whatsappOptIn: false,
      whatsappConsentAt: null,
      whatsappConsentSource: null,
      whatsappConsentTextVersion: null,
    });

    const written = audits(recorder.statements);
    expect(written).toHaveLength(1);
    expect(actionOf(written[0])).toBe("consent.whatsapp.revoked");
  });

  /**
   * Every portal profile save carries a `whatsappOptIn` value, because the form
   * posts the checkbox either way. Only a TRANSITION is a consent change; a
   * member correcting their job title must not mint a consent event, or the
   * trail stops meaning anything.
   */
  it("writes no audit row when the flag does not move", async () => {
    const recorder = proxyDatabase(true);

    await profilesRepository.update(actor, "member-1", {displayName: "Ada Chan", whatsappOptIn: true});

    expect(audits(recorder.statements)).toHaveLength(0);
  });

  it("leaves an update that carries no consent value alone", async () => {
    const recorder = proxyDatabase(true);

    await profilesRepository.update(actor, "member-1", {jobTitle: "CTO"});

    expect(audits(recorder.statements)).toHaveLength(0);
    expect(recorder.statements.some((statement) => statement.sql.toLowerCase().startsWith("select"))).toBe(false);
  });

  it("refuses another member's profile before touching the database", async () => {
    const recorder = proxyDatabase(false);

    await expect(profilesRepository.update(actor, "member-2", {whatsappOptIn: true})).rejects.toThrow("FORBIDDEN");

    expect(recorder.statements).toHaveLength(0);
  });
});
