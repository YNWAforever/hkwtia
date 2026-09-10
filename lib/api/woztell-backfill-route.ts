import "server-only";

import {z} from "zod";

import {woztellAnonymousOwnerHash} from "@/lib/ai/woztell-credentials";
import {
  localeFor,
  type WoztellInboundClaimInput,
  type WoztellProfile,
} from "@/lib/ai/woztell-webhook";
import {requireAdmin} from "@/lib/auth/authorize";
import type {ChannelAdapter} from "@/lib/channels/types";
import {createWoztellAdapter, normalizeWhatsAppNumber} from "@/lib/channels/woztell";
import {
  createWoztellOpenApiClient,
  historyEntryToWebhookEnvelope,
  WoztellOpenApiFailure,
  type WoztellOpenApiClient,
} from "@/lib/channels/woztell-open-api";
import {aiEnv} from "@/lib/config/env";
import {contactsRepository, contactWriterActor} from "@/lib/db/repos/contacts";
import {
  createPostgresWoztellStore,
  woztellBackfillActor,
} from "@/lib/db/repos/woztell";
import {
  createWoztellProfileResolverRepository,
} from "@/lib/db/repos/woztell-profile-resolver";
import type {Actor} from "@/lib/membership/lifecycle";
import {BoundedBodyError, readBoundedText} from "@/lib/security/bounded-body";

/** The request body is a cursor and a page count. 8 KiB is generous for both. */
const MAX_BACKFILL_BODY_BYTES = 8 * 1_024;
const HISTORY_PAGE_SIZE = 50;

/**
 * Programme C-3 Task 11 Step 6.
 *
 * **Spec deviation, deliberate.** §6 says "admin bearer". A second shared bearer
 * would be a new production secret with no rotation story and no owner, while
 * the session-actor route is the pattern every other admin API route in this
 * repository already uses (`app/api/admin/media/upload/route.ts`,
 * `app/api/admin/segments/[id]/export/route.ts`). `WOZTELL_OPEN_API_TOKEN`
 * remains required as CONFIGURATION, never as the caller's credential.
 *
 * Note what this route is NOT: there is no concierge dependency and no adapter
 * send in the surface below, and the store method it calls
 * (`importHistoricalInbound`) writes rows that `decideWoztellClaimState` reports
 * `duplicate` for forever. `claimInbound` is what starts a bot turn, and
 * reaching it from a second boundary with no HMAC in front of it is how a
 * backfill becomes a mass re-reply of a year's backlog.
 */
const backfillBodySchema = z.object({
  after: z.string().max(4096).nullable().default(null),
  pages: z.number().int().min(1).max(20).default(5),
}).strict();

export type WoztellBackfillDependencies = Readonly<{
  actor: () => Promise<Actor>;
  /** Configuration, not a credential. Blank ⇒ 503 BACKFILL_NOT_CONFIGURED. */
  openApiToken: () => string | undefined;
  createClient: (token: string) => WoztellOpenApiClient;
  /** Only the normaliser is needed, and only the normaliser is offered. */
  channel: Pick<ChannelAdapter, "normalizeInbound">;
  resolveProfile: (normalizedSender: string) => Promise<WoztellProfile | null>;
  anonymousOwnerHash: (normalizedSender: string) => string;
  recordContact: (input: Readonly<{
    phoneE164: string;
    locale: "en" | "zh-HK";
    receivedAt: Date;
    whatsappMemberId: string | null;
  }>) => Promise<Readonly<{id: string}>>;
  importInbound: (
    input: WoztellInboundClaimInput,
  ) => Promise<"imported" | "duplicate">;
  pageSize?: number;
}>;

type BackfillCounters = {
  imported: number;
  duplicates: number;
  skipped: number;
  contacts: number;
};

const jsonHeaders = {"cache-control": "no-store", "content-type": "application/json"};

function json(status: number, body: Readonly<Record<string, unknown>>): Response {
  return new Response(JSON.stringify(body), {status, headers: jsonHeaders});
}

function notFound(): Response {
  // 404 rather than 403, the way `createMediaUploadPost` answers: the route's
  // existence is not confirmed to the wrong audience.
  return new Response("Not found", {status: 404, headers: {"cache-control": "no-store"}});
}

export function createWoztellBackfillPost(
  dependencies: WoztellBackfillDependencies,
) {
  const pageSize = dependencies.pageSize ?? HISTORY_PAGE_SIZE;

  /**
   * One provider entry. Every refusal is a counted skip, never a throw: one
   * malformed entry in a page of fifty must not cost the other forty-nine, and a
   * throw here would be a 500 on a route staff are told to re-run.
   */
  async function importEntry(
    entry: unknown,
    counters: BackfillCounters,
  ): Promise<void> {
    const envelope = historyEntryToWebhookEnvelope(entry);
    if (!envelope) {
      counters.skipped += 1;
      return;
    }
    // The ONE normaliser. Going through the adapter rather than reading the
    // envelope directly is what keeps the opt-out vocabulary, the member-id
    // extraction and the timestamp rules identical to the webhook's.
    const normalized = dependencies.channel.normalizeInbound(envelope);
    if (normalized.kind !== "message") {
      counters.skipped += 1;
      return;
    }
    const sender = normalizeWhatsAppNumber(normalized.sender);
    if (!sender) {
      counters.skipped += 1;
      return;
    }

    // Owner resolution is the webhook's, statement for statement
    // (`lib/ai/woztell-webhook.ts`): profile first, anonymous HMAC otherwise, and
    // a contact row only for a stranger. It is not decoration. `claimInbound`
    // reuses a conversation by OWNER, so a backfill that owned a member's thread
    // anonymously would leave the member's next inbound opening a second
    // conversation — splitting exactly the threads the inbox exists to unify.
    const profile = await dependencies.resolveProfile(sender);
    const locale = localeFor(normalized.text, profile);
    let contactId: string | null = null;
    if (!profile) {
      const contact = await dependencies.recordContact({
        phoneE164: sender,
        locale,
        receivedAt: normalized.receivedAt,
        whatsappMemberId: normalized.whatsappMemberId,
      });
      contactId = contact.id;
      counters.contacts += 1;
    }

    // `normalized.intent` may well be `opt_out` — a STOP somewhere in the
    // backlog. It is deliberately NOT acted on: consent is whatever the live
    // tables already say, and replaying a year-old withdrawal (or, worse, its
    // absence) from an import would rewrite it. The message is stored as what it
    // is, a message.
    const outcome = await dependencies.importInbound({
      owner: profile
        ? {kind: "profile", profileId: profile.id}
        : {kind: "anonymous", anonymousOwnerHash: dependencies.anonymousOwnerHash(sender)},
      profileId: profile?.id ?? null,
      locale,
      memberName: profile?.displayName ?? "Member",
      whatsappOptIn: profile?.whatsappOptIn ?? true,
      sender,
      providerMessageId: normalized.providerMessageId,
      receivedAt: normalized.receivedAt,
      content: normalized.text,
      channel: "whatsapp",
      whatsappMemberId: normalized.whatsappMemberId,
      contactId,
    });
    if (outcome === "imported") counters.imported += 1;
    else counters.duplicates += 1;
  }

  return async function post(request: Request): Promise<Response> {
    let actor: Actor;
    try {
      actor = await dependencies.actor();
      requireAdmin(actor);
    } catch {
      // Authorisation first, configuration second. A 503 ahead of this would
      // tell an unauthenticated caller whether the Open API token is set.
      return notFound();
    }

    const token = dependencies.openApiToken()?.trim();
    if (!token) return json(503, {error: "BACKFILL_NOT_CONFIGURED"});

    let body: unknown;
    try {
      body = JSON.parse(await readBoundedText(request, MAX_BACKFILL_BODY_BYTES));
    } catch (error) {
      if (error instanceof BoundedBodyError) {
        return json(413, {error: "PAYLOAD_TOO_LARGE"});
      }
      return json(400, {error: "INVALID_REQUEST"});
    }
    const parsed = backfillBodySchema.safeParse(body);
    if (!parsed.success) return json(400, {error: "INVALID_REQUEST"});

    const counters: BackfillCounters = {
      imported: 0, duplicates: 0, skipped: 0, contacts: 0,
    };
    let cursor = parsed.data.after;
    let hasNextPage = false;
    try {
      const client = dependencies.createClient(token);
      for (let read = 0; read < parsed.data.pages; read += 1) {
        const page = await client.conversationHistory({after: cursor, first: pageSize});
        for (const entry of page.entries) await importEntry(entry, counters);
        cursor = page.endCursor;
        hasNextPage = page.hasNextPage;
        if (!page.hasNextPage) break;
      }
    } catch (error) {
      // Classify, never echo: a provider body carries a bearer token and a
      // recipient number, and this layer logs nothing for the same reason
      // `lib/channels/woztell.ts` does not.
      if (error instanceof WoztellOpenApiFailure) {
        return json(502, {error: "BACKFILL_PROVIDER_FAILED"});
      }
      return json(500, {error: "BACKFILL_FAILED"});
    }

    // The cursor comes back so the caller can resume: the page cap exists so one
    // request cannot run for an unbounded time, not so the backlog is truncated.
    return json(200, {...counters, endCursor: cursor, hasNextPage});
  };
}

export async function POST(request: Request): Promise<Response> {
  const env = aiEnv();
  const store = createPostgresWoztellStore();
  const profileResolver = createWoztellProfileResolverRepository();
  // A credential-free adapter, on purpose. The backfill needs `normalizeInbound`
  // and nothing else, and `normalizeInbound` is pure; constructing the adapter
  // without `WOZTELL_API_TOKEN` and without `RUN_LIVE_WOZTELL` means that even a
  // future edit that reached for a send method here could not reach a member's
  // phone. Defence in depth for the one route whose whole risk is mass sending.
  const channel = createWoztellAdapter({});
  return createWoztellBackfillPost({
    actor: async () => {
      const {requireAdminActor} = await import("@/lib/auth/actor");
      return await requireAdminActor();
    },
    openApiToken: () => env.woztellOpenApiToken,
    createClient: (token) => createWoztellOpenApiClient({
      token,
      channelId: env.woztellChannelId ?? "",
    }),
    channel,
    resolveProfile: profileResolver.resolveProfile,
    anonymousOwnerHash: (sender) => woztellAnonymousOwnerHash(env, sender),
    async recordContact(input) {
      const contact = await contactsRepository.upsertFromWhatsApp(
        // A distinct source from the webhook's `"whatsapp"`, so a contact that
        // arrived through the backfill is greppable in `contacts.source` and in
        // the audit trail rather than indistinguishable from a live inbound.
        contactWriterActor("import"),
        {
          phoneE164: input.phoneE164,
          locale: input.locale,
          receivedAt: input.receivedAt,
          whatsappMemberId: input.whatsappMemberId,
        },
      );
      return {id: contact.id};
    },
    importInbound: (input) => store.importHistoricalInbound(
      woztellBackfillActor(),
      input,
    ),
  })(request);
}
