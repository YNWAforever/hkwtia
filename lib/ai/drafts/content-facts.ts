import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/authorize";
import type { AdminActor } from "@/lib/membership/lifecycle";
import type { AiDraftExecutor } from "@/lib/db/repos/ai-drafts";
import { approvedFactsHash } from "./validation";
import type { ApprovedFactPack } from "./contracts";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
export function contentCaseId(
  kind: "event" | "news",
  id: string,
  locale: "en" | "zh-HK",
) {
  return `${kind}:${z.string().uuid().parse(id)}:${locale}`;
}
export function parseContentCaseId(input: string) {
  const m = /^(event|news):([a-f0-9-]{36}):(en|zh-HK)$/.exec(input);
  if (!m) throw Error("CONTENT_CASE_INVALID");
  return {
    kind: z.enum(["event", "news"]).parse(m[1]),
    id: z.string().uuid().parse(m[2]),
    locale: z.enum(["en", "zh-HK"]).parse(m[3]),
  };
}
function rows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "rows" in value &&
    Array.isArray(value.rows)
  )
    return value.rows;
  throw Error("CONTENT_SOURCE_UNAVAILABLE");
}
/** Locks the existing record and minimizes source facts. The caller's draft is never the source of price, time or publication state. */
export async function readContentDraftFacts(
  actor: AdminActor,
  caseId: string,
  tx: AiDraftExecutor,
  asOf: Date,
): Promise<ApprovedFactPack> {
  requireAdmin(actor);
  const { kind, id, locale } = parseContentCaseId(caseId),
    messages = locale === "zh-HK" ? zh : en;
  const result =
    kind === "event"
      ? await tx.execute(
          sql`SELECT id,title_en,title_zh,description_en,description_zh,starts_at,ends_at,venue,capacity,registration_mode,ticket_price_hkd_cents,format,status,visibility,published,updated_at FROM events WHERE id=${id} FOR SHARE`,
        )
      : await tx.execute(
          sql`SELECT id,title_en,title_zh,body_mdx,body_mdx_zh_hk,published_at,archived_at,author,updated_at FROM posts WHERE id=${id} AND kind='news' FOR SHARE`,
        );
  const source = rows(result)[0];
  if (!source || source.status === "cancelled" || source.archived_at != null)
    throw Error("AI_DRAFT_CASE_UNAVAILABLE");
  const sourceId = `db:${kind === "event" ? "event" : "content"}:${id}`,
    recordHash = createHash("sha256")
      .update(JSON.stringify(source))
      .digest("hex");
  const values: ApprovedFactPack["values"] = {};
  const labels = messages.Admin.eventsMgmt;
  const add = (
    field: string,
    label: string,
    value: ApprovedFactPack["values"][string]["value"],
    format: ApprovedFactPack["values"][string]["format"] = "text",
  ) => {
    values[field] = {
      label,
      value,
      sourceId,
      format,
      ...(format === "money" ? { currency: "HKD" as const } : {}),
    };
  };
  const stringOrNull = (v: unknown) =>
    v == null ? null : z.string().max(500).parse(v);
  add(
    "title",
    locale === "zh-HK" ? labels.titleZh : labels.titleEn,
    stringOrNull(locale === "zh-HK" ? source.title_zh : source.title_en),
  );
  if (kind === "event") {
    const instant = (v: unknown) =>
      v == null ? null : z.coerce.date().parse(v).toISOString();
    add("startsAt", labels.startsAt, instant(source.starts_at), "datetime");
    add(
      "endsAt",
      labels.endsAt,
      instant(source.ends_at),
      source.ends_at == null ? "text" : "datetime",
    );
    add("venue", labels.venue, stringOrNull(source.venue));
    add(
      "capacity",
      labels.capacity,
      source.capacity == null
        ? null
        : z.coerce.number().int().positive().parse(source.capacity),
      source.capacity == null ? "text" : "count",
    );
    const mode = z
      .enum(["rsvp", "external", "ticketed"])
      .parse(source.registration_mode);
    add(
      "registrationMode",
      labels.registrationMode,
      labels.registrationModes[mode],
    );
    add(
      "ticketPrice",
      labels.ticketPriceHkdCents,
      source.ticket_price_hkd_cents == null
        ? null
        : z.coerce
            .number()
            .int()
            .nonnegative()
            .parse(source.ticket_price_hkd_cents) / 100,
      source.ticket_price_hkd_cents == null ? "text" : "money",
    );
  }
  const generated = messages.Admin.reports.generatedReport;
  const pack: ApprovedFactPack = {
    caseId,
    locale,
    versionHash: "0".repeat(64),
    asOf: asOf.toISOString(),
    values,
    sourceRefs: [],
    recordSources: { [sourceId]: recordHash },
    sourceUrls: {},
    comparisonAvailable: false,
    displayLabels: {
      yes: generated.yes,
      no: generated.no,
      notAvailable: generated.unavailable,
    },
  };
  return { ...pack, versionHash: approvedFactsHash(pack) };
}
export async function readContentCopyContext(
  actor: AdminActor,
  caseId: string,
  tx: AiDraftExecutor,
  asOf: Date,
  expectedHash: string,
) {
  const facts = await readContentDraftFacts(actor, caseId, tx, asOf);
  if (facts.versionHash !== expectedHash) throw Error("DRAFT_GENERATION_STALE");
  const { kind, id, locale } = parseContentCaseId(caseId);
  const row = rows(
    kind === "event"
      ? await tx.execute(
          sql`SELECT description_en AS en,description_zh AS zh FROM events WHERE id=${id}`,
        )
      : await tx.execute(
          sql`SELECT body_mdx AS en,body_mdx_zh_hk AS zh FROM posts WHERE id=${id}`,
        ),
  )[0];
  // Staff copy is untrusted prose, not policy or facts. Contacts, markup and URLs never enter the provider prompt.
  const clean = (text: unknown) =>
    String(text ?? "")
      .slice(0, 10000)
      .replace(/<[^>]*>/g, " ")
      .replace(/https?:\/\/\S+/gi, "[link removed]")
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[contact removed]")
      .replace(/(?:\+?\d[\d\s()-]{6,}\d)/g, "[number removed]");
  return {
    targetLocale: locale,
    sourceEnglish: clean(row?.en),
    sourceChinese: clean(row?.zh),
    instruction:
      "Rewrite or translate the prose only. All factual details must use supplied standalone fact tokens. Do not invent association names, awards, policy, entitlements or successful effects.",
  };
}
