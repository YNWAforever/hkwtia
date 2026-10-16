import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {requireAdmin} from "@/lib/auth/authorize";
import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {
  auditEvents,
  whatsappTemplates,
  type WhatsAppTemplateCategory,
  type WhatsAppTemplateStatus,
} from "@/lib/db/server-schema";
import {forbidden, type Actor} from "@/lib/membership/lifecycle";

/**
 * Programme C-7. The WhatsApp template registry: "approved" stops being an
 * environment variable an operator can edit in a Vercel dashboard and becomes a
 * row a named admin approved on a date, with the reason a rejection carries.
 *
 * Two doors, deliberately, for the same reason `lib/db/repos/message-eligibility.ts`
 * has two: `/admin/templates` is a session principal that `requireAdmin` can
 * check, and the send gate (`lib/whatsapp/approved-templates.ts`) is called from
 * the webhook, the journey runner and an admin page alike, none of which can
 * hand this repository a staff actor for a read that decides only "may this key
 * be sent at all". Widening the admin door to cover the gate would make the gate
 * forgeable from a `"use server"` boundary; widening the gate to cover the
 * admin door would publish the reviewer's identity and every rejection reason.
 */

/**
 * Phase C1's S-14 rule, applied: every new repository this phase adds takes a
 * capability actor that only server code can mint. The `unique symbol` is what
 * makes it a gate rather than a claim — a hand-rolled `{kind: "template-registry"}`
 * cannot carry it, and `tests/unit/whatsapp-template-registry.test.ts` pins that.
 */
const templateRegistryCapability: unique symbol = Symbol("template-registry-capability");

export type TemplateRegistryActor = Readonly<{
  kind: "template-registry";
  userId: null;
  [templateRegistryCapability]: true;
}>;

export function templateRegistryActor(): TemplateRegistryActor {
  return Object.freeze({
    kind: "template-registry",
    userId: null,
    [templateRegistryCapability]: true as const,
  });
}

/**
 * The send gate's principal, or an automation cron actor — the journey runner
 * builds its dependency bag inside `runProductionJourneys`, which already holds
 * one. Both are minted by server code; neither is an `Actor` a session could
 * produce, which is why a member and an admin are both refused here.
 */
function requireTemplateRegistryReader(
  actor: TemplateRegistryActor | AutomationRepositoryActor,
): void {
  const candidate = actor as Partial<TemplateRegistryActor>;
  if (candidate?.kind === "template-registry") {
    if (candidate[templateRegistryCapability] !== true) forbidden();
    return;
  }
  requireAutomationSystem(actor as AutomationRepositoryActor);
}

/**
 * Every parse happens BEFORE `loadDatabase()`. `templateKeySchema` is the
 * config's key set rather than `z.string()` on purpose: the registry is
 * reference data, but the `as const` in `config/whatsapp-templates.ts` is what
 * types every send call site, so a row naming a key no call site can produce is
 * a row no admin control may act on.
 */
const templateKeySchema = z.enum(
  Object.keys(WHATSAPP_TEMPLATES) as [WhatsAppTemplateKey, ...WhatsAppTemplateKey[]],
);
const templateStatusSchema = z.enum(["pending", "approved", "rejected", "disabled"]);
// `z.record` with an enum key already refuses an unknown key (there is no
// `.strict()` on ZodRecord in zod 3), so this is the whole allowlist: a preview
// is staff-authored copy for two locales and nothing else.
const previewsSchema = z.record(z.enum(["en", "zh-HK"]), z.string().trim().max(2_000));
const rejectionReasonSchema = z.string().trim().min(1).max(1_000).nullable();

export type WhatsAppTemplateRecord = Readonly<{
  key: WhatsAppTemplateKey;
  elementName: string;
  languageCode: string;
  category: WhatsAppTemplateCategory;
  variables: readonly string[];
  previews: Readonly<Record<string, string>>;
  status: WhatsAppTemplateStatus;
  approvedAt: Date | null;
  reviewedByProfileId: string | null;
  rejectionReason: string | null;
}>;

export type WhatsAppTemplateApproval = Readonly<{
  keys: ReadonlySet<WhatsAppTemplateKey>;
  /**
   * The registry has no rows at all — which is NOT the same answer as "nothing
   * is approved". Empty hands the gate back to `WOZTELL_APPROVED_TEMPLATE_KEYS`
   * for one deploy; nothing approved sends nothing.
   */
  empty: boolean;
}>;

/** The narrow face the send gate depends on, so it never sees the admin door. */
export type WhatsAppTemplateRegistryReader = Readonly<{
  approved: (
    actor: TemplateRegistryActor | AutomationRepositoryActor,
  ) => Promise<WhatsAppTemplateApproval>;
}>;

const templateRowSchema = z.object({
  key: z.string(),
  element_name: z.string(),
  language_code: z.string(),
  category: z.enum(["marketing", "utility", "authentication"]),
  variables: z.array(z.string()).nullable().transform((value) => value ?? []),
  previews: z.record(z.string(), z.string()).nullable().transform((value) => value ?? {}),
  status: templateStatusSchema,
  approved_at: z.coerce.date().nullable(),
  reviewed_by_profile_id: z.string().nullable(),
  rejection_reason: z.string().nullable(),
});

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function configured(key: string): key is WhatsAppTemplateKey {
  return Object.hasOwn(WHATSAPP_TEMPLATES, key);
}

/**
 * Rows outside the config are dropped rather than rendered. A control that
 * offers an action `templateKeySchema` would refuse is a control that lies, and
 * the registry is reference data that outlives a key the code has retired.
 */
function toRecord(row: Record<string, unknown>): WhatsAppTemplateRecord | null {
  const parsed = templateRowSchema.parse(row);
  if (!configured(parsed.key)) return null;
  return {
    key: parsed.key,
    elementName: parsed.element_name,
    languageCode: parsed.language_code,
    category: parsed.category,
    variables: parsed.variables,
    previews: parsed.previews,
    status: parsed.status,
    approvedAt: parsed.approved_at,
    reviewedByProfileId: parsed.reviewed_by_profile_id,
    rejectionReason: parsed.rejection_reason,
  };
}

function requireRecord(result: unknown): WhatsAppTemplateRecord {
  const row = rowsFrom(result)[0];
  if (!row) throw new Error("WHATSAPP_TEMPLATE_NOT_FOUND");
  const record = toRecord(row);
  if (!record) throw new Error("WHATSAPP_TEMPLATE_NOT_FOUND");
  return record;
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createWhatsAppTemplatesRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    /** Staff. The whole registry, newest decision last, for `/admin/templates`. */
    async list(actor: Actor): Promise<readonly WhatsAppTemplateRecord[]> {
      requireAdmin(actor);
      const database = await loadDatabase();
      return rowsFrom(await database.execute(sql`
        SELECT * FROM ${whatsappTemplates} ORDER BY ${whatsappTemplates.category}, ${whatsappTemplates.key}
      `))
        .map(toRecord)
        .filter((record): record is WhatsAppTemplateRecord => record !== null);
    },

    /**
     * Staff. The decision and its audit row commit together, or neither does —
     * copied from `companyProfilesRepository.review`, because an approval nobody
     * can attribute is exactly the state moving off the environment variable was
     * meant to end.
     */
    async setStatus(
      actor: Actor,
      key: unknown,
      status: unknown,
      reason: unknown,
    ): Promise<WhatsAppTemplateRecord> {
      requireAdmin(actor);
      const templateKey = templateKeySchema.parse(key);
      const nextStatus = templateStatusSchema.parse(status);
      const rejectionReason = rejectionReasonSchema.parse(reason ?? null);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const updated = requireRecord(await transaction.execute(sql`
          UPDATE ${whatsappTemplates} SET
            status = ${nextStatus},
            -- Cleared on every non-approval. whatsapp_templates_approved_at_check
            -- only forbids an approval without a date, so a stale date left on a
            -- disabled row would read as "approved on 3 September" for something
            -- nobody may send.
            approved_at = ${nextStatus === "approved" ? sql`now()` : sql`NULL`},
            reviewed_by_profile_id = ${actor.profileId},
            rejection_reason = ${rejectionReason},
            updated_at = now()
          WHERE ${whatsappTemplates.key} = ${templateKey}
          RETURNING *
        `));
        await transaction.execute(sql`
          INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (${actor.profileId}, ${actor.kind}, 'whatsapp_template.status_changed', 'whatsapp_template', ${templateKey},
                  ${JSON.stringify({status: nextStatus, reason: rejectionReason})}::jsonb)
        `);
        return updated;
      });
    },

    /** Staff. The rendered body a reviewer reads back against the WOZTELL console. */
    async updatePreviews(
      actor: Actor,
      key: unknown,
      previews: unknown,
    ): Promise<WhatsAppTemplateRecord> {
      requireAdmin(actor);
      const templateKey = templateKeySchema.parse(key);
      const parsed = previewsSchema.parse(previews ?? {});
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const updated = requireRecord(await transaction.execute(sql`
          UPDATE ${whatsappTemplates} SET
            previews = ${JSON.stringify(parsed)}::jsonb,
            updated_at = now()
          WHERE ${whatsappTemplates.key} = ${templateKey}
          RETURNING *
        `));
        await transaction.execute(sql`
          INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (${actor.profileId}, ${actor.kind}, 'whatsapp_template.previews_updated', 'whatsapp_template', ${templateKey},
                  ${JSON.stringify({locales: Object.keys(parsed)})}::jsonb)
        `);
        return updated;
      });
    },

    /**
     * The send gate's read. One statement for nine rows, because the caller
     * needs `empty` as well as the approved set and two queries could disagree
     * with each other between them.
     */
    async approved(
      actor: TemplateRegistryActor | AutomationRepositoryActor,
    ): Promise<WhatsAppTemplateApproval> {
      requireTemplateRegistryReader(actor);
      const database = await loadDatabase();
      const rows = rowsFrom(await database.execute(sql`
        SELECT ${whatsappTemplates.key} AS key, ${whatsappTemplates.status} AS status
        FROM ${whatsappTemplates}
      `));
      const keys = new Set<WhatsAppTemplateKey>();
      for (const row of rows) {
        const key = typeof row.key === "string" ? row.key : null;
        if (key === null || row.status !== "approved" || !configured(key)) continue;
        keys.add(key);
      }
      return {keys, empty: rows.length === 0};
    },
  };
}

export type WhatsAppTemplatesRepository = ReturnType<typeof createWhatsAppTemplatesRepository>;

export const whatsappTemplatesRepository: WhatsAppTemplatesRepository =
  createWhatsAppTemplatesRepository();
