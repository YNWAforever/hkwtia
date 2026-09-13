import {ImageResponse} from "next/og";
import {z} from "zod";

import {renderOgCard} from "@/lib/og/renderers";
import {resolveOgRenderer, type OgEntityKind} from "@/lib/og/resolve-renderer";

export const runtime = "edge";

const KINDS = ["event", "member", "showcase", "news", "programme", "milestone", "page"] as const;

// Query parameters are attacker-controlled: the title is drawn into an image served from
// our origin, so it is bounded here as well as in resolveOgRenderer.
const paramsSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(300),
  eyebrow: z.string().trim().min(1).max(60),
  image: z.string().url().max(500).optional(),
}).strict();

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = paramsSchema.safeParse({
    kind: url.searchParams.get("kind") ?? undefined,
    title: url.searchParams.get("title") ?? undefined,
    eyebrow: url.searchParams.get("eyebrow") ?? undefined,
    ...(url.searchParams.get("image") ? {image: url.searchParams.get("image")!} : {}),
  });
  // A bad request must not 500: a crawler that gets an error here drops the card for the
  // page entirely, so fall through to the card that needs nothing.
  const entity = parsed.success
    ? {kind: parsed.data.kind as OgEntityKind, title: parsed.data.title, eyebrow: parsed.data.eyebrow, imageUrl: parsed.data.image ?? null}
    : {kind: "page" as const, title: "WiseTech Hong Kong", eyebrow: "WTIA", imageUrl: null};

  const {renderer, props} = resolveOgRenderer(entity);
  return new ImageResponse(renderOgCard(renderer, props), {width: 1200, height: 630});
}
