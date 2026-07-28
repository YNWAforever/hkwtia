import {z} from "zod";

import {
  createConciergeService,
  type ConciergeSseEvent,
} from "@/lib/ai/agents/concierge";
import {
  CONCIERGE_OWNER_COOKIE,
  createAnonymousOwnership,
  resolveAnonymousOwnership,
  type AnonymousOwnership,
} from "@/lib/ai/conversation-cookie";
import {createOpenAIEmbeddingAdapter} from "@/lib/ai/embeddings";
import {createAgentRuntime} from "@/lib/ai/runtime";
import {
  createM4AAcceptanceBoundary,
  isM4AAcceptanceRequest,
  m4aAcceptanceCookieSecret,
} from "@/lib/ai/m4a-acceptance-boundary";
import {createConciergeTools} from "@/lib/ai/tools/registry";
import {getActor} from "@/lib/auth/actor";
import {serverEnv} from "@/lib/config/env";
import {agentRunsRepository} from "@/lib/db/repos/agent-runs";
import {agentToolsRepository} from "@/lib/db/repos/agent-tools";
import {
  conversationsRepository,
  type ConversationOwner,
} from "@/lib/db/repos/conversations";
import {
  clientIpFromHeaders,
  isSameOrigin,
} from "@/lib/security/request-origin";
import {
  createInMemoryRateLimiter,
  type RateLimiter,
} from "@/lib/security/rate-limit";
import {verifyTurnstile} from "@/lib/security/turnstile";

const optionalContactEmailSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string()
    .trim()
    .max(320)
    .email()
    .transform((value) => value.toLowerCase())
    .optional(),
);

export const conciergeRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2000),
  contactEmail: optionalContactEmailSchema,
  locale: z.enum(["en", "zh-HK"]),
  website: z.string().max(0).optional(),
  turnstileToken: z.string().max(4096).optional(),
}).strict();

type Actor = Readonly<{profileId: string}> | null;
type Service = Pick<
  ReturnType<typeof createConciergeService>,
  "startTurn"
>;

type HandlerDependencies = Readonly<{
  expectedOrigin: string;
  cookieSecret: string;
  turnstileSecret?: string;
  rateLimiter: RateLimiter;
  verifyTurnstile: (input: Readonly<{
    secret?: string;
    token?: string;
    remoteIp: string;
  }>) => Promise<boolean>;
  getActor: () => Promise<Actor>;
  createAnonymousOwnership?: () => AnonymousOwnership;
  service: Service;
}>;

const MAX_BODY_BYTES = 8_192;
const publicRateLimiter = createInMemoryRateLimiter({
  limit: 20,
  windowMs: 60_000,
});
let m4aAcceptanceBoundary:
  | ReturnType<typeof createM4AAcceptanceBoundary>
  | undefined;

export {
  createM4AAcceptanceBoundary,
  isM4AAcceptanceRequest,
};

function jsonError(error: string, status: number, headers?: HeadersInit) {
  return Response.json({error}, {status, headers});
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

async function parseRequestBody(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    throw new Error("REQUEST_BODY_TOO_LARGE");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Error("REQUEST_BODY_TOO_LARGE");
  }
  return JSON.parse(text);
}

function authorizationDenied(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && (
      ("code" in error && error.code === "FORBIDDEN")
      || ("message" in error && error.message === "FORBIDDEN")
    ),
  );
}

export function encodeSseEvent(event: ConciergeSseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function sseResponse(
  turn: Awaited<ReturnType<Service["startTurn"]>>,
  cookie?: string,
): Response {
  const encoder = new TextEncoder();
  const iterator = turn.events[Symbol.asyncIterator]();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const item = await iterator.next();
        if (item.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(encodeSseEvent(item.value)));
      } catch {
        controller.enqueue(encoder.encode(encodeSseEvent({
          event: "error",
          data: {code: "AI_TEMPORARILY_UNAVAILABLE"},
        })));
        controller.close();
      }
    },
    async cancel() {
      await turn.cancel();
      await iterator.return?.();
    },
  });
  const headers = new Headers({
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-content-type-options": "nosniff",
  });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(stream, {status: 200, headers});
}

export function createConciergePostHandler(
  dependencies: HandlerDependencies,
) {
  return async function post(request: Request): Promise<Response> {
    if (!isSameOrigin(request, dependencies.expectedOrigin)) {
      return jsonError("ORIGIN_DENIED", 403);
    }
    if (Buffer.byteLength(dependencies.cookieSecret, "utf8") < 32) {
      return jsonError("AI_CONFIGURATION_UNAVAILABLE", 503);
    }
    const remoteIp = clientIpFromHeaders(request.headers);
    if (!remoteIp) return jsonError("CLIENT_IP_INVALID", 400);
    const limit = dependencies.rateLimiter.check(remoteIp);
    if (!limit.allowed) {
      return jsonError("RATE_LIMITED", 429, {
        "retry-after": String(limit.retryAfterSeconds),
      });
    }

    let parsed: z.infer<typeof conciergeRequestSchema>;
    try {
      parsed = conciergeRequestSchema.parse(await parseRequestBody(request));
    } catch {
      return jsonError("INVALID_REQUEST", 400);
    }

    if (!await dependencies.verifyTurnstile({
      ...(dependencies.turnstileSecret === undefined
        ? {}
        : {secret: dependencies.turnstileSecret}),
      ...(parsed.turnstileToken === undefined
        ? {}
        : {token: parsed.turnstileToken}),
      remoteIp,
    })) {
      return jsonError("TURNSTILE_FAILED", 403);
    }

    try {
      const actor = await dependencies.getActor();
      let owner: ConversationOwner;
      let profileId: string | null;
      let newCookie: string | undefined;
      if (actor) {
        profileId = actor.profileId;
        owner = {kind: "profile", profileId};
      } else {
        profileId = null;
        const existing = resolveAnonymousOwnership(
          cookieValue(request, CONCIERGE_OWNER_COOKIE),
          dependencies.cookieSecret,
        );
        const anonymous = existing ?? (
          dependencies.createAnonymousOwnership?.()
          ?? createAnonymousOwnership(dependencies.cookieSecret)
        );
        owner = {
          kind: "anonymous",
          anonymousOwnerHash: anonymous.ownerHash,
        };
        if (!existing) {
          if ("cookie" in anonymous) {
            newCookie = (anonymous as AnonymousOwnership).cookie;
          } else {
            throw new Error("CONCIERGE_OWNER_COOKIE_MISSING");
          }
        }
      }

      const turn = await dependencies.service.startTurn({
        owner,
        profileId,
        ...(parsed.conversationId === undefined
          ? {}
          : {conversationId: parsed.conversationId}),
        message: parsed.message,
        ...(parsed.contactEmail === undefined
          ? {}
          : {fallbackContactEmail: parsed.contactEmail}),
        locale: parsed.locale,
        trigger: "web",
        abortSignal: request.signal,
      });
      return sseResponse(turn, newCookie);
    } catch (error) {
      if (authorizationDenied(error)) {
        return jsonError("CONVERSATION_NOT_FOUND", 404);
      }
      return jsonError("AI_TEMPORARILY_UNAVAILABLE", 503);
    }
  };
}

async function productionHandler(request: Request): Promise<Response> {
  if (isM4AAcceptanceRequest(process.env, request.url)) {
    m4aAcceptanceBoundary ??= createM4AAcceptanceBoundary();
    const headers = new Headers(request.headers);
    if (
      !headers.has("x-vercel-forwarded-for")
      && !headers.has("x-real-ip")
    ) {
      headers.set("x-real-ip", "127.0.0.1");
    }
    const acceptanceRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: await request.text(),
    });
    return createConciergePostHandler({
      expectedOrigin: new URL(request.url).origin,
      cookieSecret: m4aAcceptanceCookieSecret(),
      rateLimiter: publicRateLimiter,
      verifyTurnstile: async () => true,
      getActor: async () => null,
      service: m4aAcceptanceBoundary.service,
    })(acceptanceRequest);
  }
  const env = serverEnv();
  const expectedOrigin = env.appUrl || new URL(request.url).origin;
  const service = createConciergeService({
    agentsEnabled: env.agentsEnabled,
    model: env.agentModelConcierge,
    credentials: {
      ...(env.openaiApiKey === undefined
        ? {}
        : {openaiApiKey: env.openaiApiKey}),
      ...(env.anthropicApiKey === undefined
        ? {}
        : {anthropicApiKey: env.anthropicApiKey}),
    },
    appOrigin: expectedOrigin,
    conversations: conversationsRepository,
    agentTools: agentToolsRepository,
    getRuntime: (runId) => createAgentRuntime({
      agentRuns: agentRunsRepository,
      createRunId: () => runId,
    }),
    getEmbedding: () =>
      createOpenAIEmbeddingAdapter(env.openaiApiKey ?? ""),
    createTools: createConciergeTools,
    audit: async () => undefined,
  });
  return createConciergePostHandler({
    expectedOrigin,
    cookieSecret: env.conciergeCookieSecret ?? "",
    ...(env.turnstileSecret === undefined
      ? {}
      : {turnstileSecret: env.turnstileSecret}),
    rateLimiter: publicRateLimiter,
    verifyTurnstile,
    getActor: async () => {
      const actor = await getActor();
      return actor ? {profileId: actor.profileId} : null;
    },
    service,
  })(request);
}

export async function POST(request: Request): Promise<Response> {
  return productionHandler(request);
}
