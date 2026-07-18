import {Pool} from "@neondatabase/serverless";

export const M1_PLAN_ROWS = [
  {code: "community", audience: "individual", billingBehavior: "free", stripePriceReference: null, seatAllowance: 1, active: true},
  {code: "startup", audience: "startup", billingBehavior: "checkout", stripePriceReference: null, seatAllowance: 5, active: true},
  {code: "corporate", audience: "corporate", billingBehavior: "checkout", stripePriceReference: null, seatAllowance: 25, active: true},
  {code: "patron", audience: "patron", billingBehavior: "review", stripePriceReference: null, seatAllowance: 1, active: true},
] as const;

type SeedClient = Readonly<{
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}>;

const planUpsert = `
  INSERT INTO membership_plans
    (code, audience, billing_behavior, stripe_price_reference, seat_allowance, active)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (code) DO UPDATE SET
    audience = EXCLUDED.audience,
    billing_behavior = EXCLUDED.billing_behavior,
    stripe_price_reference = EXCLUDED.stripe_price_reference,
    seat_allowance = EXCLUDED.seat_allowance,
    active = EXCLUDED.active,
    updated_at = now()
`;

export async function seedM1Plans(client: SeedClient): Promise<void> {
  for (const plan of M1_PLAN_ROWS) {
    await client.query(planUpsert, [
      plan.code,
      plan.audience,
      plan.billingBehavior,
      plan.stripePriceReference,
      plan.seatAllowance,
      plan.active,
    ]);
  }
}

export async function runM1Seed(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required to seed the database.");

  const pool = new Pool({connectionString: databaseUrl});
  try {
    await seedM1Plans(pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seed-m1.ts")) {
  runM1Seed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Database seed failed.");
    process.exitCode = 1;
  });
}
