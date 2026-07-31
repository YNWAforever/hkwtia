import {z} from "zod";

import {
  CONCIERGE_OWNER_COOKIE,
  resolveAnonymousOwnership,
} from "@/lib/ai/conversation-cookie";
import {getActor} from "@/lib/auth/actor";
import {serverEnv} from "@/lib/config/env";
import {agentRunsRepository} from "@/lib/db/repos/agent-runs";
import type {ConversationOwner} from "@/lib/db/repos/conversations";
import {isSameOrigin} from "@/lib/security/request-origin";

const feedbackSchema = z.object({
  score: z.number().int().min(1).max(5),
}).strict();

type HandlerDependencies = Readonly<{
  expectedOrigin: string;
  cookieSecret: string;
  getActor: () => Promise<Readonly<{profileId: string}> | null>;
  recordFeedback: (
    owner: ConversationOwner,
    runId: string,
    score: number,
  ) => Promise<unknown>;
}>;

type RouteContext = Readonly<{
  params: Promise<Readonly<{id: string}>>;
}>;

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
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

export function createFeedbackPostHandler(
  dependencies: HandlerDependencies,
) {
  return async function post(
    request: Request,
    context: RouteContext,
  ): Promise<Response> {
    if (!isSameOrigin(request, dependencies.expectedOrigin)) {
      return Response.json({error: "ORIGIN_DENIED"}, {status: 403});
    }
    if (Buffer.byteLength(dependencies.cookieSecret, "utf8") < 32) {
      return Response.json(
        {error: "AI_CONFIGURATION_UNAVAILABLE"},
        {status: 503},
      );
    }

    let score: number;
    let runId: string;
    try {
      score = feedbackSchema.parse(await request.json()).score;
      runId = z.string().uuid().parse((await context.params).id);
    } catch {
      return Response.json({error: "INVALID_REQUEST"}, {status: 400});
    }

    try {
      const actor = await dependencies.getActor();
      let owner: ConversationOwner;
      if (actor) {
        owner = {kind: "profile", profileId: actor.profileId};
      } else {
        const ownership = resolveAnonymousOwnership(
          cookieValue(request, CONCIERGE_OWNER_COOKIE),
          dependencies.cookieSecret,
        );
        if (!ownership) {
          return Response.json(
            {error: "CONVERSATION_NOT_FOUND"},
            {status: 404},
          );
        }
        owner = {
          kind: "anonymous",
          anonymousOwnerHash: ownership.ownerHash,
        };
      }
      await dependencies.recordFeedback(owner, runId, score);
      return Response.json({status: "recorded"}, {status: 200});
    } catch (error) {
      if (authorizationDenied(error)) {
        return Response.json(
          {error: "CONVERSATION_NOT_FOUND"},
          {status: 404},
        );
      }
      return Response.json(
        {error: "AI_TEMPORARILY_UNAVAILABLE"},
        {status: 503},
      );
    }
  };
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const env = serverEnv();
  return createFeedbackPostHandler({
    expectedOrigin: env.appUrl || new URL(request.url).origin,
    cookieSecret: env.conciergeCookieSecret ?? "",
    getActor: async () => {
      const actor = await getActor();
      return actor ? {profileId: actor.profileId} : null;
    },
    recordFeedback: (owner, runId, score) =>
      agentRunsRepository.recordFeedback(owner, runId, score),
  })(request, context);
}
