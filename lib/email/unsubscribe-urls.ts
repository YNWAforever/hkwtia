import "server-only";

import {appEnv, unsubscribeEnv} from "@/lib/config/env";
import {signUnsubscribeToken} from "@/lib/email/unsubscribe-token";

const UNSUBSCRIBE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * The two unsubscribe URLs a marketing send needs, sharing one signed token so
 * both routes accept the same link for the same window.
 *
 * `pageUrl` is the localized confirmation page a recipient clicks in the
 * footer. `oneClickUrl` is the route handler named by `List-Unsubscribe`, which
 * must answer POST because the accompanying `List-Unsubscribe-Post` header
 * makes the recipient's mail provider post to it directly. Pointing the header
 * at the page silently dropped every provider-issued unsubscribe: the page
 * exports no POST handler, so those requests took a 405 and no suppression row
 * was ever written.
 *
 * Phase C2 Task 11 moved this out of `lib/jobs/runners.ts` — which still
 * re-exports it, so every existing caller and `tests/unit/unsubscribe-one-click.test.ts`
 * import the same name from the same place. It had to become a leaf because
 * `lib/notifications/dispatch.ts` needs it for a marketing email and Task 10
 * makes `runners.ts → campaign-runner.ts → dispatch.ts` a path: importing it
 * back out of `runners.ts` would have closed that into an import cycle. The
 * tree has paid for one of those already — `fix(campaigns): read the campaign
 * status vocabulary from a leaf, not across the admin/repository cycle`.
 */
export function unsubscribeUrls(
  profileId: string,
  locale: "en" | "zh-HK",
  now: Date,
): Readonly<{pageUrl: string; oneClickUrl: string}> {
  const {unsubscribeTokenSecret} = unsubscribeEnv();
  const {appUrl} = appEnv();
  const token = signUnsubscribeToken({
    profileId,
    locale,
    exp: Math.floor(now.getTime() / 1000) + UNSUBSCRIBE_TTL_SECONDS,
  }, unsubscribeTokenSecret);
  const path = locale === "zh-HK" ? "/zh/unsubscribe" : "/unsubscribe";
  const pageUrl = new URL(path, appUrl);
  pageUrl.searchParams.set("token", token);
  // Not locale-prefixed: /api is excluded from the proxy matcher, and the
  // token already carries the locale the confirmation redirect uses.
  const oneClickUrl = new URL("/api/unsubscribe", appUrl);
  oneClickUrl.searchParams.set("token", token);
  return {pageUrl: pageUrl.toString(), oneClickUrl: oneClickUrl.toString()};
}
