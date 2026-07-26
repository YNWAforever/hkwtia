import "server-only";

import {sql} from "drizzle-orm";

import type {JourneyChannel, MessageClassification} from "@/lib/automation/types";
import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {emailLog, whatsappLog} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader, AutomationSqlExecutor} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";

export type DeliveryStatus = "processing" | "sent" | "failed";
export type DeliveryRecord = Readonly<{
  id: string;
  channel: JourneyChannel;
  profileId: string | null;
  journeyStateId: string | null;
  template: string;
  status: DeliveryStatus;
  providerId: string | null;
  idempotencyKey: string;
  locale: string;
  classification: MessageClassification;
  attemptCount: number;
  errorCode: string | null;
  createdAt: Date | null;
}>;
export type DeliveryReservation = Readonly<{record: DeliveryRecord; disposition: "created" | "existing"}>;

type DeliveryBaseInput = Readonly<{
  profileId: string | null;
  journeyStateId: string | null;
  template: string;
  idempotencyKey: string;
  locale: string;
  classification: MessageClassification;
}>;
export type EmailReservationInput = DeliveryBaseInput & Readonly<{subject: string}>;
export type WhatsappReservationInput = DeliveryBaseInput;
export type DeliveryCompletion =
  | Readonly<{status: "sent"; providerId: string; errorCode?: never}>
  | Readonly<{status: "failed"; errorCode: string; providerId?: string | null}>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function recordFrom(channel: JourneyChannel, row: Record<string, unknown>): DeliveryRecord {
  return {
    id: String(row.id),
    channel,
    profileId: row.profile_id === null || row.profile_id === undefined ? null : String(row.profile_id),
    journeyStateId: row.journey_state_id === null || row.journey_state_id === undefined ? null : String(row.journey_state_id),
    template: String(row.template ?? ""),
    status: String(row.status) as DeliveryStatus,
    providerId: row.provider_id === null || row.provider_id === undefined ? null : String(row.provider_id),
    idempotencyKey: String(row.idempotency_key ?? ""),
    locale: String(row.locale ?? ""),
    classification: String(row.classification ?? "transactional") as MessageClassification,
    attemptCount: Number(row.attempt_count ?? 0),
    errorCode: row.error_code === null || row.error_code === undefined ? null : String(row.error_code),
    createdAt: row.created_at === null || row.created_at === undefined
      ? null
      : row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  };
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function deliveryTable(channel: JourneyChannel) {
  return channel === "email" ? emailLog : whatsappLog;
}

async function existingReservation(
  transaction: AutomationSqlExecutor,
  channel: JourneyChannel,
  idempotencyKey: string,
): Promise<DeliveryRecord> {
  const table = deliveryTable(channel);
  const row = rowsFrom(await transaction.execute(sql`
    SELECT * FROM ${table} WHERE idempotency_key = ${idempotencyKey} LIMIT 1
  `))[0];
  if (!row) throw new Error("DELIVERY_RESERVATION_FAILED");
  return recordFrom(channel, row);
}

async function retryFailedDelivery(
  transaction: AutomationSqlExecutor,
  channel: JourneyChannel,
  id: string,
  expectedErrorCode: string,
): Promise<DeliveryRecord> {
  const table = deliveryTable(channel);
  const row = rowsFrom(await transaction.execute(sql`
    UPDATE ${table}
    SET status = 'processing',
        provider_id = NULL,
        error_code = NULL,
        attempt_count = attempt_count + 1
    WHERE id = ${id}
      AND status = 'failed'
      AND error_code = ${expectedErrorCode}
    RETURNING *
  `))[0];
  if (!row) throw new Error("INVALID_DELIVERY_RETRY");
  return recordFrom(channel, row);
}

async function reserveExisting(
  transaction: AutomationSqlExecutor,
  channel: JourneyChannel,
  idempotencyKey: string,
): Promise<DeliveryReservation> {
  return {
    record: await existingReservation(transaction, channel, idempotencyKey),
    disposition: "existing",
  };
}

function completionMatches(record: DeliveryRecord, completion: DeliveryCompletion): boolean {
  if (record.status !== completion.status) return false;
  if (completion.status === "sent") return record.providerId === completion.providerId;
  return record.errorCode === completion.errorCode
    && record.providerId === (completion.providerId ?? null);
}

async function completeReservedDelivery(
  database: AutomationSqlExecutor,
  channel: JourneyChannel,
  id: string,
  completion: DeliveryCompletion,
): Promise<DeliveryRecord> {
  const table = deliveryTable(channel);
  const updated = rowsFrom(await database.execute(sql`
    UPDATE ${table}
    SET status = ${completion.status},
        provider_id = ${completion.providerId ?? null},
        error_code = ${completion.status === "failed" ? completion.errorCode : null}
    WHERE id = ${id} AND status = 'processing'
    RETURNING *
  `))[0];
  if (updated) return recordFrom(channel, updated);

  const existing = rowsFrom(await database.execute(sql`
    SELECT * FROM ${table} WHERE id = ${id} LIMIT 1
  `))[0];
  if (existing) {
    const record = recordFrom(channel, existing);
    if (completionMatches(record, completion)) return record;
  }
  throw new Error("INVALID_DELIVERY_TRANSITION");
}

export function createDeliveriesRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    async reserveEmail(actor: AutomationRepositoryActor, input: EmailReservationInput): Promise<DeliveryReservation> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        INSERT INTO ${emailLog}
          (profile_id, journey_state_id, template, subject, status, idempotency_key, locale, classification, attempt_count)
        VALUES (
          ${input.profileId}, ${input.journeyStateId}, ${input.template}, ${input.subject}, 'processing',
          ${input.idempotencyKey}, ${input.locale}, ${input.classification}, 1
        )
        ON CONFLICT DO NOTHING
        RETURNING *
      `);
      const created = rowsFrom(result)[0];
      if (created) return {record: recordFrom("email", created), disposition: "created"};
      return reserveExisting(database, "email", input.idempotencyKey);
    },

    async retryEmailFailure(
      actor: AutomationRepositoryActor,
      id: string,
      expectedErrorCode: string,
    ): Promise<DeliveryRecord> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return retryFailedDelivery(database, "email", id, expectedErrorCode);
    },

    async completeEmail(actor: AutomationRepositoryActor, id: string, completion: DeliveryCompletion): Promise<DeliveryRecord> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return completeReservedDelivery(database, "email", id, completion);
    },

    async reserveWhatsapp(actor: AutomationRepositoryActor, input: WhatsappReservationInput): Promise<DeliveryReservation> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        INSERT INTO ${whatsappLog}
          (profile_id, journey_state_id, template, status, idempotency_key, locale, classification, attempt_count)
        VALUES (
          ${input.profileId}, ${input.journeyStateId}, ${input.template}, 'processing',
          ${input.idempotencyKey}, ${input.locale}, ${input.classification}, 1
        )
        ON CONFLICT DO NOTHING
        RETURNING *
      `);
      const created = rowsFrom(result)[0];
      if (created) return {record: recordFrom("whatsapp", created), disposition: "created"};
      return reserveExisting(database, "whatsapp", input.idempotencyKey);
    },

    async retryWhatsappFailure(
      actor: AutomationRepositoryActor,
      id: string,
      expectedErrorCode: string,
    ): Promise<DeliveryRecord> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return retryFailedDelivery(database, "whatsapp", id, expectedErrorCode);
    },

    async completeWhatsapp(actor: AutomationRepositoryActor, id: string, completion: DeliveryCompletion): Promise<DeliveryRecord> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return completeReservedDelivery(database, "whatsapp", id, completion);
    },
  };
}

export type DeliveriesRepository = ReturnType<typeof createDeliveriesRepository>;
export const deliveriesRepository = createDeliveriesRepository();
export const deliveriesRepo = deliveriesRepository;
export const deliveries = deliveriesRepository;
