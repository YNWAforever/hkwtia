import {createHash} from "node:crypto";

import {showcaseRepository} from "@/lib/db/repos/showcase";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {createShowcaseViewTracker} from "@/lib/showcase/views";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const tracker = createShowcaseViewTracker({
  debounceMs: 5 * 60_000,
  record: (slug) => showcaseRepository.recordView(slug),
});

/**
 * Keyed on the proxy-supplied client IP alone.
 *
 * The user agent used to be mixed in, which defeated the debounce entirely:
 * it is attacker-controlled, so varying it per request produced unlimited
 * distinct viewer keys and turned this unauthenticated GET into an unbounded
 * `recordView` write.
 *
 * Dropping it means visitors behind one NAT share a bucket and the count
 * under-reports. That is the right side to err on — the bias from NAT is
 * bounded and affects a minority by a knowable amount, while inflation was
 * unbounded and available to the very member whose listing it flatters.
 */
function viewerKey(ip: string): string {
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

export async function GET(
  request: Request,
  {params}: Readonly<{params: Promise<{slug: string}>}>,
): Promise<Response> {
  const {slug} = await params;
  if (!slugPattern.test(slug)) return new Response(null, {status: 204});
  // No trusted client IP means no bucket to debounce against; recording anyway
  // would collapse every such caller into one shared, uncountable key.
  const ip = clientIpFromHeaders(request.headers);
  if (!ip) return new Response(null, {status: 204});
  try {
    await tracker.record(slug, viewerKey(ip));
  } catch {
    // View beacons are best effort and must never expose database details.
  }
  return new Response(null, {status: 204});
}
