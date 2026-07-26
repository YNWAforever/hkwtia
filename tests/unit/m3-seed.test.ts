import {describe, expect, it, vi} from "vitest";

import {
  M3_PROFILE_IDS,
  M3_SEED_NOW_ENV,
  buildM3SeedFixture,
  parseM3SeedNow,
  runM3Seed,
  seedM3,
  type M3SeedPool,
} from "@/scripts/seed-m3";

const NOW = new Date("2026-07-26T04:00:00.000Z");

type QueryCall = Readonly<{text: string; values: readonly unknown[]}>;

function fakePool(
  failWhen?: (text: string) => boolean,
): Readonly<{
  pool: M3SeedPool;
  calls: QueryCall[];
  release: ReturnType<typeof vi.fn>;
}> {
  const calls: QueryCall[] = [];
  const release = vi.fn();
  const pool: M3SeedPool = {
    async connect() {
      return {
        async query(text, values = []) {
          calls.push({text, values});
          if (failWhen?.(text)) throw new Error("FIXTURE_WRITE_FAILED");
          return {rows: []};
        },
        release,
      };
    },
  };
  return {pool, calls, release};
}

describe("M3 deterministic acceptance seed", () => {
  it("requires one explicit valid controlled instant", () => {
    expect(M3_SEED_NOW_ENV).toBe("M3_SEED_NOW");
    expect(parseM3SeedNow("2026-07-26T04:00:00.000Z")).toEqual(NOW);
    expect(() => parseM3SeedNow(undefined)).toThrow("M3_SEED_NOW_REQUIRED");
    expect(() => parseM3SeedNow("")).toThrow("M3_SEED_NOW_REQUIRED");
    expect(() => parseM3SeedNow("not-a-date")).toThrow("M3_SEED_NOW_INVALID");
    expect(() => parseM3SeedNow("2026-07-26")).toThrow("M3_SEED_NOW_INVALID");
    expect(() => parseM3SeedNow("2026-07-26T12:00:00"))
      .toThrow("M3_SEED_NOW_INVALID");
  });

  it("builds the exact acceptance personas and stable fixture twice", () => {
    const first = buildM3SeedFixture(NOW);
    const second = buildM3SeedFixture(new Date(NOW));

    expect(first).toEqual(second);
    expect(Object.keys(M3_PROFILE_IDS).sort()).toEqual([
      "campaignEligible",
      "day7LoggedIn",
      "day7NoLogin",
      "engagementMember",
      "marketingUnsubscribed",
      "memberAccess",
      "renewalWhatsappOptedIn",
      "renewalWhatsappOptedOut",
      "staffAdmin",
    ]);
    expect(first.profiles.map(({id}) => id).sort())
      .toEqual(Object.values(M3_PROFILE_IDS).sort());
    expect(first.profiles.find(({id}) => id === M3_PROFILE_IDS.staffAdmin))
      .toMatchObject({role: "staff"});
    expect(first.profiles.find(({id}) => id === M3_PROFILE_IDS.memberAccess))
      .toMatchObject({role: "member"});

    const noLogin = first.profiles.find(
      ({id}) => id === M3_PROFILE_IDS.day7NoLogin,
    );
    const loggedIn = first.profiles.find(
      ({id}) => id === M3_PROFILE_IDS.day7LoggedIn,
    );
    const unsubscribed = first.profiles.find(
      ({id}) => id === M3_PROFILE_IDS.marketingUnsubscribed,
    );
    expect(noLogin?.lastLoginAt).toBeNull();
    expect(loggedIn?.lastLoginAt).not.toBeNull();
    expect(unsubscribed).toMatchObject({consentMarketing: false});
    expect(first.suppressions).toEqual([
      expect.objectContaining({
        profileId: M3_PROFILE_IDS.marketingUnsubscribed,
        channel: "email",
        classification: "marketing",
      }),
    ]);

    expect(first.journeys.filter(({step}) => step === "day7_nudge"))
      .toHaveLength(2);
    expect(first.journeys.filter(({step}) => step === "day7_mixer"))
      .toHaveLength(2);
    expect(first.journeys.filter(({step}) => step === "renewal_14"))
      .toHaveLength(3);
    expect(first.journeys.filter(({status}) => status === "failed"))
      .toEqual([
        expect.objectContaining({
          profileId: M3_PROFILE_IDS.memberAccess,
          journey: "dunning",
          errorCode: "provider_client_error",
        }),
      ]);
    expect(first.campaignRecipients.map(({profileId}) => profileId).sort())
      .toEqual([
        M3_PROFILE_IDS.campaignEligible,
        M3_PROFILE_IDS.marketingUnsubscribed,
      ].sort());
    expect(first.approvals).toHaveLength(1);
    expect(first.jobs).toEqual([
      expect.objectContaining({
        kind: "worker-alert",
        state: "failed",
        lastError: "WORKER_ALERT_DELIVERY_FAILED",
      }),
    ]);
  });

  it("derives Day-7 and renewal D-14 rows from the controlled Hong Kong day", () => {
    const fixture = buildM3SeedFixture(NOW);
    expect(fixture.hongKongDayStart.toISOString())
      .toBe("2026-07-25T16:00:00.000Z");
    expect(fixture.onboardingActivatedAt.toISOString())
      .toBe("2026-07-18T16:00:00.000Z");

    const day7Rows = fixture.journeys.filter(
      ({step}) => step === "day7_nudge" || step === "day7_mixer",
    );
    expect(day7Rows.map(({scheduledAt}) => scheduledAt.toISOString()))
      .toEqual(Array.from(
        {length: 4},
        () => "2026-07-25T16:00:00.000Z",
      ));

    const renewalRows = fixture.journeys.filter(
      ({step}) => step === "renewal_14",
    );
    expect(renewalRows.map(({scheduledAt}) => scheduledAt.toISOString()))
      .toEqual(Array.from(
        {length: 3},
        () => "2026-07-25T16:00:00.000Z",
      ));
    expect(
      fixture.memberships
        .filter(({profileId: membershipProfileId}) => renewalRows.some(
          ({profileId: renewalProfileId}) =>
            renewalProfileId === membershipProfileId,
        ))
        .map(({billingPeriodEnd}) => billingPeriodEnd.toISOString()),
    ).toEqual(Array.from(
      {length: 3},
      () => "2026-08-08T16:00:00.000Z",
    ));
  });

  it("contains only fixed non-real contact and identity data", () => {
    const fixture = buildM3SeedFixture(NOW);
    for (const profile of fixture.profiles) {
      expect(profile.authUserId).toMatch(/^m3-test-auth-/);
      expect(profile.email).toMatch(/@m3\.example\.test$/);
      if (profile.whatsappNumber) {
        expect(profile.whatsappNumber).toMatch(/^\+8520000000[12]$/);
      }
    }
    for (const recipient of fixture.campaignRecipients) {
      expect(recipient.email).toMatch(/@m3\.example\.test$/);
    }
    expect(JSON.stringify(fixture)).not.toMatch(
      /resend|woztell_api|postgres(?:ql)?:\/\/|bearer\s/i,
    );
  });

  it("uses one advisory-locked transaction and repeats identical writes", async () => {
    const first = fakePool();
    const second = fakePool();

    await seedM3(first.pool, {now: NOW});
    await seedM3(second.pool, {now: new Date(NOW)});

    expect(first.calls[0]?.text.trim()).toBe("BEGIN");
    expect(first.calls[1]?.text).toContain("pg_advisory_xact_lock");
    expect(first.calls.at(-1)?.text.trim()).toBe("COMMIT");
    expect(first.calls.some(({text}) => text.trim() === "ROLLBACK")).toBe(false);
    expect(first.release).toHaveBeenCalledOnce();
    expect(second.release).toHaveBeenCalledOnce();
    expect(second.calls).toEqual(first.calls);
  });

  it("rolls back the complete seed and releases the connection on a write error", async () => {
    const {pool, calls, release} = fakePool(
      (text) => text.includes("INSERT INTO profiles"),
    );

    await expect(seedM3(pool, {now: NOW})).rejects.toThrow(
      "FIXTURE_WRITE_FAILED",
    );
    expect(calls[0]?.text.trim()).toBe("BEGIN");
    expect(calls.at(-1)?.text.trim()).toBe("ROLLBACK");
    expect(calls.some(({text}) => text.trim() === "COMMIT")).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not overwrite an existing shared community plan", async () => {
    const original = {
      audience: "existing-audience",
      billingBehavior: "existing-billing",
      annualPriceHkd: 777,
      monthlyPriceHkd: 88,
      seatAllowance: 9,
      active: false,
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    let stored = {...original};
    let planSql = "";
    const pool: M3SeedPool = {
      async connect() {
        return {
          async query(text) {
            if (text.includes("INSERT INTO membership_plans")) {
              planSql = text;
              if (text.includes("DO UPDATE SET")) {
                stored = {
                  audience: "individual",
                  billingBehavior: "free",
                  annualPriceHkd: 0,
                  monthlyPriceHkd: 0,
                  seatAllowance: 1,
                  active: true,
                  updatedAt: NOW.toISOString(),
                };
              }
            }
            return {rows: []};
          },
          release() {},
        };
      },
    };

    await seedM3(pool, {now: NOW});

    expect(stored).toEqual(original);
    expect(planSql).toMatch(
      /ON CONFLICT \(code\)\s+DO NOTHING/,
    );
    expect(planSql).not.toContain("DO UPDATE SET");
  });

  it("still inserts the community plan on a blank migrated database", async () => {
    let inserted: Readonly<{
      code: string;
      audience: string;
      billingBehavior: string;
    }> | null = null;
    const pool: M3SeedPool = {
      async connect() {
        return {
          async query(text) {
            if (text.includes("INSERT INTO membership_plans")) {
              inserted = {
                code: "community",
                audience: "individual",
                billingBehavior: "free",
              };
              expect(text).toMatch(
                /ON CONFLICT \(code\)\s+DO NOTHING/,
              );
            }
            return {rows: []};
          },
          release() {},
        };
      },
    };

    await seedM3(pool, {now: NOW});

    expect(inserted).toEqual({
      code: "community",
      audience: "individual",
      billingBehavior: "free",
    });
  });

  it("validates environment inputs before opening a database pool", async () => {
    await expect(runM3Seed({})).rejects.toThrow(
      "DATABASE_URL is required to seed M3 fixtures.",
    );
    await expect(runM3Seed({DATABASE_URL: "postgresql://example.invalid/test"}))
      .rejects.toThrow("M3_SEED_NOW_REQUIRED");
  });
});
