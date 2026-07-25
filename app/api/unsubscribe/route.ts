import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";
import {serverEnv} from "@/lib/config/env";
import {suppressionsRepository} from "@/lib/db/repos/suppressions";
import {verifyUnsubscribeToken} from "@/lib/email/unsubscribe-token";

type UnsubscribeResult = "created" | "existing";
type Dependencies = Readonly<{
  secret: string | (() => string);
  now?: () => number;
  unsubscribeEmailMarketing(profileId: string): Promise<UnsubscribeResult>;
}>;

async function formValues(request: Request): Promise<Readonly<{
  token: string | null;
  redirect: boolean;
}>> {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return {token: queryToken, redirect: false};

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const value = await request.json() as {token?: unknown; redirect?: unknown};
    return {
      token: typeof value.token === "string" ? value.token : null,
      redirect: value.redirect === true || value.redirect === "1",
    };
  }
  const form = new URLSearchParams(await request.text());
  const token = form.get("token");
  return {
    token,
    redirect: form.get("redirect") === "1",
  };
}

function successLocation(request: Request, locale: "en" | "zh-HK"): URL {
  return new URL(
    locale === "zh-HK"
      ? "/zh/unsubscribe?status=success"
      : "/unsubscribe?status=success",
    request.url,
  );
}

export function createUnsubscribePost(dependencies: Dependencies) {
  return async function post(request: Request): Promise<Response> {
    let input: Awaited<ReturnType<typeof formValues>>;
    try {
      input = await formValues(request);
    } catch {
      return Response.json({error: "INVALID_UNSUBSCRIBE_TOKEN"}, {status: 400});
    }

    const secret = typeof dependencies.secret === "function"
      ? dependencies.secret()
      : dependencies.secret;
    const payload = input.token
      ? verifyUnsubscribeToken(input.token, secret, dependencies.now?.())
      : null;
    if (!payload) {
      return Response.json({error: "INVALID_UNSUBSCRIBE_TOKEN"}, {status: 400});
    }

    try {
      await dependencies.unsubscribeEmailMarketing(payload.profileId);
    } catch (error) {
      if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") {
        return Response.json({error: "UNSUBSCRIBE_PROFILE_NOT_FOUND"}, {status: 404});
      }
      return Response.json({error: "UNSUBSCRIBE_FAILED"}, {status: 500});
    }

    if (input.redirect) {
      return Response.redirect(successLocation(request, payload.locale), 303);
    }
    return Response.json({ok: true}, {status: 200});
  };
}

const unsubscribeActor: Actor = {
  kind: "system",
  userId: null,
  source: "unsubscribe",
};

export const POST = createUnsubscribePost({
  secret: () => serverEnv().cronSecret,
  unsubscribeEmailMarketing(profileId) {
    return suppressionsRepository.unsubscribeEmailMarketing(
      unsubscribeActor,
      profileId,
      "member_unsubscribe",
    );
  },
});
