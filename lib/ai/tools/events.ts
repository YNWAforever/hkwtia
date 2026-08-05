import {z} from "zod";

import type {AgentTool} from "@/lib/ai/provider";
import {
  auditBestEffort,
  createTool,
  durationSince,
  ok,
  parseToolInput,
  type ConciergeToolContext,
} from "@/lib/ai/tools/shared";

export const eventListInputSchema = z.object({
  from: z.string().datetime({offset: true}),
  to: z.string().datetime({offset: true}),
  limit: z.number().int().min(1).max(25),
}).strict().superRefine((input, refinement) => {
  if (new Date(input.from) >= new Date(input.to)) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: "to must be after from",
    });
  }
});

export function createEventsTool(context: ConciergeToolContext): AgentTool {
  return createTool(
    "List published WTIA events visible to the current visitor.",
    eventListInputSchema,
    async (input) => {
      const parsed = await parseToolInput(
        context, "list_events", eventListInputSchema, input,
      );
      const startedAt = Date.now();
      try {
        const rows = await context.repositories.listEvents(context.actor, {
          locale: context.locale,
          from: new Date(parsed.from),
          to: new Date(parsed.to),
          limit: parsed.limit,
        });
        const values: unknown[] = [];
        const citations: Array<{
          sourceId: string;
          title: string;
          url: string;
          confidence: number;
        }> = [];
        for (const event of rows.slice(0, parsed.limit)) {
          const citation = {
            sourceId: `event:${event.slug}`,
            title: event.title,
            url: `${context.appOrigin}/${context.locale}/events/${encodeURIComponent(event.slug)}`,
            confidence: 1,
          };
          citations.push(citation);
          values.push(Object.freeze({
            code: "ok",
            slug: event.slug,
            title: event.title,
            description: event.description,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            venue: event.venue,
            citation,
          }));
        }
        await auditBestEffort(context, {
          tool: "list_events",
          phase: "outcome",
          outcome: "success",
          durationMs: durationSince(startedAt),
          count: values.length,
        });
        return ok(values, citations);
      } catch {
        await auditBestEffort(context, {
          tool: "list_events",
          phase: "outcome",
          outcome: "error",
          durationMs: durationSince(startedAt),
        });
        return ok([{code: "events_failed"}]);
      }
    },
  );
}
