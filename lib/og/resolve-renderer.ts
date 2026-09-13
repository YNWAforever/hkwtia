/** Every entity the og route can draw a card for. */
export type OgEntityKind = "event" | "member" | "showcase" | "news" | "programme" | "milestone" | "page";

export type OgEntity = Readonly<{
  kind: OgEntityKind;
  title: string;
  eyebrow: string;
  imageUrl: string | null;
}>;

export type OgRendererName = "photo" | "logo" | "editorial";

export type OgProps = Readonly<{title: string; eyebrow: string; imageUrl?: string}>;

export type ResolvedOgRenderer = Readonly<{renderer: OgRendererName; props: OgProps}>;

/**
 * Satori lays out at a fixed size and will not reflow an over-long headline into
 * something readable, so the title is bounded here rather than in the renderer: the
 * renderers stay presentational, and the bound is testable.
 */
const MAX_TITLE = 120;

function clampTitle(title: string): string {
  return title.length <= MAX_TITLE ? title : `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`;
}

/**
 * Which card an entity gets, and with what.
 *
 * The three treatments exist because the entities genuinely differ, not for variety:
 *
 * - `photo` -- an event's own hero behind a scrim. `events.heroMediaId` is nullable, so
 *   this is the lucky case rather than the guaranteed one.
 * - `logo` -- members and showcase listings store a **logo**, not a photograph. Cropped to
 *   1200x630 and darkened under a scrim it would be mangled, and a member's mark is the
 *   thing the directory trades on. Contained on a light ground instead.
 * - `editorial` -- everything else, and every fallback. `posts` has no image column at
 *   all, so news is always here -- on precisely the pages Article JSON-LD targets.
 */
export function resolveOgRenderer(entity: OgEntity): ResolvedOgRenderer {
  const base = {title: clampTitle(entity.title), eyebrow: entity.eyebrow};

  if (entity.imageUrl) {
    if (entity.kind === "event") return {renderer: "photo", props: {...base, imageUrl: entity.imageUrl}};
    if (entity.kind === "member" || entity.kind === "showcase") {
      return {renderer: "logo", props: {...base, imageUrl: entity.imageUrl}};
    }
  }
  // No image, or a kind with no image treatment: the image is dropped rather than passed
  // to a renderer that would not know what to do with it.
  return {renderer: "editorial", props: base};
}
