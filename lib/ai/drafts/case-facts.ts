import "server-only";
import {readContentDraftFacts} from "./content-facts";
import {readSupportDraftSource} from "./support-facts";
import { readApplicationTriageSource } from "@/lib/db/repos/applications";
import { applicationDraftFacts } from "./application-facts";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/authorize";
import { draftFactLabels } from "./fact-labels";
import { approvedFactsHash } from "./validation";
import type { ApprovedDraftFactReader } from "@/lib/db/repos/ai-drafts";
import type { ApprovedFactPack } from "./contracts";
/** Registered case readers remain server-side. Unsupported business kinds fail closed until their task supplies its authoritative reader. */
export const readApprovedDraftFacts: ApprovedDraftFactReader = async (
  actor,
  input,
  tx,
) => {
  requireAdmin(actor);
  if (input.kind === "content") return readContentDraftFacts(actor, input.caseId, tx, input.asOf);
  if (input.kind === "application") {
    const source = await readApplicationTriageSource(actor, input.caseId, tx);
    if (!source) throw Error("AI_DRAFT_CASE_UNAVAILABLE");
    return applicationDraftFacts(source, input.asOf);
  }
  if (input.kind !== "support") throw Error("AI_DRAFT_FACT_READER_UNAVAILABLE");
  if(input.caseId.startsWith("inbox:"))return (await readSupportDraftSource(actor,input.caseId.slice(6),tx,input.asOf)).facts;
  const id = z.string().uuid().parse(input.caseId);
  const result = await tx.execute(
    sql`SELECT id,status,kind,summary_code,context FROM staff_tasks WHERE id=${id} FOR SHARE`,
  );
  const rows = Array.isArray(result)
    ? result
    : result &&
        typeof result === "object" &&
        "rows" in result &&
        Array.isArray(result.rows)
      ? result.rows
      : [];
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) throw Error("AI_DRAFT_CASE_UNAVAILABLE");
  const locale = z
    .enum(["en", "zh-HK"])
    .parse(
      row.context && typeof row.context === "object" && "locale" in row.context
        ? row.context.locale
        : "en",
    );
  const sourceId = `db:support:${id}`,
    labels = draftFactLabels(locale);
  // Hash the authoritative version without exporting context or personal information into the draft.
  const recordHash = createHash("sha256")
    .update(
      JSON.stringify({
        id,
        status: row.status,
        kind: row.kind,
        summaryCode: row.summary_code,
        context: row.context,
      }),
    )
    .digest("hex");
  const facts: ApprovedFactPack = {
    caseId: id,
    locale,
    versionHash: "0".repeat(64),
    asOf: input.asOf.toISOString(),
    values: {
      caseState: {
        value:
          row.status === "open"
            ? labels.caseOpen
            : row.status === "resolved"
              ? labels.caseResolved
              : labels.displayLabels.notAvailable,
        sourceId,
        label: labels.caseState,
        format: "text",
      },
    },
    sourceRefs: [],
    recordSources: { [sourceId]: recordHash },
    sourceUrls: {},
    comparisonAvailable: null,
    displayLabels: labels.displayLabels,
  };
  return { ...facts, versionHash: approvedFactsHash(facts) };
};
