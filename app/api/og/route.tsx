import {ImageResponse} from "next/og";
import {z} from "zod";

import {siteConfig} from "@/config/site";
import {isPrivateMediaDeliveryUrl, isRegistrableMediaUrl, hasUrlObfuscation} from "@/lib/media/url";
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
  locale: z.enum(["en", "zh-HK"]).optional(),
}).strict();

const NOTO_SANS_TC_BOLD = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-tc@5.2.8/chinese-traditional-700-normal.woff";

async function notoSansTc(): Promise<ArrayBuffer | null> {
  if (process.env.VITEST) return null;
  try {
    const response = await fetch(NOTO_SANS_TC_BOLD, {signal: AbortSignal.timeout(4000)});
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

function safeImageUrl(value: string | null, requestUrl: URL): string | null {
  if (!value || value.length > 500 || value !== value.trim() || hasUrlObfuscation(value)) return null;
  try {
    const image = new URL(value, requestUrl.origin);
    if (image.origin !== requestUrl.origin || image.username || image.password || image.search || image.hash) return null;
    if (/%(?:2e|2f|5c|25)/i.test(image.pathname)) return null;
    if (!isRegistrableMediaUrl(image.pathname) && !isPrivateMediaDeliveryUrl(image.pathname)) return null;
    return image.toString();
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = paramsSchema.safeParse({
    kind: url.searchParams.get("kind") ?? undefined,
    title: url.searchParams.get("title") ?? undefined,
    eyebrow: url.searchParams.get("eyebrow") ?? undefined,
    locale: url.searchParams.get("locale") ?? undefined,
  });
  // A bad request must not 500: a crawler that gets an error here drops the card for the
  // page entirely, so fall through to the card that needs nothing.
  const entity = parsed.success
    ? {kind: parsed.data.kind as OgEntityKind, title: parsed.data.title, eyebrow: parsed.data.eyebrow, locale: parsed.data.locale, imageUrl: safeImageUrl(url.searchParams.get("image"), url)}
    : {kind: "page" as const, title: siteConfig.publicBrand, eyebrow: siteConfig.shortName, imageUrl: null};

  const {renderer, props} = resolveOgRenderer(entity);
  const logoUrl = new URL("/images/wtia-logo-mono-white.png", url.origin).toString();
  const font = await notoSansTc();
  return new ImageResponse(renderOgCard(renderer, {...props, logoUrl}), {
    width: 1200,
    height: 630,
    fonts: font ? [{name: "Noto Sans TC", data: font, weight: 700, style: "normal"}] : undefined,
  });
}
