# Phase D-4b —Passes, per-attendee email, and check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff admit a paid ticket seat by scanning its QR pass, and let every attendee reopen their own pass —with a staff session as the only thing that can write a check-in.

**Architecture:** One HMAC-signed per-seat token serves two views: a public read-only pass page that renders a server-side SVG QR, and a staff check-in page that is the only writer. Validity is never a token property —both views refuse unless the seat's order is `paid` and its event is not cancelled. Ticket seats become a third arm of the existing `EventAttendee` door list, so the admin table, its CSV export and the check-in action cover them without a new surface. No schema change.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, Drizzle/Postgres (Neon), Vitest, Playwright, `node:crypto` (HMAC-SHA256), SVG QR rendering.

**Spec:** `docs/superpowers/specs/2026-09-15-phase-d4b-passes-and-check-in-design.md`

**Predecessor:** D-4a (`feat/phase-d4a-ticket-checkout`, PR #68). This branch is based on it because it extends its code.

## Global Constraints

- **No migration, no schema change.** `event_order_seats.checked_in_at` already exists; nothing in this slice alters a table.
- **The write requires a staff session.** The token preselects a seat; it never authorizes admission. An attendee opening the check-in URL must see a sign-in prompt and no seat data.
- **Refusals are 404, never 403**, on both the pass page and the check-in page, so neither confirms which seats or events exist (the convention `lib/admin/event-attendees.ts` established).
- **The token is never logged** and never appears in an audit row; audit and logs name the seat id only.
- **`"use server"` modules export only formData-shaped wrappers.** The directive publishes every export as an HTTP endpoint; `tests/unit/server-action-actor-boundary.test.ts` discovers violations.
- **Every user-visible string lives in `messages/en.json` and `messages/zh-HK.json`, in parity**; run `npm run audit:strings`.
- **Mail is transactional through the email transport and `lib/email/catalog.ts`**, never `lib/notifications/dispatch.ts` (its gate is a marketing classifier).
- **A mail failure is logged, never rethrown** —a 500 would make Stripe redeliver an already-settled order.
- Conventional commits. Run before hand-off: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`.

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `lib/tickets/pass-token.ts` | Sign and verify the per-seat capability token. One job: bytes in, claims out, or `null`. |
| `lib/db/repos/ticket-check-in.ts` | The pass lookup (seat + order + event facts), the check-in and undo writes, and their audit rows. |
| `lib/tickets/check-in-actions.ts` | The two `"use server"` formData wrappers. No other exports. |
| `lib/tickets/qr.ts` | Text in, SVG string out. Wraps the QR dependency so it has one call site. |
| `app/[locale]/(public)/pass/[token]/page.tsx` | The public read-only pass page. |
| `app/[locale]/(admin)/admin/check-in/[token]/page.tsx` | The staff check-in page; the only writer. |
| `scripts/seed-d4b.ts` | The guarded acceptance fixture that mints a paid order with seats. |
| Tests | `tests/unit/pass-token.test.ts`, `tests/unit/ticket-check-in-repository.test.ts`, `tests/unit/ticket-qr.test.ts`, `tests/unit/pass-page.test.tsx`, `tests/unit/check-in-page.test.tsx`, `tests/unit/ticket-check-in-actions.test.ts`, `tests/e2e/phase-d4b-passes-and-check-in.spec.ts` |

**Modify**

| File | Change |
|---|---|
| `lib/config/env.ts` | A `TicketPassEnv` group owning `TICKET_PASS_TOKEN_SECRET`. |
| `.env.example` | The name only, no value. |
| `lib/db/repos/events.ts` | `EventAttendee` gains the `ticket` arm; `listEventAttendees` unions paid seats. |
| `lib/admin/event-attendees.ts` | The CSV already prints `kind`; verify the ticket rows pass through unchanged. |
| `components/admin/attendee-table.tsx` | A check-in action for ticket rows, plus the Resend pass control. |
| `lib/admin/event-actions.ts`, `lib/admin/event-action-core.ts` | The seat-keyed check-in, undo and resend bindings. |
| `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx` | Pass the new labels and actions. |
| `lib/email/catalog.ts`, both bundles, snapshot test | The `event_ticket_pass` template; the receipt gains `{attendees}`. |
| `lib/billing/ticket-webhook-processor.ts` | Send the per-attendee passes after a `paid` settlement. |
| `config/internal-navigation.ts` + `tests/unit/internal-navigation-config.test.ts` | The deep-link check-in route is deliberately **not** in the nav; the discovery test gets an allowlist entry carrying that reason. |
| `package.json` | The QR dependency and the `db:seed:d4b` script. |

---

### Task 1: The pass token

**Files:**
- Create: `lib/tickets/pass-token.ts`
- Test: `tests/unit/pass-token.test.ts` (create)
- Modify: `lib/config/env.ts`, `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: `signPassToken(claims, secret): string`, `verifyPassToken(token, secret): PassClaims | null`, `type PassClaims = {seatId: string; eventId: string}`, `PASS_TOKEN_VERSION = 1`, `passTokenSecret()` via `ticketPassEnv()`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pass-token.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {PASS_TOKEN_VERSION, signPassToken, verifyPassToken} from "@/lib/tickets/pass-token";

const secret = "test-secret-not-a-real-key";
const claims = {seatId: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f", eventId: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d"};

describe("pass tokens", () => {
  it("round-trips the claims it was signed with", () => {
    expect(verifyPassToken(signPassToken(claims, secret), secret)).toEqual({...claims, v: PASS_TOKEN_VERSION});
  });

  it("returns null for a tampered payload rather than a partial claim", () => {
    const token = signPassToken(claims, secret);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({...claims, seatId: "00000000-0000-4000-8000-000000000000"}), "utf8").toString("base64url");
    expect(verifyPassToken(`${forged}.${signature}`, secret)).toBeNull();
    expect(verifyPassToken(`${payload}.${signature}`, "another-secret")).toBeNull();
  });

  it("returns null for a token signed under a different version, so rotation invalidates rather than reinterprets", () => {
    expect(verifyPassToken(signPassToken(claims, secret, PASS_TOKEN_VERSION + 1), secret)).toBeNull();
  });

  it("refuses malformed input without throwing", () => {
    for (const bad of ["", "no-dot", "a.b.c", "....", "x".repeat(4097)]) {
      expect(verifyPassToken(bad, secret)).toBeNull();
    }
    expect(verifyPassToken(signPassToken(claims, secret), "")).toBeNull();
  });

  it("refuses a payload whose ids are not uuids", () => {
    const forgedPayload = Buffer.from(JSON.stringify({v: PASS_TOKEN_VERSION, seatId: "not-a-uuid", eventId: claims.eventId}), "utf8").toString("base64url");
    expect(verifyPassToken(`${forgedPayload}.${signPassToken(claims, secret).split(".")[1]}`, secret)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/pass-token.test.ts`
Expected: FAIL —`Failed to resolve import "@/lib/tickets/pass-token"`.

- [ ] **Step 3: Implement**

Create `lib/tickets/pass-token.ts`, mirroring `lib/email/unsubscribe-token.ts` (base64url JSON payload `.` base64url HMAC, narrow payload guard, constant-time compare, length bound):

```ts
import "server-only";

import {createHmac, timingSafeEqual} from "node:crypto";

/** Bump to invalidate every outstanding pass deliberately, at a rotation. */
export const PASS_TOKEN_VERSION = 1;

export type PassClaims = Readonly<{seatId: string; eventId: string}>;
type SignedClaims = PassClaims & Readonly<{v: number}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSignedClaims(value: unknown): value is SignedClaims {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.seatId === "string" && uuidPattern.test(payload.seatId)
    && typeof payload.eventId === "string" && uuidPattern.test(payload.eventId)
    && Number.isInteger(payload.v);
}

function signature(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function signPassToken(claims: PassClaims, secret: string, version: number = PASS_TOKEN_VERSION): string {
  if (!secret) throw new Error("TICKET_PASS_SECRET_REQUIRED");
  if (!uuidPattern.test(claims.seatId) || !uuidPattern.test(claims.eventId)) throw new Error("INVALID_PASS_CLAIMS");
  const payload: SignedClaims = {v: version, seatId: claims.seatId, eventId: claims.eventId};
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, secret).toString("base64url")}`;
}

/**
 * `null` for anything doubtful —a bad signature, a stale version, a malformed
 * body, an over-long token. Callers treat `null` as "no such pass" and 404.
 */
export function verifyPassToken(token: string, secret: string): SignedClaims | null {
  if (!secret || token.length === 0 || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSignature] = parts;

  try {
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = signature(encodedPayload, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!isSignedClaims(payload) || payload.v !== PASS_TOKEN_VERSION) return null;
    return payload;
  } catch {
    return null;
  }
}
```

Add the env group in `lib/config/env.ts`, beside `UnsubscribeEnv` (around line 417):

```ts
export type TicketPassEnv = Readonly<{ticketPassTokenSecret: string}>;

export function parseTicketPassEnv(environment: Environment = process.env): TicketPassEnv {
  requireProductionKeys(environment, ["TICKET_PASS_TOKEN_SECRET"]);

  return {
    ticketPassTokenSecret: valueFor(environment, "TICKET_PASS_TOKEN_SECRET"),
  };
}

export function ticketPassEnv(): TicketPassEnv {
  return parseTicketPassEnv(process.env);
}
```

Add the name only to `.env.example`, beside `UNSUBSCRIBE_TOKEN_SECRET`:

```sh
# Signs per-seat ticket pass tokens. Required where passes are issued or read.
TICKET_PASS_TOKEN_SECRET=
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/pass-token.test.ts && npm run typecheck`
Expected: PASS, typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/tickets/pass-token.ts lib/config/env.ts .env.example tests/unit/pass-token.test.ts
git commit -m "feat(tickets): a signed per-seat pass token"
```

---

### Task 2: The pass lookup and the check-in writes

**Files:**
- Create: `lib/db/repos/ticket-check-in.ts`
- Test: `tests/unit/ticket-check-in-repository.test.ts` (create)

**Interfaces:**
- Consumes: `PassClaims` (Task 1) for the shape of a verified pass; `event_order_seats`, `event_orders`, `events`, `audit_events` from `@/lib/db/server-schema`.
- Produces: `createTicketCheckInRepository(transaction?)` returning `{passForSeat(claims), checkInSeat(actor, {seatId}), undoSeatCheckIn(actor, {seatId})}`; `PassView`, `SeatCheckInView`, `TicketCheckInTransaction`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ticket-check-in-repository.test.ts` with a hand-written fake transaction, asserting:

```ts
import {describe, expect, it, vi} from "vitest";

import {createTicketCheckInRepository, type TicketCheckInTransaction} from "@/lib/db/repos/ticket-check-in";

const staff = {kind: "staff" as const, userId: "auth-1", profileId: "p-1"};
const eventId = "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d";
const seatId = "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f";

function fake(overrides: Partial<{orderStatus: string; checkedInAt: Date | null; eventStatus: string}> = {}) {
  const update = vi.fn(async () => undefined);
  const insertAudit = vi.fn(async () => undefined);
  const transaction: TicketCheckInTransaction = {
    lockSeat: vi.fn(async () => ({seatId, eventId, position: 1, attendeeName: "Ada Lovelace", attendeeEmail: "ada@example.test", checkedInAt: overrides.checkedInAt ?? null, orderId: "order-1", orderStatus: overrides.orderStatus ?? "paid", eventStatus: overrides.eventStatus ?? "published"})),
    update,
    insertAudit,
  };
  return {transaction, update, insertAudit};
}
```

Cover, one case each:
- `passForSeat` returns the seat facts for a `paid` order;
- `passForSeat` returns `null` for a `refunded`, `expired`, `pending` or `failed` order, and for a `cancelled` event, so both views 404;
- `checkInSeat` sets `checked_in_at` and writes `event.seat.checked_in` with `targetId: seatId` and metadata naming the event, order and position;
- `checkInSeat` on an already-checked-in seat returns `already_checked_in` and writes nothing;
- `checkInSeat` refuses a non-`paid` order and a cancelled event with `not_admissible`, writing nothing;
- `undoSeatCheckIn` clears `checked_in_at` and writes `event.seat.check_in_reversed`;
- `undoSeatCheckIn` on a seat that is not checked in returns `not_checked_in` and writes nothing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/ticket-check-in-repository.test.ts`
Expected: FAIL —`Failed to resolve import`.

- [ ] **Step 3: Implement**

Create `lib/db/repos/ticket-check-in.ts` following `lib/db/repos/event-check-in.ts` exactly (injected transaction, row lock, audit in the same transaction):

```ts
import "server-only";

import {eq} from "drizzle-orm";

import {getDb} from "@/lib/db/repos/common";
import {auditEvents, eventOrderSeats, eventOrders, events} from "@/lib/db/server-schema";
import type {PassClaims} from "@/lib/tickets/pass-token";
import type {AdminActor} from "@/lib/membership/lifecycle";

/** The facts a pass may disclose. Never the order's other seats, never the buyer. */
export type PassView = Readonly<{
  seatId: string; orderId: string; eventId: string; position: number;
  attendeeName: string; checkedInAt: Date | null;
  eventTitleEn: string; eventTitleZh: string | null; eventSlug: string;
  eventStartsAt: Date; eventVenue: string | null; buyerLocale: "en" | "zh-HK";
}>;

export type SeatRow = Readonly<{
  seatId: string; eventId: string; position: number; attendeeName: string; attendeeEmail: string;
  checkedInAt: Date | null; orderId: string; orderStatus: string; eventStatus: string;
  eventTitleEn?: string; eventTitleZh?: string | null; eventSlug?: string; eventStartsAt?: Date;
  eventVenue?: string | null; buyerLocale?: "en" | "zh-HK";
}>;

export type TicketCheckInTransaction = Readonly<{
  lockSeat: (seatId: string) => Promise<SeatRow | null>;
  update: (seatId: string, patch: Readonly<{checkedInAt: Date | null}>) => Promise<void>;
  insertAudit: (input: Readonly<{actorUserId: string | null; actorType: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>}>) => Promise<void>;
}>;

export type TicketCheckInDependencies = Readonly<{
  transaction: <T>(work: (transaction: TicketCheckInTransaction) => Promise<T>) => Promise<T>;
  now: () => Date;
}>;
```

Then the repository itself:

```ts
function inadmissible(row: SeatRow): boolean {
  return row.orderStatus !== "paid" || row.eventStatus === "cancelled";
}

export function createTicketCheckInRepository(
  overrides: Partial<TicketCheckInDependencies> = {},
): Readonly<{
  passForSeat: (claims: PassClaims) => Promise<PassView | null>;
  checkInSeat: (actor: AdminActor, input: Readonly<{seatId: string}>) => Promise<Readonly<{disposition: "checked_in" | "already_checked_in" | "not_admissible"}>>;
  undoSeatCheckIn: (actor: AdminActor, input: Readonly<{seatId: string}>) => Promise<Readonly<{disposition: "undone" | "not_checked_in"}>>;
}> {
  const dependencies: TicketCheckInDependencies = {
    transaction: async (work) => (await getDb()).transaction(async (tx) => work({
      lockSeat: async (seatId) => {
        const row = (await tx.select({
          seatId: eventOrderSeats.id,
          eventId: eventOrderSeats.eventId ?? eventOrders.eventId,
          position: eventOrderSeats.position,
          attendeeName: eventOrderSeats.attendeeName,
          attendeeEmail: eventOrderSeats.attendeeEmail,
          checkedInAt: eventOrderSeats.checkedInAt,
          orderId: eventOrders.id,
          orderStatus: eventOrders.status,
          eventStatus: events.status,
          eventTitleEn: events.titleEn,
          eventTitleZh: events.titleZh,
          eventSlug: events.slug,
          eventStartsAt: events.startsAt,
          eventVenue: events.venue,
          buyerLocale: eventOrders.buyerLocale,
        }).from(eventOrderSeats)
          .innerJoin(eventOrders, eq(eventOrders.id, eventOrderSeats.orderId))
          .innerJoin(events, eq(events.id, eventOrders.eventId))
          .where(eq(eventOrderSeats.id, seatId))
          .for("update", {of: eventOrderSeats}))[0];
        return row ?? null;
      },
      update: async (seatId, patch) => {
        await tx.update(eventOrderSeats).set({checkedInAt: patch.checkedInAt}).where(eq(eventOrderSeats.id, seatId));
      },
      insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
    })),
    now: () => new Date(),
    ...overrides,
  };

  function auditFor(row: SeatRow, action: string): Readonly<{actorUserId: string | null; actorType: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>}> {
    return {actorUserId: null, actorType: "system", action, targetType: "event_order_seat", targetId: row.seatId, metadata: {eventId: row.eventId, orderId: row.orderId, position: row.position}};
  }

  return {
    async passForSeat(claims) {
      return dependencies.transaction(async (tx) => {
        const row = await tx.lockSeat(claims.seatId);
        // The event id must match the one that was signed: a token is for one
        // seat of one event, so a seat later moved between events is refused.
        if (!row || row.eventId !== claims.eventId || inadmissible(row)) return null;
        return {
          seatId: row.seatId,
          orderId: row.orderId,
          eventId: row.eventId,
          position: row.position,
          attendeeName: row.attendeeName,
          checkedInAt: row.checkedInAt,
          eventTitleEn: row.eventTitleEn ?? "",
          eventTitleZh: row.eventTitleZh ?? null,
          eventSlug: row.eventSlug ?? "",
          eventStartsAt: row.eventStartsAt ?? new Date(0),
          eventVenue: row.eventVenue ?? null,
          buyerLocale: row.buyerLocale ?? "en",
        };
      });
    },

    async checkInSeat(actor, input) {
      const occurredAt = dependencies.now();
      return dependencies.transaction(async (tx) => {
        const row = await tx.lockSeat(input.seatId);
        if (!row || inadmissible(row)) return {disposition: "not_admissible" as const};
        // The lock makes a double scan a no-op rather than two admissions.
        if (row.checkedInAt) return {disposition: "already_checked_in" as const};
        await tx.update(row.seatId, {checkedInAt: occurredAt});
        const audit = auditFor(row, "event.seat.checked_in");
        await tx.insertAudit({...audit, actorUserId: actor.userId, actorType: actor.kind});
        return {disposition: "checked_in" as const};
      });
    },

    async undoSeatCheckIn(actor, input) {
      return dependencies.transaction(async (tx) => {
        const row = await tx.lockSeat(input.seatId);
        if (!row || row.checkedInAt === null) return {disposition: "not_checked_in" as const};
        await tx.update(row.seatId, {checkedInAt: null});
        const audit = auditFor(row, "event.seat.check_in_reversed");
        await tx.insertAudit({...audit, actorUserId: actor.userId, actorType: actor.kind});
        return {disposition: "undone" as const};
      });
    },
  };
}

export const ticketCheckInRepository = createTicketCheckInRepository();
```

`actor.userId` may be `null` for a system actor, which the audit column already allows. The seat's `eventId` is read through the order rather than from the seat, so a seat row cannot disagree with its order about which event it belongs to.


- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/ticket-check-in-repository.test.ts && npm run typecheck`
Expected: PASS, typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/ticket-check-in.ts tests/unit/ticket-check-in-repository.test.ts
git commit -m "feat(db): a pass lookup and the seat check-in writes"
```

---

### Task 3: The QR and the public pass page

**Files:**
- Create: `lib/tickets/qr.ts`, `app/[locale]/(public)/pass/[token]/page.tsx`
- Test: `tests/unit/ticket-qr.test.ts`, `tests/unit/pass-page.test.tsx` (create)
- Modify: `package.json` (the QR dependency), both bundles (`Pass` namespace)

**Interfaces:**
- Consumes: `verifyPassToken`/`ticketPassEnv` (Task 1), `ticketCheckInRepository.passForSeat` (Task 2).
- Produces: `qrSvg(text): Promise<string>`; the page at `/[locale]/pass/[token]`.

- [ ] **Step 1: Add the dependency and write the failing tests**

```bash
npm install qrcode && npm install --save-dev @types/qrcode
```

Create `tests/unit/ticket-qr.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {qrSvg} from "@/lib/tickets/qr";

describe("qrSvg", () => {
  it("returns an SVG document, not an image path or a data url", async () => {
    const svg = await qrSvg("https://hkwtia.org/en/admin/check-in/abc.def");
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("data:image");
  });

  it("encodes different payloads differently, so the QR is not a placeholder", async () => {
    const first = await qrSvg("https://example.test/a");
    const second = await qrSvg("https://example.test/b");
    expect(first).not.toEqual(second);
  });

  it("emits no script, because the pass page inlines it", async () => {
    expect(await qrSvg("https://example.test/a")).not.toMatch(/<script/i);
  });
});
```

Create `tests/unit/pass-page.test.tsx` driving the page's data function (a plain async function the page calls, exported for the test the way `lib/admin/event-attendees.ts` exports its factory):

```tsx
import {describe, expect, it} from "vitest";

import {loadPassPage} from "@/app/[locale]/(public)/pass/[token]/page";

const claims = {seatId: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f", eventId: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d"};

describe("the public pass page", () => {
  it("returns the pass for a valid token over a paid seat", async () => {
    const result = await loadPassPage("tok", {
      verify: () => ({...claims, v: 1}),
      passForSeat: async () => ({seatId: claims.seatId, orderId: "o", eventId: claims.eventId, position: 1, attendeeName: "Ada", checkedInAt: null, eventTitleEn: "Edge AI", eventTitleZh: null, eventSlug: "edge-ai", eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: "Cyberport", buyerLocale: "en"}),
    });
    expect(result).toMatchObject({attendeeName: "Ada", eventTitle: "Edge AI"});
  });

  it("returns null for an invalid token, and for a seat whose order is not paid", async () => {
    expect(await loadPassPage("bad", {verify: () => null, passForSeat: async () => null})).toBeNull();
    expect(await loadPassPage("tok", {verify: () => ({...claims, v: 1}), passForSeat: async () => null})).toBeNull();
  });

  it("uses the Chinese title for a zh-HK pass", async () => {
    const result = await loadPassPage("tok", {
      verify: () => ({...claims, v: 1}),
      passForSeat: async () => ({seatId: claims.seatId, orderId: "o", eventId: claims.eventId, position: 1, attendeeName: "Ada", checkedInAt: null, eventTitleEn: "Edge AI", eventTitleZh: "邊緣 AI", eventSlug: "edge-ai", eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: null, buyerLocale: "zh-HK"}),
    });
    expect(result?.eventTitle).toBe("邊緣 AI");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/ticket-qr.test.ts tests/unit/pass-page.test.tsx`
Expected: FAIL —`Failed to resolve import`.

- [ ] **Step 3: Implement**

Create `lib/tickets/qr.ts` —one call site, so swapping the dependency is a one-file change:

```ts
import "server-only";

import QRCode from "qrcode";

/**
 * The QR as an SVG string. SVG rather than PNG because there is no image
 * pipeline in this project and none is needed: it is text, so it inlines into
 * the page and stays crisp at any size.
 */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {type: "svg", errorCorrectionLevel: "M", margin: 1});
}
```

Create `app/[locale]/(public)/pass/[token]/page.tsx`. The data loading is an exported function so the unit test drives it without a database or a session:

```tsx
import {notFound} from "next/navigation";

import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {appEnv, ticketPassEnv} from "@/lib/config/env";
import {ticketCheckInRepository} from "@/lib/db/repos/ticket-check-in";
import {localizedPath} from "@/lib/urls";
import {qrSvg} from "@/lib/tickets/qr";
import {signPassToken, verifyPassToken, type PassClaims} from "@/lib/tickets/pass-token";

export type PassPageData = Readonly<{
  attendeeName: string; position: number; eventTitle: string; eventStartsAt: Date;
  eventVenue: string | null; checkedInAt: Date | null; checkInUrl: string; qr: string;
}>;

export type PassPageDependencies = Readonly<{
  verify: (token: string) => PassClaims | null;
  passForSeat: (claims: PassClaims) => Promise<PassPageData | null>;
}>;

/**
 * The QR encodes the STAFF check-in URL, never the pass URL, so a page anyone
 * may open publishes nothing writable. Staff scan with the native camera and
 * land on the only surface that can admit someone.
 *
 * The token is re-signed from the verified claims rather than echoed from the
 * URL, so a token that verified once is normalized before it is encoded.
 */
export async function loadPassPage(token: string, dependencies: PassPageDependencies = {
  verify: (value) => verifyPassToken(value, ticketPassEnv().ticketPassTokenSecret),
  passForSeat: async (claims) => {
    const view = await ticketCheckInRepository.passForSeat(claims);
    if (!view) return null;
    const locale = view.buyerLocale;
    const checkInUrl = `${appEnv().appUrl}${localizedPath(locale, `/admin/check-in/${signPassToken(claims, ticketPassEnv().ticketPassTokenSecret)}`)}`;
    return {
      attendeeName: view.attendeeName,
      position: view.position,
      eventTitle: locale === "zh-HK" ? view.eventTitleZh ?? view.eventTitleEn : view.eventTitleEn,
      eventStartsAt: view.eventStartsAt,
      eventVenue: view.eventVenue,
      checkedInAt: view.checkedInAt,
      checkInUrl,
      qr: await qrSvg(checkInUrl),
    };
  },
}): Promise<PassPageData | null> {
  const claims = dependencies.verify(token);
  if (!claims) return null;
  return dependencies.passForSeat(claims);
}

export const metadata = {robots: {index: false, follow: false}};

export default async function PassPage({params}: Readonly<{params: Promise<{locale: string; token: string}>}>) {
  const {locale: localeValue, token} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const data = await loadPassPage(token);
  if (!data) notFound();
  const t = await getTranslations({locale, namespace: "Pass"});
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-3xl font-semibold">{data.eventTitle}</h1>
        <p className="text-muted-foreground">{new Intl.DateTimeFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", {dateStyle: "full", timeStyle: "short", timeZone: "Asia/Hong_Kong"}).format(data.eventStartsAt)}{data.eventVenue ? ` 繚 ${data.eventVenue}` : ""}</p>
      </header>
      <section className="glass-card space-y-4 p-6">
        <p className="text-sm text-muted-foreground">{t("attendee")}</p>
        <p className="font-medium">{data.attendeeName}</p>
        <p className="text-sm text-muted-foreground">{t("seat", {position: data.position})}</p>
        {/* The QR is SVG produced by our own server; there is no user-supplied markup here. */}
        <div aria-label={t("qrLabel")} className="mx-auto w-64 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{__html: data.qr}} role="img"/>
        {data.checkedInAt ? <p className="text-sm text-muted-foreground" role="status">{t("checkedIn")}</p> : null}
        <p className="text-xs text-muted-foreground">{t("presentAtDoor")}</p>
      </section>
    </main>
  );
}
```

`dangerouslySetInnerHTML` is safe here because the only content is our own `qrSvg` output, and the unit test asserts it carries no `<script`. Add the `Pass` namespace to both bundles in parity: `eyebrow`, `attendee`, `seat`, `qrLabel`, `checkedIn`, `presentAtDoor`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/ticket-qr.test.ts tests/unit/pass-page.test.tsx && npm run audit:strings && npm run typecheck`
Expected: PASS, audit clean, typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/tickets/qr.ts "app/[locale]/(public)/pass" tests/unit/ticket-qr.test.ts tests/unit/pass-page.test.tsx messages package.json package-lock.json
git commit -m "feat(tickets): a public pass page with a server-rendered QR"
```

---

### Task 4: Ticket seats in the door list

**Files:**
- Modify: `lib/db/repos/events.ts` (the `EventAttendee` type and `listEventAttendees`)
- Test: `tests/unit/event-attendees-ticket-rows.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `EventAttendee.kind` becomes `"member" | "guest" | "ticket"`, with `seatId` and `orderId` added (both `null` for the existing arms).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/event-attendees-ticket-rows.test.ts`, driving `listEventAttendees` through its existing `MemberEventDependencies` seam with a scripted `execute`:

```ts
import {describe, expect, it, vi} from "vitest";

import {listEventAttendees} from "@/lib/db/repos/events";

const staff = {kind: "staff" as const, userId: "auth-1", profileId: "p-1"};

function database(rows: readonly unknown[]) {
  return {
    execute: vi.fn(async (query: unknown) => {
      const text = String(query);
      // The first read is the existence probe; everything after it is the union.
      return text.includes("FROM \"events\"") && !text.includes("UNION")
        ? {rows: [{id: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d"}]}
        : {rows};
    }),
  };
}

describe("the door list", () => {
  it("carries ticket seats alongside members and guests, keyed by seat", async () => {
    const rows = await listEventAttendees(staff, "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d", {
      loadDatabase: async () => database([{
        kind: "ticket", profile_id: null, guest_id: null, seat_id: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f",
        order_id: "b1a2c3d4-1111-4222-8333-944455566677", display_name: "Ada Lovelace", email: "ada@example.test",
        organisation: null, status: "paid", checked_in_at: null,
      }]) as never,
    });
    expect(rows).toEqual([{kind: "ticket", profileId: null, guestId: null, seatId: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f", orderId: "b1a2c3d4-1111-4222-8333-944455566677", displayName: "Ada Lovelace", email: "ada@example.test", organisation: null, status: "paid", checkedInAt: null}]);
  });

  it("still validates the member and guest arms after the union widens", async () => {
    await expect(listEventAttendees(staff, "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d", {
      loadDatabase: async () => database([{kind: "nonsense", profile_id: null, guest_id: null, seat_id: null, order_id: null, display_name: "x", email: null, organisation: null, status: "paid", checked_in_at: null}]) as never,
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/event-attendees-ticket-rows.test.ts`
Expected: FAIL —the ticket row is rejected by the `z.enum(["member","guest"])` guard, so the first case throws.

- [ ] **Step 3: Implement**

In `lib/db/repos/events.ts`, widen the type and the guard, and add the union arm:

```ts
export type EventAttendee = Readonly<{
  kind: "member" | "guest" | "ticket";
  profileId: string | null;
  guestId: string | null;
  /** Set only for `kind: "ticket"`: the seat the check-in write addresses. */
  seatId: string | null;
  /** Set only for `kind: "ticket"`. */
  orderId: string | null;
  displayName: string;
  email: string | null;
  organisation: string | null;
  status: string;
  checkedInAt: Date | null;
}>;

const attendeeRowSchema = z.object({
  kind: z.enum(["member", "guest", "ticket"]),
  profile_id: z.string().nullable(),
  guest_id: z.string().nullable(),
  seat_id: z.string().nullable(),
  order_id: z.string().nullable(),
  display_name: z.string(),
  email: z.string().nullable(),
  organisation: z.string().nullable(),
  status: z.string(),
  checked_in_at: z.coerce.date().nullable(),
});
```

The union gains a third arm and the first two emit the new typed NULLs, so all three arms agree column-for-column:

```sql
    SELECT 'member' AS kind, ${eventRegistrations.profileId} AS profile_id, NULL::uuid AS guest_id, NULL::uuid AS seat_id, NULL::uuid AS order_id, ${profiles.displayName} AS display_name, ...
    UNION ALL
    SELECT 'guest', NULL::text, ${eventGuestRegistrations.id}, NULL::uuid, NULL::uuid, ...
    UNION ALL
    -- Only a paid order is on the door list; a refunded order's seats are not
    -- admitted and must not appear here.
    SELECT 'ticket', NULL::text, NULL::uuid, ${eventOrderSeats.id}, ${eventOrders.id}, ${eventOrderSeats.attendeeName}, ${eventOrderSeats.attendeeEmail}, NULL::text, ${eventOrders.status}::text, ${eventOrderSeats.checkedInAt}
    FROM ${eventOrderSeats} JOIN ${eventOrders} ON ${eventOrders.id} = ${eventOrderSeats.orderId}
    WHERE ${eventOrders.eventId} = ${eventId} AND ${eventOrders.status} = 'paid'
    ORDER BY display_name ASC, kind ASC, profile_id ASC NULLS LAST, guest_id ASC NULLS LAST, seat_id ASC NULLS LAST
```

and the mapper returns `seatId: parsed.seat_id, orderId: parsed.order_id`.

Also update the CSV in `lib/admin/event-attendees.ts`: the header already prints `kind`, so it needs no change —verify with a case asserting a ticket row appears with `kind` = `ticket` in `tests/unit/event-attendees-csv.test.ts` if such a test exists, and add the row to the existing test's fixture if it asserts an exact row set.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/event-attendees-ticket-rows.test.ts tests/unit/event-attendees-csv.test.ts tests/unit/event-detail-page.test.tsx && npm run typecheck`
Expected: PASS, typecheck silent. Any existing test constructing an `EventAttendee` literal now needs the two new fields —add `seatId: null, orderId: null` there.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/events.ts lib/admin/event-attendees.ts tests
git commit -m "feat(admin): ticket seats in the event door list"
```

---

### Task 5: The check-in actions and the staff check-in page

**Files:**
- Create: `lib/tickets/check-in-actions.ts`, `app/[locale]/(admin)/admin/check-in/[token]/page.tsx`
- Test: `tests/unit/ticket-check-in-actions.test.ts`, `tests/unit/check-in-page.test.tsx` (create)
- Modify: `lib/admin/event-action-core.ts`, `lib/admin/event-actions.ts`, `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx`, both bundles

**Interfaces:**
- Consumes: `verifyPassToken`/`ticketPassEnv` (Task 1), `ticketCheckInRepository` (Task 2).
- Produces: `submitSeatCheckInAction(previous, formData)`, `submitSeatUndoAction(previous, formData)`; `runSeatCheckInAction` in the action core; the page at `/[locale]/admin/check-in/[token]`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/ticket-check-in-actions.test.ts` asserts:
- the module exports only `submitSeatCheckInAction`, `submitSeatUndoAction` and their state type (the boundary rule —assert by importing the module namespace and comparing `Object.keys` to the allowed set);
- `submitSeatCheckInAction` refuses when there is no staff session, without calling the repository;
- it refuses a `seatId` that is not a uuid without calling the repository;
- it calls `checkInSeat` with the seat id and returns `checked_in`;
- `submitSeatUndoAction` returns `undone` and, for a `not_checked_in` seat, reports it without an error state.

`tests/unit/check-in-page.test.tsx` drives the exported loader and asserts the four states resolve to `"ready" | "already_checked_in" | "not_admissible" | null`, and that `null` (invalid token or inadmissible seat) is what makes the page 404.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/ticket-check-in-actions.test.ts tests/unit/check-in-page.test.tsx`
Expected: FAIL —`Failed to resolve import`.

- [ ] **Step 3: Implement**

Add to `lib/admin/event-action-core.ts`, beside `runCheckInAction`:

```ts
export async function runSeatCheckInAction(
  _state: EventActionState,
  formData: FormData,
  options: SimpleOptions & Readonly<{successMessageAlready: string; successMessageUndone: string; notAdmissibleMessage: string}>,
): Promise<EventActionState> {
  try {
    const outcome = await options.mutate(formData);
    if (outcome === "already_checked_in") return {status: "success", message: options.successMessageAlready};
    if (outcome === "undone") return {status: "success", message: options.successMessageUndone};
    if (outcome === "not_admissible") return {status: "error", message: options.notAdmissibleMessage};
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    return {status: "error", message: options.errorMessage};
  }
}
```

Create `lib/tickets/check-in-actions.ts` —the only exports are the two wrappers and the state type:

```ts
"use server";

import {z} from "zod";

import {runSeatCheckInAction, type EventActionState} from "@/lib/admin/event-action-core";
import {requireAdminActor} from "@/lib/auth/actor";
import {ticketCheckInRepository} from "@/lib/db/repos/ticket-check-in";

export type SeatCheckInState = EventActionState;

const seatInput = z.object({seatId: z.string().uuid()}).strict();
const messages = {
  successMessage: "Checked in.",
  successMessageAlready: "Already checked in.",
  successMessageUndone: "Check-in undone.",
  notAdmissibleMessage: "This seat is not admissible.",
  errorMessage: "Could not update this seat.",
} as const;

/** The token is deliberately NOT re-verified here: the caller is a staff member
 *  whose session was already checked, and the seat's own admissibility is
 *  decided inside the repository under the row lock. */
export async function submitSeatCheckInAction(previous: SeatCheckInState, formData: FormData): Promise<SeatCheckInState> {
  return runSeatCheckInAction(previous, formData, {
    ...messages,
    mutate: async (data) => {
      const input = seatInput.parse({seatId: data.get("seatId")});
      const actor = await requireAdminActor();
      const result = await ticketCheckInRepository.checkInSeat(actor, input);
      return result.disposition;
    },
  });
}

export async function submitSeatUndoAction(previous: SeatCheckInState, formData: FormData): Promise<SeatCheckInState> {
  return runSeatCheckInAction(previous, formData, {
    ...messages,
    mutate: async (data) => {
      const input = seatInput.parse({seatId: data.get("seatId")});
      const actor = await requireAdminActor();
      const result = await ticketCheckInRepository.undoSeatCheckIn(actor, input);
      return result.disposition;
    },
  });
}
```

`runSeatCheckInAction`'s `mutate` returns a string; widen `SimpleOptions["mutate"]`'s return to `Promise<unknown>` (it already is) so the seat actions type-check without changing the existing callers.

Create `app/[locale]/(admin)/admin/check-in/[token]/page.tsx`:

```tsx
import Link from "next/link";
import {notFound} from "next/navigation";

import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {ticketPassEnv} from "@/lib/config/env";
import {ticketCheckInRepository, type PassView} from "@/lib/db/repos/ticket-check-in";
import {submitSeatCheckInAction, submitSeatUndoAction} from "@/lib/tickets/check-in-actions";
import {verifyPassToken, type PassClaims} from "@/lib/tickets/pass-token";
import {localizedPath} from "@/lib/urls";

export type CheckInState = "ready" | "already_checked_in";

/** Exported so the unit test drives the states without a session or a database. */
export function createCheckInLoader(dependencies: Readonly<{
  verify: (token: string) => PassClaims | null;
  passForSeat: (claims: PassClaims) => Promise<PassView | null>;
}>) {
  return async function loadCheckIn(token: string): Promise<Readonly<{state: CheckInState; seat: PassView}> | null> {
    const claims = dependencies.verify(token);
    if (!claims) return null;
    const seat = await dependencies.passForSeat(claims);
    // `passForSeat` already refuses a non-paid, refunded or cancelled seat, so a
    // seat that arrives here is admissible; the two states left are which side
    // of the check-in it is on.
    if (!seat) return null;
    return {state: seat.checkedInAt ? "already_checked_in" : "ready", seat};
  };
}

export default async function CheckInPage({params}: Readonly<{params: Promise<{locale: string; token: string}>}>) {
  const {locale: localeValue, token} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The session check comes BEFORE any seat read, so a non-staff visitor learns nothing.
  await requireAdminPageActor();
  const result = await createCheckInLoader({
    verify: (value) => verifyPassToken(value, ticketPassEnv().ticketPassTokenSecret),
    passForSeat: (claims) => ticketCheckInRepository.passForSeat(claims),
  })(token);
  if (!result || !result.seat) notFound();
  const t = await getTranslations({locale, namespace: "Admin.checkIn"});
  const title = locale === "zh-HK" ? result.seat.eventTitleZh ?? result.seat.eventTitleEn : result.seat.eventTitleEn;
  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{t("seat", {position: result.seat.position})}</p>
      </header>
      <section className="glass-card space-y-4 p-6">
        <p className="text-lg font-medium">{result.seat.attendeeName}</p>
        {result.state === "already_checked_in" ? (
          <>
            <p role="status" className="text-sm text-muted-foreground">{t("alreadyCheckedIn")}</p>
            <form action={submitSeatUndoAction.bind(null, {})}>
              <input name="seatId" type="hidden" value={result.seat.seatId}/>
              <button className="min-h-11 rounded-md border px-4" type="submit">{t("undo")}</button>
            </form>
          </>
        ) : (
          <form action={submitSeatCheckInAction.bind(null, {})}>
            <input name="seatId" type="hidden" value={result.seat.seatId}/>
            <button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground" type="submit">{t("checkIn")}</button>
          </form>
        )}
        <Link className="text-sm underline" href={localizedPath(locale, `/admin/events-mgmt/${result.seat.eventId}`)}>{t("backToEvent")}</Link>
      </section>
    </main>
  );
}
```

Add `Admin.checkIn` to both bundles in parity: `eyebrow`, `seat`, `alreadyCheckedIn`, `checkIn`, `undo`, `backToEvent`.

**The nav question, resolved by evidence rather than assumption:** run `npx vitest run tests/unit/internal-navigation-config.test.ts`, then search for a discovery test that walks the admin route directory:

```bash
rg -l "app.\[locale\].\(admin\)|admin routes" tests/ | head
```

That test asserts the Portal's nav list exactly, and a route absent from the nav does not break it. If a discovery test does demand nav registration, add the route to its allowlist **with the reason** —a deep link reached only by scanning carries a token and must not appear in the nav —rather than adding it to `config/internal-navigation.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/ticket-check-in-actions.test.ts tests/unit/check-in-page.test.tsx tests/unit/server-action-actor-boundary.test.ts tests/unit/internal-navigation-config.test.ts && npm run audit:strings && npm run typecheck`
Expected: PASS, boundary test green, audit clean, typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/tickets/check-in-actions.ts "app/[locale]/(admin)/admin/check-in" lib/admin tests messages
git commit -m "feat(admin): a staff check-in page reached by scanning a pass"
```

---

### Task 6: The pass email, and the receipt becomes a receipt

**Files:**
- Modify: `lib/email/catalog.ts`, `messages/en.json`, `messages/zh-HK.json`, `tests/unit/email-catalog.test.ts`, `tests/unit/email-render-snapshots.test.tsx` (+ snapshot), `lib/billing/ticket-webhook-processor.ts`
- Test: `tests/unit/ticket-pass-email.test.ts` (create)

**Interfaces:**
- Consumes: `signPassToken`/`ticketPassEnv` (Task 1), `eventOrdersRepository.seatsOfOrder`/`orderSeats` (D-4a, plus one new read below), `renderEmail`, `createConfiguredEmailTransport`.
- Produces: the `event_ticket_pass` template; `sendPassEmails`; the receipt gaining `{attendees}`.

- [ ] **Step 1: Update the tests first (RED)**

In `tests/unit/email-catalog.test.ts`, add `event_ticket_pass` to `REQUIRED_TEMPLATE_IDS` and bump the total count in the message by one.
In `tests/unit/email-render-snapshots.test.tsx`, add `event_ticket_pass` to `FIXTURE_VARIABLES` with `{eventTitle, attendeeName, eventDate, venue, ctaUrl}` and add `{attendees}` to the `event_ticket_confirmation` fixture.
Create `tests/unit/ticket-pass-email.test.ts` asserting:
- a `paid` settlement sends one pass email per seat, each to that seat's own address, each with its own pass URL;
- **every variable the pass copy uses is supplied** (assert the keys of the `variables` object the renderer received), because the `catch` would otherwise swallow the throw and no other test could see it;
- a `refund_due` or `oversold` settlement sends no pass email;
- a redelivery sends no second pass email (same settlement instant), while `resendPass` does send.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/email-catalog.test.ts tests/unit/ticket-pass-email.test.ts`
Expected: FAIL —the template id does not exist.

- [ ] **Step 3: Implement**

Add `event_ticket_pass` to `EMAIL_TEMPLATE_IDS` and `DEFAULT_CLASSIFICATION` (`"transactional"`) in `lib/email/catalog.ts`, and the copy to both bundles under `Email.templates`:

```json
"event_ticket_pass": {
  "subject": "Your pass for {eventTitle}",
  "preview": "Your personal entry pass, {attendeeName}.",
  "heading": "Your pass, {attendeeName}",
  "body": "Show this email's pass at the door for {eventTitle} on {eventDate} at {venue}. Each pass admits one person, so please do not forward it.",
  "cta": "Open your pass"
}
```

```json
"event_ticket_pass": {
  "subject": "{eventTitle} 的門票",
  "preview": "{attendeeName} 的專屬入場門票。",
  "heading": "{attendeeName}，這是你的門票",
  "body": "請於活動當日在入口出示此門票。活動：{eventTitle}，日期：{eventDate}，地點：{venue}。每張門票只限一人入場，請勿轉發。",
  "cta": "開啟門票"
}
```

The receipt `event_ticket_confirmation` body gains the attendee list and the (now true) pass sentence:

```json
"body": "Thank you. We received HK${amount} for {seatCount} seat(s): {attendees}. The event is on {eventDate}. Each attendee will receive their own pass in a separate email."
```

```json
"body": "多謝支持。我們已收到 HK${amount}，共 {seatCount} 個座位：{attendees}。活動日期為 {eventDate}。每位出席者將另函收到專屬門票。"
```

In `lib/billing/ticket-webhook-processor.ts`, add the pass send. The processor needs each seat's id, so `lib/db/repos/event-orders.ts` gains one read with its own SQL:

```ts
    /** Each seat of an order, in position order, for the per-attendee passes. */
    async orderSeats(orderId: string): Promise<readonly {seatId: string; position: number}[]> {
      return runTransaction((tx) => tx.orderSeats(orderId));
    },
```

```ts
    orderSeats: async (orderId) => rows<{seatId: string; position: number}>(await tx.execute(sql`
      SELECT id AS "seatId", position FROM ${eventOrderSeats} WHERE order_id = ${orderId} ORDER BY position ASC
    `)),
```

with the matching member on `EventOrdersTransaction`:

```ts
  orderSeats: (orderId: string) => Promise<readonly Readonly<{seatId: string; position: number}>[]>;
```

Then the send itself, which Task 7's resend also calls, so both paths send the identical email:

```ts
    /** One pass per seat. The key carries the settlement instant: identical on a
     *  redelivery (so nothing is re-sent) and different on a deliberate resend. */
    async function sendPassEmails(order: OrderRecord): Promise<void> {
      const seats = await dependencies.orders.orderSeats(order.id);
      const settlement = order.paidAt?.getTime() ?? 0;
      for (const seat of seats) {
        await sendSeatPass(dependencies, {seatId: seat.seatId, attemptKey: String(settlement)});
      }
    }
```

Define `sendSeatPass` immediately above `createTicketProcessor` (its exact body is in Task 7 Step 1, which is where the resend consumes it too). `sendTicketEmail` gains an optional fourth parameter:

```ts
  overrides: Readonly<{attendeeName?: string; to?: string; ctaUrl?: string; idempotencyKey?: string}> = {},
```

which replaces `to`, the CTA and the key when supplied, and `TicketProcessorDependencies` gains `passSecret: string`, wired in the route to `ticketPassEnv().ticketPassTokenSecret`. Call `sendPassEmails(order)` only on the `paid` branch, after the receipt.

- [ ] **Step 4: Update the snapshot and run the tests**

Run: `npx vitest run tests/unit/email-render-snapshots.test.tsx -u && npx vitest run tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/ticket-pass-email.test.ts tests/unit/ticket-webhook.test.ts && npm run audit:strings`
Expected: the snapshot gains exactly the new template in both locales and the receipt bodies change; read the diff before committing, then PASS and audit clean.

- [ ] **Step 5: Commit**

```bash
git add lib/email lib/billing lib/db/repos/event-orders.ts messages tests
git commit -m "feat(email): a pass per attendee, and a receipt that names them"
```

---

### Task 7: Resend pass, the guarded seed, and the acceptance walk

**Files:**
- Create: `scripts/seed-d4b.ts`, `tests/e2e/phase-d4b-passes-and-check-in.spec.ts`
- Modify: `package.json` (`db:seed:d4b`), `components/admin/attendee-table.tsx`, `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx`, `lib/admin/event-actions.ts`, both bundles

**Interfaces:**
- Consumes: everything above; `assertIsolatedSeedEnvironment` from `scripts/lib/acceptance-guard.ts`.
- Produces: the `db:seed:d4b` script and the gated walk.

- [ ] **Step 1: Implement Resend pass**

The webhook and the resend must send the identical email, so the send lives in one exported function in `lib/billing/ticket-webhook-processor.ts` and both call it:

```ts
/**
 * One seat's pass, with the attempt key supplied by the caller: the webhook
 * passes the settlement instant (so a redelivery is a no-op) and the staff
 * resend passes a fresh attempt (so a deliberate resend is never suppressed).
 *
 * The seat id is the only input: the order and the event are resolved here, so
 * a caller cannot pair a seat with the wrong order.
 */
export async function sendSeatPass(
  dependencies: TicketProcessorDependencies,
  input: Readonly<{seatId: string; attemptKey: string}>,
): Promise<void> {
  const seat = await dependencies.orders.seatForPass(input.seatId);
  // `seatForPass` returns null for a seat whose order is not `paid`, which is
  // the same refusal the pass page makes; nothing is sent for a refunded seat.
  if (!seat) return;
  const event = await dependencies.orders.eventSummary(seat.eventId, seat.buyerLocale);
  const passUrl = `${dependencies.appUrl}${localizedPath(seat.buyerLocale, `/pass/${signPassToken({seatId: seat.seatId, eventId: seat.eventId}, dependencies.passSecret)}`)}`;
  await sendTicketEmail(dependencies, "event_ticket_pass", seat.order, event, {
    attendeeName: seat.attendeeName,
    to: seat.attendeeEmail,
    ctaUrl: passUrl,
    idempotencyKey: `ticket-pass:${seat.seatId}:${input.attemptKey}`,
  });
}
```

Add `seatForPass(seatId)` to `lib/db/repos/event-orders.ts` returning `{seatId, attendeeName, attendeeEmail, eventId, buyerLocale, order} | null` and returning `null` unless the order's status is `paid`:

```ts
    /** One seat with its order, for a single pass. `null` unless the order is paid. */
    async seatForPass(seatId: string): Promise<Readonly<{seatId: string; attendeeName: string; attendeeEmail: string; eventId: string; buyerLocale: "en" | "zh-HK"; order: OrderRecord}> | null> {
      return runTransaction((tx) => tx.seatForPass(seatId));
    },
```

```ts
    seatForPass: async (seatId) => (await tx.execute<OrderRecord & {seatId: string; attendeeName: string; attendeeEmail: string; eventId: string; buyerLocale: "en" | "zh-HK"}>(sql`
      SELECT s.id AS "seatId", s.attendee_name AS "attendeeName", s.attendee_email AS "attendeeEmail",
             o.event_id AS "eventId", o.buyer_locale AS "buyerLocale",
             o.id, o.event_id, o.buyer_profile_id, o.buyer_name, o.buyer_email, o.amount_hkd_cents,
             o.currency, o.status, o.stripe_checkout_session_id, o.stripe_checkout_url, o.idempotency_key,
             o.expires_at, o.paid_at, o.refunded_at, o.refund_reason
      FROM ${eventOrderSeats} s JOIN ${eventOrders} o ON o.id = s.order_id
      WHERE s.id = ${seatId} AND o.status = 'paid' LIMIT 1
    `)).rows[0] ?? null,
```

The row's snake_case order columns still need `orderFrom` folding; reuse the existing helper rather than mapping twice.

Export a lazily-built production dependency bag from the processor module so the action can reuse it (`buildTicketProcessor` stays as it is; this is only its dependency object):

```ts
let defaultDependencies: TicketProcessorDependencies | undefined;

/** The production dependency bag, built on first use so no env is read at import. */
export function ticketProcessorDependencies(): TicketProcessorDependencies {
  defaultDependencies ??= {
    orders: eventOrdersRepository,
    refundPaymentIntent: (paymentIntentId, idempotencyKey) => stripeBillingAdapter().refundPaymentIntent(paymentIntentId, idempotencyKey),
    email: {renderEmail, transport: createConfiguredEmailTransport(), emailFrom: emailEnv().emailFrom},
    appUrl: appEnv().appUrl,
    passSecret: ticketPassEnv().ticketPassTokenSecret,
    now: () => new Date(),
    onEmailError(error, context) { console.error("ticket email failed", context, error); },
  };
  return defaultDependencies;
}
```

Then in `lib/admin/event-actions.ts`, add the bound action:

```ts
export async function resendPassAction(seatId: string, path: string, messages: CheckInActionMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  return runCheckInAction(state, formData, {...messages, mutate: async (data) => {
    await requireAdminActor();
    const fromForm = data.get("seatId");
    const parsed = z.object({seatId: z.string().uuid()}).strict().parse({seatId: typeof fromForm === "string" && fromForm.length > 0 ? fromForm : seatId});
    await sendSeatPass(ticketProcessorDependencies(), {seatId: parsed.seatId, attemptKey: `resend:${Date.now()}`});
  }});
}
```

Add the control to `components/admin/attendee-table.tsx`, rendered only for `row.kind === "ticket"`:

```tsx
{row.kind === "ticket" ? (
  <form action={resendPass.bind(null, row.seatId ?? "")}>
    <input name="seatId" type="hidden" value={row.seatId ?? ""}/>
    <button className="text-sm underline" type="submit">{labels.resendPass}</button>
  </form>
) : null}
```

- [ ] **Step 2: Write the guarded seed**

Create `scripts/seed-d4b.ts`, mirroring `scripts/seed-m6.ts` — the guard first, before any connection is opened:

```ts
import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";

export const D4B_ACCEPTANCE_SEED_ENV = "D4B_ACCEPTANCE_SEED";
export const D4B_ACCEPTANCE_OWNERSHIP_KEY = "d4b-passes-acceptance-v1";
export const D4B_EVENT_SLUG = "d4b-acceptance-ticket-event";
export const D4B_SEAT_IDS = ["d4b00000-0000-4000-8000-000000000001", "d4b00000-0000-4000-8000-000000000002"] as const;

export function requireD4bSeedEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  assertIsolatedSeedEnvironment({
    prefix: "D4B_ACCEPTANCE",
    flag: D4B_ACCEPTANCE_SEED_ENV,
    hostAllowlistVar: "D4B_ACCEPTANCE_DATABASE_HOST_ALLOWLIST",
    environment,
  });
}
```

Then, after the guard passes, take `pg_advisory_xact_lock(hashtext(D4B_ACCEPTANCE_OWNERSHIP_KEY))` and upsert, in one transaction:

- one event: slug `D4B_EVENT_SLUG`, `registration_mode = 'ticketed'`, `ticket_price_hkd_cents = 25000`, `status = 'published'`, `visibility = 'public'`, `starts_at` 30 days ahead;
- one order: stable id, `status = 'paid'`, `paid_at = NOW()`, `buyer_locale = 'en'`, `amount_hkd_cents = 50000`, idempotency key `d4b-acceptance-order`, FK to that event;
- two seats with the stable ids above, positions 1 and 2, named `D4B Acceptance One`/`d4b-one@example.test` and `D4B Acceptance Two`/`d4b-two@example.test`, both `checked_in_at = NULL`.

Every statement is an upsert on a stable key (`ON CONFLICT (id) DO UPDATE`), so a second run creates no duplicates, and the seed **throws** `D4B_ACCEPTANCE_ORDER_NOT_PAID` if it finds its order in any other status, rather than silently reusing it.

Add to `package.json`:

```json
"db:seed:d4b": "node --experimental-strip-types scripts/seed-d4b.ts"
```

- [ ] **Step 3: Write the acceptance walk**

Create `tests/e2e/phase-d4b-passes-and-check-in.spec.ts`, gated exactly like `phase-b1-member-events.spec.ts`:

```ts
import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = missingM2LiveEnvironment();
const d4bMissing = missing.length > 0 || process.env.D4B_ACCEPTANCE_SEED !== "true"
  ? [...missing, "D4B_ACCEPTANCE_SEED=true"]
  : [];

test.describe("phase D-4b passes and check-in", () => {
  test.skip(d4bMissing.length > 0, `Requires ${d4bMissing.join(", ")}`);

  test("a pass renders, admits once, and is undone", async ({browser}) => {
    // 1. The door list shows both seeded seats as ticket rows.
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await signInForM2(staffPage, "staff");
    await staffPage.goto("/admin/events-mgmt");
    await staffPage.getByRole("link", {name: /d4b/i}).first().click();
    await expect(staffPage.getByRole("cell", {name: "D4B Acceptance One"})).toBeVisible();

    // 2. The pass page renders the attendee, the event and a QR, signed out.
    const passUrl = process.env.D4B_PASS_URL_ONE!;
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(passUrl);
    await expect(guestPage.getByText("D4B Acceptance One")).toBeVisible();
    await expect(guestPage.locator("svg")).toHaveCount(1);

    // 3. Staff open the check-in URL from the QR and admit the seat.
    await staffPage.goto(process.env.D4B_CHECK_IN_URL_ONE!);
    await staffPage.getByRole("button", {name: /check in/i}).click();
    await expect(staffPage.getByRole("status")).toContainText(/already checked in/i);

    // 4. Undo restores the seat to admissible.
    await staffPage.getByRole("button", {name: /undo/i}).click();
    await expect(staffPage.getByRole("button", {name: /check in/i})).toBeVisible();

    await staffContext.close();
    await guestContext.close();
  });
});
```

`D4B_PASS_URL_ONE`/`D4B_CHECK_IN_URL_ONE` are printed by the seed at the end of its run (the seed knows the token because it holds the same secret), so the walk never has to re-derive a token — and they are read from the environment rather than hardcoded.

- [ ] **Step 4: Run the full gate**

Run: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green. The walk's cases SKIP in this environment (no isolated database and no `D4B_ACCEPTANCE_SEED`), and the run must say so explicitly rather than reporting a pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-d4b.ts tests/e2e/phase-d4b-passes-and-check-in.spec.ts package.json components/admin/attendee-table.tsx "app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx" lib/admin messages
git commit -m "feat(admin): resend a pass, and prove the door end to end"
```

---

## Verification checklist

Against the spec's 禮10:

| # | Done when | Task |
|---|---|---|
| 1 | Staff admit a paid seat by scanning its pass, and the second scan reports already checked in | 2, 5, 7 |
| 2 | Staff can undo a check-in, and the audit trail records both the check-in and the reversal | 2, 5 |
| 3 | Each attendee can open their own pass from their email and see a scannable QR, in their language | 1, 3, 6 |
| 4 | A refunded or unpaid order's passes are refused by both views and absent from the door list | 2, 4 |
| 5 | The five gate commands are green, with no migration | 7 |

Not in scope: staff refunds, automatic refunds on cancellation, the refund-policy page (D-4c), an in-browser camera scanner, offline check-in, seat transfers, per-pass expiry or a revocation list.

