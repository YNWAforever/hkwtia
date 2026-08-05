import "server-only";

import {serverEnv} from "@/lib/config/env";
import {
  suppressionsRepository,
  unsubscribeActor,
} from "@/lib/db/repos/suppressions";
import {verifyUnsubscribeToken} from "@/lib/email/unsubscribe-token";

type UnsubscribeResult = "created" | "existing";
type Dependencies = Readonly<{
  secret: string | (() => string);
  appUrl: string | (() => string);
  now?: () => number;
  unsubscribeEmailMarketing(profileId: string): Promise<UnsubscribeResult>;
}>;

const MAX_UNSUBSCRIBE_BODY_BYTES = 8_192;

class UnsubscribeRequestError extends Error {
  constructor(
    readonly code: "UNSUPPORTED_MEDIA_TYPE" | "UNSUBSCRIBE_BODY_TOO_LARGE",
    readonly status: 413 | 415,
  ) {
    super(code);
  }
}

async function requestBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_UNSUBSCRIBE_BODY_BYTES) {
    throw new UnsubscribeRequestError("UNSUBSCRIBE_BODY_TOO_LARGE", 413);
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_UNSUBSCRIBE_BODY_BYTES) {
    throw new UnsubscribeRequestError("UNSUBSCRIBE_BODY_TOO_LARGE", 413);
  }
  return new TextDecoder().decode(bytes);
}

async function formValues(request: Request): Promise<Readonly<{
  token: string | null;
  redirect: boolean;
}>> {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return {token: queryToken, redirect: false};

  const contentTypeHeader = request.headers.get("content-type") ?? "";
  const isJson = /^application\/json(?:\s*;|$)/i.test(contentTypeHeader);
  const isForm = /^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(contentTypeHeader);
  if (!isJson && !isForm) {
    throw new UnsubscribeRequestError("UNSUPPORTED_MEDIA_TYPE", 415);
  }

  const body = await requestBody(request);
  if (isJson) {
    const value = JSON.parse(body) as {token?: unknown; redirect?: unknown};
    return {
      token: typeof value.token === "string" ? value.token : null,
      redirect: value.redirect === true || value.redirect === "1",
    };
  }
  const form = new URLSearchParams(body);
  return {
    token: form.get("token"),
    redirect: form.get("redirect") === "1",
  };
}

function successLocation(appUrl: string, locale: "en" | "zh-HK"): URL {
  return new URL(
    locale === "zh-HK"
      ? "/zh/unsubscribe?status=success"
      : "/unsubscribe?status=success",
    appUrl,
  );
}

export function createUnsubscribePost(dependencies: Dependencies) {
  return async function post(request: Request): Promise<Response> {
    let input: Awaited<ReturnType<typeof formValues>>;
    try {
      input = await formValues(request);
    } catch (error) {
      if (error instanceof UnsubscribeRequestError) {
        return Response.json({error: error.code}, {status: error.status});
      }
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
      const appUrl = typeof dependencies.appUrl === "function"
        ? dependencies.appUrl()
        : dependencies.appUrl;
      return Response.redirect(successLocation(appUrl, payload.locale), 303);
    }
    return Response.json({ok: true}, {status: 200});
  };
}

export const POST = createUnsubscribePost({
  secret: () => serverEnv().cronSecret,
  appUrl: () => serverEnv().appUrl,
  unsubscribeEmailMarketing(profileId) {
    return suppressionsRepository.unsubscribeEmailMarketing(
      unsubscribeActor(),
      profileId,
      "member_unsubscribe",
    );
  },
});
