import {createHash} from "node:crypto";

import {showcaseRepository} from "@/lib/db/repos/showcase";
import {createShowcaseViewTracker} from "@/lib/showcase/views";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const tracker = createShowcaseViewTracker({
  debounceMs: 5 * 60_000,
  record: (slug) => showcaseRepository.recordView(slug),
});

function viewerKey(request: Request): string {
  const source = [
    request.headers.get("x-vercel-forwarded-for") ?? "",
    request.headers.get("user-agent") ?? "",
  ].join("|");
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export async function GET(
  request: Request,
  {params}: Readonly<{params: Promise<{slug: string}>}>,
): Promise<Response> {
  const {slug} = await params;
  if (!slugPattern.test(slug)) return new Response(null, {status: 204});
  try {
    await tracker.record(slug, viewerKey(request));
  } catch {
    // View beacons are best effort and must never expose database details.
  }
  return new Response(null, {status: 204});
}
