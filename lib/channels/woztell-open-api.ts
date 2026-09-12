import "server-only";

import {z} from "zod";

/**
 * Programme C-3, plan Task 11 Step 4.
 *
 * ⚠️ EVERYTHING PROVIDER-SHAPED IN THIS FILE IS AN UNVERIFIED GUESS (open
 * question O-2). There are no Woztell credentials, no captured Open API
 * response and no provider documentation anywhere in this tree, and
 * `WOZTELL_SEND_RESPONSES_URL` in `lib/channels/woztell.ts` is the only provider
 * host that has ever existed here. The host below, the GraphQL document, the
 * connection shape and every field name `historyEntryToWebhookEnvelope` reaches
 * for are the plan's best guess.
 *
 * They are confined to this one file precisely so correcting them against a real
 * response is a single-file change, and every read fails CLOSED: a page that
 * does not parse throws a classified error the route turns into a 502, and an
 * entry that does not map returns `null` and is counted as skipped. Nothing here
 * throws its way into a retry loop and nothing here half-populates an envelope a
 * writer would then persist.
 *
 * The owner must confirm the endpoint and the `conversationHistory` selection
 * set against Woztell's Open API documentation before this is called against
 * production. Until then the backfill is written, not proven.
 *
 * Log nothing. `tests/unit/woztell-adapter.test.ts` asserts the adapter never
 * echoes a body carrying a recipient number and a bearer token, and the same
 * rule applies here: classify, never echo the payload.
 */
const WOZTELL_OPEN_API_URL = "https://open.api.woztell.com/v1/graphql";

const CONVERSATION_HISTORY_DOCUMENT = `
  query ConversationHistory($channelId: ID!, $after: String, $first: Int!) {
    conversationHistory(channelId: $channelId, after: $after, first: $first) {
      edges {
        node {
          id
          from
          direction
          timestamp
          text
          memberId
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

export type ConversationHistoryPage = Readonly<{
  /** Raw provider entries; mapping is the caller's job. */
  entries: readonly unknown[];
  endCursor: string | null;
  hasNextPage: boolean;
}>;

export type WoztellOpenApiClient = Readonly<{
  conversationHistory(
    input: Readonly<{after: string | null; first: number}>,
  ): Promise<ConversationHistoryPage>;
}>;

export type WoztellOpenApiFailureCode =
  | "provider_unreachable"
  | "provider_rejected"
  | "provider_unreadable";

export class WoztellOpenApiFailure extends Error {
  readonly code: WoztellOpenApiFailureCode;

  constructor(code: WoztellOpenApiFailureCode) {
    super(`WOZTELL_OPEN_API_FAILED:${code}`);
    this.name = "WoztellOpenApiFailure";
    this.code = code;
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * `z.unknown()` on the node, on purpose: this schema's whole job is the page
 * envelope — the cursor and the "is there more" flag, which decide whether the
 * loop runs again. The entries themselves are handed to
 * `historyEntryToWebhookEnvelope`, which refuses one field at a time; parsing
 * them here would make one malformed entry lose a whole page.
 */
const historyPageSchema = z.object({
  data: z.object({
    conversationHistory: z.object({
      edges: z.array(z.object({node: z.unknown()})).default([]),
      pageInfo: z.object({
        endCursor: z.string().nullable().default(null),
        hasNextPage: z.boolean().default(false),
      }),
    }),
  }),
});

export function createWoztellOpenApiClient(
  options: Readonly<{token: string; channelId: string; fetchImpl?: FetchLike}>,
): WoztellOpenApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async conversationHistory(input) {
      let response: Response;
      try {
        response = await fetchImpl(WOZTELL_OPEN_API_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            query: CONVERSATION_HISTORY_DOCUMENT,
            variables: {
              channelId: options.channelId,
              after: input.after,
              first: input.first,
            },
          }),
        });
      } catch {
        throw new WoztellOpenApiFailure("provider_unreachable");
      }
      if (!response.ok) throw new WoztellOpenApiFailure("provider_rejected");

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new WoztellOpenApiFailure("provider_unreadable");
      }
      // GraphQL answers 200 with an `errors` array, so an HTTP status is not the
      // whole story: a partial page here would silently truncate the backlog and
      // hand back a cursor that looks like a clean stopping point.
      const parsed = historyPageSchema.safeParse(body);
      if (!parsed.success) throw new WoztellOpenApiFailure("provider_unreadable");
      const {edges, pageInfo} = parsed.data.data.conversationHistory;
      return {
        entries: edges.map(({node}) => node),
        endCursor: pageInfo.endCursor,
        hasNextPage: pageInfo.hasNextPage,
      };
    },
  };
}

/**
 * The pre-Phase-C inbound webhook envelope, which is the ONE shape
 * `lib/channels/woztell.ts::normalizeInbound` has ever read. Declared here so
 * the mapper's refusal is visible in the type rather than only at runtime.
 */
export type WoztellInboundEnvelope = Readonly<{
  type: "TEXT";
  from: string;
  messageId: string;
  /**
   * `string | number`, because `receivedAtFrom` in `lib/channels/woztell.ts`
   * accepts both and applies the seconds/milliseconds threshold and the range
   * bounds itself. Passing only strings was the likeliest way for the whole
   * backlog to report as `skipped` against a provider that pages history with
   * epoch timestamps (O-2) — every entry would map to `null` at the normaliser,
   * fail closed, and look like an empty backlog. Validation stays where it was;
   * this only stops the mapper throwing the value away before it gets there.
   */
  timestamp: string | number;
  data: Readonly<{text: string}>;
  memberId?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The timestamp alone may be a number. Everything else in the envelope is a
 * string in every shape anyone has seen, but a numeric epoch is the ordinary way
 * a provider pages history, and `receivedAtFrom` already knows what to do with
 * one. `0` is not accepted: it is 1970, which `receivedAtFrom`'s range bounds
 * would reject anyway, and treating a falsy epoch as present would only move the
 * refusal one layer later.
 */
function firstTimestamp(...values: readonly unknown[]): string | number | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function firstString(...values: readonly unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * A direction marker we recognise as ours-not-theirs. An entry that declares one
 * of these is a message WE sent, and importing it as an inbound `role: 'user'`
 * row would put our own replies into the member's half of the thread — and, via
 * `conversations.last_inbound_at`, would reopen a 24-hour customer-service
 * window that never opened.
 *
 * The converse is deliberately NOT symmetrical: an entry that declares no
 * direction at all is treated as inbound, because the history query asks for a
 * conversation and failing closed the other way would import nothing at all
 * against a provider whose field names we have not seen (O-2). If the first real
 * response shows a different marker, this set is the one line to correct.
 */
const OUTBOUND_MARKERS = new Set([
  "outbound", "out", "sent", "send", "bot", "manual", "relay", "agent", "system",
]);

/**
 * One provider entry → the pre-Phase-C inbound webhook envelope
 * (`{from, type:"TEXT", messageId, timestamp, data:{text}}`, plus the optional
 * `memberId` Task 2 added), so the backfill and the webhook share exactly one
 * normaliser and a correction to the opt-out vocabulary or the member-id
 * extraction reaches both.
 *
 * `null` means "not importable", never "throw": the caller counts it as skipped.
 */
export function historyEntryToWebhookEnvelope(
  entry: unknown,
): WoztellInboundEnvelope | null {
  if (!isRecord(entry)) return null;

  const direction = firstString(entry.direction, entry.origin).toLowerCase();
  if (direction && OUTBOUND_MARKERS.has(direction)) return null;

  const from = firstString(entry.from, entry.sender, entry.contactNumber, entry.phone);
  const messageId = firstString(entry.messageId, entry.id);
  const timestamp = firstTimestamp(entry.timestamp, entry.createdAt, entry.sentAt);
  const text = firstString(
    entry.text,
    isRecord(entry.data) ? entry.data.text : undefined,
    isRecord(entry.message) ? entry.message.text : undefined,
  );
  if (!from || !messageId || timestamp === null || !text) return null;

  const memberId = firstString(
    entry.memberId,
    isRecord(entry.member) ? entry.member.id : undefined,
  );
  return {
    type: "TEXT",
    from,
    messageId,
    timestamp,
    data: {text},
    ...(memberId ? {memberId} : {}),
  };
}
