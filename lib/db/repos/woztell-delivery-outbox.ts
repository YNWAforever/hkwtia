import "server-only";

import {sql} from "drizzle-orm";

import {getDb} from "@/lib/db/repos/common";
import {messages} from "@/lib/db/server-schema";

export type WoztellDeliveryKind = "session" | "template";
export type WoztellDeliveryState =
  | "reserved"
  | "retryable"
  | "accepted"
  | "uncertain"
  | "blocked"
  | "skipped";

export type WoztellDeliveryStateSnapshot = Readonly<{
  state: WoztellDeliveryState;
  providerId: string | null;
}>;

export type WoztellDeliveryDecision =
  | Readonly<{status: "send"}>
  | Readonly<{status: "sent"; providerId: string}>
  | Readonly<{status: "uncertain"}>
  | Readonly<{status: "blocked"}>
  | Readonly<{status: "skipped"}>;

export type WoztellDeliveryReservation = WoztellDeliveryDecision & Readonly<{
  deliveryId: string;
}>;

export type WoztellDeliveryReservationInput = Readonly<{
  providerMessageId: string;
  kind: WoztellDeliveryKind;
  idempotencyKey: string;
}>;

type DeliveryRecord = Readonly<{
  idempotencyKey: string;
  state: WoztellDeliveryState;
  providerId: string | null;
}>;

type SqlExecutor = Readonly<{
  execute(query: unknown): Promise<unknown>;
}>;

type DeliveryDatabase = SqlExecutor & Readonly<{
  transaction<T>(callback: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
}>;

export type WoztellDeliveryDatabaseLoader = () => Promise<DeliveryDatabase>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function metadataFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fieldFor(kind: WoztellDeliveryKind): string {
  return kind === "session"
    ? "woztellSessionDelivery"
    : "woztellTemplateDelivery";
}

function deliveryRecord(
  metadata: Record<string, unknown>,
  kind: WoztellDeliveryKind,
): DeliveryRecord | null {
  const value = metadata[fieldFor(kind)];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const state = record.state;
  if (
    state !== "reserved"
    && state !== "retryable"
    && state !== "accepted"
    && state !== "uncertain"
    && state !== "blocked"
    && state !== "skipped"
  ) {
    return null;
  }
  if (typeof record.idempotencyKey !== "string") return null;
  return {
    idempotencyKey: record.idempotencyKey,
    state,
    providerId: typeof record.providerId === "string"
      ? record.providerId
      : null,
  };
}

function deliveryId(input: WoztellDeliveryReservationInput): string {
  return JSON.stringify([
    input.providerMessageId,
    input.kind,
    input.idempotencyKey,
  ]);
}

function deliveryInputFromId(value: string): WoztellDeliveryReservationInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("INVALID_WOZTELL_DELIVERY_ID");
  }
  if (
    !Array.isArray(parsed)
    || parsed.length !== 3
    || typeof parsed[0] !== "string"
    || (parsed[1] !== "session" && parsed[1] !== "template")
    || typeof parsed[2] !== "string"
  ) {
    throw new Error("INVALID_WOZTELL_DELIVERY_ID");
  }
  return {
    providerMessageId: parsed[0],
    kind: parsed[1],
    idempotencyKey: parsed[2],
  };
}

function serializedRecord(
  input: WoztellDeliveryReservationInput,
  state: WoztellDeliveryState,
  providerId: string | null,
): string {
  return JSON.stringify({
    [fieldFor(input.kind)]: {
      idempotencyKey: input.idempotencyKey,
      state,
      providerId,
    },
  });
}

export function decideWoztellDeliveryReservation(
  record: WoztellDeliveryStateSnapshot | null,
): WoztellDeliveryDecision {
  if (record === null || record.state === "retryable") {
    return {status: "send"};
  }
  if (record.state === "accepted" && record.providerId) {
    return {status: "sent", providerId: record.providerId};
  }
  if (record.state === "blocked") return {status: "blocked"};
  if (record.state === "skipped") return {status: "skipped"};
  return {status: "uncertain"};
}

async function defaultDatabaseLoader(): Promise<DeliveryDatabase> {
  return await getDb() as unknown as DeliveryDatabase;
}

export function createWoztellDeliveryOutboxRepository(
  loadDatabase: WoztellDeliveryDatabaseLoader = defaultDatabaseLoader,
) {
  async function transition(
    encodedDeliveryId: string,
    state: Exclude<WoztellDeliveryState, "reserved">,
    providerId: string | null = null,
  ): Promise<void> {
    const input = deliveryInputFromId(encodedDeliveryId);
    const field = fieldFor(input.kind);
    const database = await loadDatabase();
    const updated = rowsFrom(await database.execute(sql`
      UPDATE ${messages}
      SET metadata = metadata || ${serializedRecord(
        input,
        state,
        providerId,
      )}::jsonb
      WHERE ${messages.providerMessageId} = ${input.providerMessageId}
        AND ${messages.metadata}->${field}->>'idempotencyKey'
          = ${input.idempotencyKey}
        AND ${messages.metadata}->${field}->>'state' = 'reserved'
      RETURNING ${messages.id} AS id
    `))[0];
    if (!updated) throw new Error("INVALID_WOZTELL_DELIVERY_TRANSITION");
  }

  return {
    async reserveDelivery(
      input: WoztellDeliveryReservationInput,
    ): Promise<WoztellDeliveryReservation> {
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${input.idempotencyKey}, 0)
          )
        `);
        const row = rowsFrom(await transaction.execute(sql`
          SELECT ${messages.metadata} AS metadata
          FROM ${messages}
          WHERE ${messages.providerMessageId} = ${input.providerMessageId}
          LIMIT 1
          FOR UPDATE
        `))[0];
        if (!row) throw new Error("WOZTELL_DELIVERY_INBOUND_NOT_FOUND");
        const current = deliveryRecord(metadataFrom(row.metadata), input.kind);
        const encodedDeliveryId = deliveryId(input);
        if (current && current.idempotencyKey !== input.idempotencyKey) {
          return {status: "uncertain", deliveryId: encodedDeliveryId};
        }
        const decision = decideWoztellDeliveryReservation(current);
        if (decision.status === "send") {
          await transaction.execute(sql`
            UPDATE ${messages}
            SET metadata = metadata || ${serializedRecord(
              input,
              "reserved",
              null,
            )}::jsonb
            WHERE ${messages.providerMessageId} = ${input.providerMessageId}
          `);
        } else if (current?.state === "reserved") {
          await transaction.execute(sql`
            UPDATE ${messages}
            SET metadata = metadata || ${serializedRecord(
              input,
              "uncertain",
              null,
            )}::jsonb
            WHERE ${messages.providerMessageId} = ${input.providerMessageId}
          `);
        }
        return {...decision, deliveryId: encodedDeliveryId};
      });
    },

    markDeliverySent(deliveryIdValue: string, providerId: string) {
      return transition(deliveryIdValue, "accepted", providerId);
    },

    markDeliveryRetryable(deliveryIdValue: string) {
      return transition(deliveryIdValue, "retryable");
    },

    markDeliveryUncertain(deliveryIdValue: string) {
      return transition(deliveryIdValue, "uncertain");
    },

    markDeliveryBlocked(deliveryIdValue: string) {
      return transition(deliveryIdValue, "blocked");
    },

    markDeliverySkipped(deliveryIdValue: string) {
      return transition(deliveryIdValue, "skipped");
    },
  };
}
