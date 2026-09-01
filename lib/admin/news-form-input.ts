import {z} from "zod";

/**
 * Pure FormData → domain input. Kept free of `server-only` so the client form
 * can share the published-checkbox contract.
 */
function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * `posts.publishedAt` is a nullable timestamp rather than a boolean, so the
 * familiar checkbox maps to an instant. An already-published post keeps its
 * original timestamp so re-saving an edit does not reorder the feed.
 */
export function newsPublishedAt(
  formData: FormData,
  current: Date | null = null,
  now: () => Date = () => new Date(),
): Date | null {
  if (formData.get("published") !== "on") return null;
  return current ?? now();
}

export function newsFormInput(
  formData: FormData,
  current: Date | null = null,
  now?: () => Date,
): Readonly<Record<string, unknown>> {
  return {
    slug: text(formData, "slug"),
    titleEn: text(formData, "titleEn"),
    titleZh: text(formData, "titleZh"),
    bodyMdx: text(formData, "bodyMdx"),
    bodyMdxZhHk: text(formData, "bodyMdxZhHk"),
    author: text(formData, "author"),
    publishedAt: newsPublishedAt(formData, current, now),
  };
}

/** Surfaced as a field error on `slug` rather than a generic failure. */
export function isSlugConflict(error: unknown): boolean {
  return error instanceof z.ZodError
    && error.issues.some((issue) =>
      issue.path[0] === "slug" && issue.message === "NEWS_SLUG_TAKEN");
}
