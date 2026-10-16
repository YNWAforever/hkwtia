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
import {aiEnv, appEnv} from "@/lib/config/env";
import {auditEventsRepository} from "@/lib/db/repos/audit-events";
import {
  contactsRepository,
  contactWriterActor,
  type ContactMemberIdLink,
} from "@/lib/db/repos/contacts";
import {
  createPostgresWoztellStore,
  woztellBackfillActor,
} from "@/lib/db/repos/woztell";
import {
  createWoztellProfileResolverRepository,
} from "@/lib/db/repos/woztell-profile-resolver";
import type {Actor} from "@/lib/membership/lifecycle";
import {BoundedBodyError, readBoundedText} from "@/lib/security/bounded-body";
import {isSameOrigin} from "@/lib/security/request-origin";

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
 * remains required as CONFIGURATION, never as the caller's credential. What that
 * choice costs is that the caller's credential is a session COOKIE, which is why
 * the same-origin gate in `post` is not optional — see the comment on it.
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

/**
 * What one run is answerable for. Written to `audit_events` once the loop is
 * over, so "who imported this backlog, over which cursor window, and how much
 * landed" has an answer that outlives the HTTP response.
 */
export type WoztellBackfillRunRecord = Readonly<{
  after: string | null;
  endCursor: string | null;
  hasNextPage: boolean;
  outcome: "completed" | "provider_failed" | "failed";
  imported: number;
  duplicates: number;
  skipped: number;
  contacts: number;
  memberIdConflicts: number;
}>;

export type WoztellBackfillDependencies = Readonly<{
  actor: () => Promise<Actor>;
  /**
   * `APP_URL`, read late through a dependency rather than at module scope. This
   * file already pulls `aiEnv()`; boundary 7 exists because a second env
   * contract evaluated at import time is how a page that needed one variable
   * came to require three.
   */
  expectedOrigin: () => string;
  /** Configuration, not a credential. Blank ⇒ 503 BACKFILL_NOT_CONFIGURED. */
  openApiToken: () => string | undefined;
  /**
   * Also configuration, and checked in the SAME breath as the token. A
   * deployment with `WOZTELL_OPEN_API_TOKEN` set and `WOZTELL_CHANNEL_ID` unset
   * is not configured, but it used to get past this gate: the query went out
   * with an empty `ID!` and either 502'd or answered with an empty page, which
   * staff read as "there is no backlog". Under O-2 it is also unknown whether an
   * empty channel id WIDENS the query's scope rather than narrowing it, and
   * guessing wrong there imports another channel's history.
   */
  openApiChannelId: () => string | undefined;
  createClient: (
    credentials: Readonly<{token: string; channelId: string}>,
  ) => WoztellOpenApiClient;
  /** Only the normaliser is needed, and only the normaliser is offered. */
  channel: Pick<ChannelAdapter, "normalizeInbound">;
  resolveProfile: (normalizedSender: string) => Promise<WoztellProfile | null>;
  anonymousOwnerHash: (normalizedSender: string) => string;
  recordContact: (input: Readonly<{
    phoneE164: string;
    locale: "en" | "zh-HK";
    receivedAt: Date;
    whatsappMemberId: string | null;
  }>) => Promise<Readonly<{id: string; memberIdLink?: ContactMemberIdLink}>>;
  importInbound: (
    input: WoztellInboundClaimInput,
  ) => Promise<"imported" | "duplicate">;
  recordRun: (actor: Actor, record: WoztellBackfillRunRecord) => Promise<void>;
  pageSize?: number;
}>;

type BackfillCounters = {
  imported: number;
  duplicates: number;
  skipped: number;
  contacts: number;
  memberIdConflicts: number;
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
      // The webhook turns a `"conflict"` into a staff task
      // (`notifyMemberIdConflict`), and this route deliberately cannot: S-14
      // mints `woztellBackfillActor` as a capability DISTINCT from the webhook's
      // so the backfill cannot reach the webhook's writers, and borrowing the
      // webhook actor here to file one task would hand it all of them. It is
      // still not dropped on the floor — a year of backlog is exactly where
      // contested member ids live. It is counted, returned in the response and
      // written into the run's audit row, which is what the person who started
      // the import actually reads. Deciding which contact keeps a contested id
      // is C2 Task 5's merge-candidate work either way.
      if (contact.memberIdLink === "conflict") counters.memberIdConflicts += 1;
    }

    // `normalized.intent` may well be `opt_out` — a STOP somewhere in the
    // backlog. It is deliberately NOT acted on, and the reason is not that a
    // replay could rewrite a withdrawal: `markWhatsAppOptedOut` is monotonic
    // (`COALESCE(whatsapp_opted_out_at, now())`, and `already_revoked` on a
    // repeat), so replaying one cannot move it. It is that consent is whatever
    // the live tables already say, and nothing here can tell a withdrawal the
    // webhook already recorded from one it never saw. The residual risk runs the
    // OTHER way, and the plan's exit checklist carries it: importing a recent
    // STOP the webhook missed bumps `conversations.last_inbound_at` while the
    // withdrawal is in no table, so `messageEligibility` answers `eligible` for a
    // service reply to somebody who asked us to stop. The message is stored as
    // what it is, a message.
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

    // CSRF, and why it is a live hazard here rather than a checklist item: the
    // caller's credential is a session COOKIE, `proxy.ts`'s matcher is
    // `/((?!api|trpc|_next|_vercel|.*\..*).*)` so `/api` never reaches it, and
    // `next.config.ts` sets RESPONSE headers only. Nothing else in this tree asks
    // who called. A staff member with a live admin session opening an attacker
    // page is the whole attack: a cross-origin form post with
    // `enctype="text/plain"` needs no preflight and never has to read the
    // response, and a body this small straddles the `=` and still parses as JSON
    // (`{"after":"=","pages":20}`). Twenty pages would import with no staff
    // intent — `contacts` rows, `messages` rows, and a bumped
    // `conversations.last_inbound_at`, which is the column the inbox reads to
    // decide that a 24-hour customer-service window is open and staff may
    // free-text. Same gate, same order and same 403 as `createMediaUploadPost`.
    // An operator driving this from a shell must send `Origin: $APP_URL`.
    let expectedOrigin: string;
    try {
      expectedOrigin = dependencies.expectedOrigin();
    } catch {
      return json(500, {error: "BACKFILL_FAILED"});
    }
    if (!isSameOrigin(request, expectedOrigin)) {
      return json(403, {error: "BACKFILL_ORIGIN_DENIED"});
    }

    const token = dependencies.openApiToken()?.trim();
    const channelId = dependencies.openApiChannelId()?.trim();
    if (!token || !channelId) return json(503, {error: "BACKFILL_NOT_CONFIGURED"});

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
      imported: 0, duplicates: 0, skipped: 0, contacts: 0, memberIdConflicts: 0,
    };
    let cursor = parsed.data.after;
    let hasNextPage = false;
    let failure: "provider" | "internal" | null = null;
    try {
      const client = dependencies.createClient({token, channelId});
      for (let read = 0; read < parsed.data.pages; read += 1) {
        const requested = cursor;
        const page = await client.conversationHistory({after: cursor, first: pageSize});
        for (const entry of page.entries) await importEntry(entry, counters);
        cursor = page.endCursor;
        hasNextPage = page.hasNextPage;
        // A cursor that did not advance cannot resume. `endCursor: null` with
        // `hasNextPage: true` — or an endCursor equal to the one just sent —
        // would re-read page one on every remaining iteration, up to `pages`
        // provider calls for nothing. The import is idempotent, so the only cost
        // is wasted provider calls and an inflated `duplicates`; the honest
        // answer is to stop and hand back the cursor that stuck.
        if (!page.hasNextPage || cursor === requested) break;
      }
    } catch (error) {
      // Classify, never echo: a provider body carries a bearer token and a
      // recipient number, and this layer logs nothing for the same reason
      // `lib/channels/woztell.ts` does not.
      failure = error instanceof WoztellOpenApiFailure ? "provider" : "internal";
    }

    // One row per run that reached the provider: who ran it, the cursor window it
    // covered, and what landed. `segmentsRepository.auditExport` audits a mere
    // CSV READ; this route writes `contacts` rows, `messages` rows and a bumped
    // `conversations.last_inbound_at`, and until now nothing recorded that it had
    // happened at all. Awaited plainly, like that precedent, and before the
    // outcome is classified, so a 200 from this route means the run is on the
    // record. Losing this write costs the caller their cursor — but re-running
    // from the same `after` is idempotent, while an unaudited bulk import of a
    // member backlog is the thing a PDPO reviewer asks to see.
    try {
      await dependencies.recordRun(actor, {
        after: parsed.data.after,
        endCursor: cursor,
        hasNextPage,
        outcome: failure === "provider"
          ? "provider_failed"
          : failure ? "failed" : "completed",
        ...counters,
      });
    } catch {
      return json(500, {error: "BACKFILL_FAILED"});
    }

    if (failure === "provider") return json(502, {error: "BACKFILL_PROVIDER_FAILED"});
    if (failure) return json(500, {error: "BACKFILL_FAILED"});
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
    expectedOrigin: () => appEnv().appUrl,
    openApiToken: () => env.woztellOpenApiToken,
    openApiChannelId: () => env.woztellChannelId,
    createClient: (credentials) => createWoztellOpenApiClient(credentials),
    channel,
    resolveProfile: profileResolver.resolveProfile,
    anonymousOwnerHash: (sender) => woztellAnonymousOwnerHash(env, sender),
    async recordContact(input) {
      const contact = await contactsRepository.upsertFromWhatsApp(
        // A distinct source from the webhook's `"whatsapp"`. `upsertFromWhatsApp`
        // writes `actor.source` into `contacts.source` on INSERT — and only on
        // INSERT, so an existing live contact is never relabelled by an import —
        // which is where a backfilled contact is greppable. It writes no
        // `audit_events` row: an earlier version of this comment claimed an audit
        // trail that does not exist. The run's own row, written by `recordRun`,
        // is the record of who imported what.
        contactWriterActor("import"),
        {
          phoneE164: input.phoneE164,
          locale: input.locale,
          receivedAt: input.receivedAt,
          whatsappMemberId: input.whatsappMemberId,
        },
      );
      return contact.memberIdLink === undefined
        ? {id: contact.id}
        : {id: contact.id, memberIdLink: contact.memberIdLink};
    },
    importInbound: (input) => store.importHistoricalInbound(
      woztellBackfillActor(),
      input,
    ),
    async recordRun(actor, record) {
      await auditEventsRepository.append(actor, {
        action: "woztell.history_imported",
        // The channel is the thing imported FROM, and the only stable identity a
        // run has: there is no row in this database that a backfill is "of".
        targetType: "woztell_channel",
        targetId: env.woztellChannelId ?? "",
        metadata: {...record},
      });
    },
  })(request);
}
