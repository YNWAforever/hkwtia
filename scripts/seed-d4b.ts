import {fileURLToPath} from "node:url";

import {Pool} from "pg";

import {signPassToken} from "../lib/tickets/pass-token.ts";
import {localizedPath} from "../lib/urls.ts";
import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";

export const D4B_ACCEPTANCE_SEED_ENV = "D4B_ACCEPTANCE_SEED";
export const D4B_ACCEPTANCE_OWNERSHIP_KEY = "d4b-passes-acceptance-v1";
export const D4B_EVENT_SLUG = "d4b-acceptance-ticket-event";
export const D4B_SEAT_IDS = ["d4b00000-0000-4000-8000-000000000001", "d4b00000-0000-4000-8000-000000000002"] as const;

// The event and order carry stable ids too, so a second run updates the rows it
// wrote rather than inserting a second event under the same slug (which the
// unique index would refuse) or a second order under the same idempotency key.
export const D4B_EVENT_ID = "d4b00000-0000-4000-8000-000000000010";
export const D4B_ORDER_ID = "d4b00000-0000-4000-8000-000000000020";
export const D4B_ORDER_IDEMPOTENCY_KEY = "d4b-acceptance-order";

const D4B_EVENT_TITLE_EN = "D4B Acceptance Ticket Event";
const D4B_EVENT_TITLE_ZH = "D4B 驗收門票活動";

/**
 * The brief's guard call was `assertIsolatedSeedEnvironment({prefix, flag,
 * hostAllowlistVar, environment})`; the real helper takes `(environment,
 * options)` and returns the resolved URL, so this wraps it that way instead.
 * Called before any pool exists, which is what `runD4bSeed` below pins.
 */
export function requireD4bSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return assertIsolatedSeedEnvironment(environment, {
    prefix: "D4B_ACCEPTANCE",
    flag: D4B_ACCEPTANCE_SEED_ENV,
    hostAllowlistVar: "D4B_ACCEPTANCE_DATABASE_HOST_ALLOWLIST",
  });
}

export type D4bSeedConnection = Readonly<{
  query: (text: string, values?: readonly unknown[]) => Promise<{rows?: readonly Record<string, unknown>[]}>;
  release: () => void;
}>;
export type D4bSeedPool = Readonly<{connect: () => Promise<D4bSeedConnection>}>;
type SeedPoolWithEnd = D4bSeedPool & Readonly<{end: () => Promise<void>}>;

/**
 * One paid event, one paid order and two unchecked seats, all on stable ids so a
 * second run creates no duplicates.
 *
 * It refuses to take over an order it did not write: an order left in another
 * status (a refunded seat, an expired hold) is a state the acceptance evidence
 * depends on, so the seed stops rather than quietly resetting it to `paid` and
 * hiding the difference.
 */
export async function seedD4b(pool: D4bSeedPool, options: Readonly<{asOf: Date}>): Promise<void> {
  const {asOf} = options;
  if (!Number.isFinite(asOf.getTime())) throw new Error("D4B_ACCEPTANCE_AS_OF_INVALID");
  const startsAt = new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000);
  const connection = await pool.connect();
  let committed = false;
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [D4B_ACCEPTANCE_OWNERSHIP_KEY]);

    const existing = (await connection.query(
      "SELECT status FROM event_orders WHERE idempotency_key = $1 LIMIT 1",
      [D4B_ORDER_IDEMPOTENCY_KEY],
    )).rows?.[0];
    if (existing && String(existing.status) !== "paid") throw new Error("D4B_ACCEPTANCE_ORDER_NOT_PAID");

    await connection.query(
      `INSERT INTO events
       (id, slug, title_en, title_zh, description_en, description_zh, starts_at, venue,
        capacity, member_only, published, status, visibility, format, registration_mode,
        ticket_price_hkd_cents, published_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
         100, false, true, 'published'::event_status, 'public'::event_visibility,
         'in_person'::event_format, 'ticketed'::registration_mode, 25000, $9, $9, $9)
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug, title_en = EXCLUDED.title_en, title_zh = EXCLUDED.title_zh,
         description_en = EXCLUDED.description_en, description_zh = EXCLUDED.description_zh,
         starts_at = EXCLUDED.starts_at, venue = EXCLUDED.venue, capacity = EXCLUDED.capacity,
         member_only = EXCLUDED.member_only, published = EXCLUDED.published, status = EXCLUDED.status,
         visibility = EXCLUDED.visibility, format = EXCLUDED.format,
         registration_mode = EXCLUDED.registration_mode,
         ticket_price_hkd_cents = EXCLUDED.ticket_price_hkd_cents,
         published_at = EXCLUDED.published_at, updated_at = EXCLUDED.updated_at`,
      [D4B_EVENT_ID, D4B_EVENT_SLUG, D4B_EVENT_TITLE_EN, D4B_EVENT_TITLE_ZH,
        "A synthetic, non-production ticketed event for D-4b acceptance verification.",
        "D-4b 驗收用的合成、非生產收費活動。", startsAt, "WTIA Office", asOf],
    );

    await connection.query(
      `INSERT INTO event_orders
       (id, event_id, buyer_profile_id, buyer_name, buyer_email, buyer_locale, amount_hkd_cents,
        currency, status, idempotency_key, expires_at, paid_at, created_at, updated_at)
       VALUES ($1, $2, NULL, $3, $4, 'en', 50000, 'hkd', 'paid'::event_order_status, $5, $6, $6, $6, $6)
       ON CONFLICT (id) DO UPDATE SET
         event_id = EXCLUDED.event_id, buyer_name = EXCLUDED.buyer_name,
         buyer_email = EXCLUDED.buyer_email, buyer_locale = EXCLUDED.buyer_locale,
         amount_hkd_cents = EXCLUDED.amount_hkd_cents, status = EXCLUDED.status,
         idempotency_key = EXCLUDED.idempotency_key, expires_at = EXCLUDED.expires_at,
         paid_at = EXCLUDED.paid_at, updated_at = EXCLUDED.updated_at`,
      [D4B_ORDER_ID, D4B_EVENT_ID, "D4B Acceptance Buyer", "d4b-buyer@example.test",
        D4B_ORDER_IDEMPOTENCY_KEY, asOf],
    );

    const seats = [
      {id: D4B_SEAT_IDS[0], position: 1, name: "D4B Acceptance One", email: "d4b-one@example.test"},
      {id: D4B_SEAT_IDS[1], position: 2, name: "D4B Acceptance Two", email: "d4b-two@example.test"},
    ];
    for (const seat of seats) {
      await connection.query(
        `INSERT INTO event_order_seats
         (id, order_id, position, attendee_name, attendee_email, checked_in_at, created_at)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)
         ON CONFLICT (id) DO UPDATE SET
           order_id = EXCLUDED.order_id, position = EXCLUDED.position,
           attendee_name = EXCLUDED.attendee_name, attendee_email = EXCLUDED.attendee_email,
           checked_in_at = NULL`,
        [seat.id, D4B_ORDER_ID, seat.position, seat.name, seat.email, asOf],
      );
    }

    const counts = (await connection.query(
      `SELECT
         (SELECT count(*)::integer FROM events WHERE id = $1::uuid AND slug = $2) AS event_count,
         (SELECT count(*)::integer FROM event_orders WHERE id = $3::uuid AND event_id = $1::uuid AND status = 'paid') AS order_count,
         (SELECT count(*)::integer FROM event_order_seats WHERE id = ANY($4::uuid[]) AND order_id = $3::uuid) AS seat_count`,
      [D4B_EVENT_ID, D4B_EVENT_SLUG, D4B_ORDER_ID, D4B_SEAT_IDS],
    )).rows?.[0];
    if (Number(counts?.event_count) !== 1 || Number(counts?.order_count) !== 1 || Number(counts?.seat_count) !== 2) {
      throw new Error("D4B_ACCEPTANCE_OWNED_COUNT_MISMATCH");
    }

    await connection.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) {
      try { await connection.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * The walk cannot derive a token — it does not hold the secret — so the seed
 * prints every URL the walk needs, in both locales and for both seats. The walk
 * reads them from the environment.
 */
export function d4bAcceptanceUrls(appUrl: string, secret: string): readonly string[] {
  const base = appUrl.replace(/\/+$/, "");
  const lines: string[] = [];
  for (const [index, seatId] of D4B_SEAT_IDS.entries()) {
    const label = index === 0 ? "ONE" : "TWO";
    const token = signPassToken({seatId, eventId: D4B_EVENT_ID}, secret);
    for (const [locale, suffix] of [["en", ""], ["zh-HK", "_ZH"]] as const) {
      lines.push(`D4B_PASS_URL_${label}${suffix}=${base}${localizedPath(locale, `/pass/${token}`)}`);
      lines.push(`D4B_CHECK_IN_URL_${label}${suffix}=${base}${localizedPath(locale, `/admin/check-in/${token}`)}`);
    }
  }
  return lines;
}

export async function runD4bSeed(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  createPool: (databaseUrl: string) => SeedPoolWithEnd = (databaseUrl) => new Pool({connectionString: databaseUrl}) as unknown as SeedPoolWithEnd,
): Promise<void> {
  // The guard runs before a pool exists. `createPool` is the seam that pins it:
  // an isolated host is never contacted unless every acceptance fact is present.
  const databaseUrl = requireD4bSeedEnvironment(environment);
  // Read here rather than through `lib/config/env`, whose accessors import `@/`
  // aliases that plain `node` cannot resolve. The seed only needs the two values
  // to build the printed URLs; the app still owns the accessors for its own reads.
  const appUrl = environment.APP_URL?.trim() ?? "";
  const passSecret = environment.TICKET_PASS_TOKEN_SECRET?.trim() ?? "";
  if (!appUrl || !passSecret) throw new Error("D4B_ACCEPTANCE_PASS_URL_ENV_REQUIRED");
  const pool = createPool(databaseUrl);
  try {
    await seedD4b(pool, {asOf: new Date()});
  } finally {
    await pool.end();
  }
  for (const line of d4bAcceptanceUrls(appUrl, passSecret)) console.log(line);
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url).toLowerCase() === entrypoint.toLowerCase()) {
  runD4bSeed().catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error(`D4B passes acceptance database seed failed: ${code}`);
    process.exitCode = 1;
  });
}
