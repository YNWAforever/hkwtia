import {z} from "zod";

import type {AppLocale} from "@/i18n/routing";
import type {ShowcaseListing, ShowcaseListingStatus} from "@/lib/db/server-schema";
import {hasUrlObfuscation} from "@/lib/media/url";

const optionalHttpsUrl = z.string().trim().url().refine(
  (value) => new URL(value).protocol === "https:",
  {message: "HTTPS_URL_REQUIRED"},
).nullable().optional().transform((value) => value || null);

/**
 * Logo references are resolved with `absoluteUrl`, which accepts any absolute
 * scheme. Allow only a site-relative path or an explicit HTTPS URL so a stored
 * reference can never resolve to `javascript:` or a protocol-relative host.
 *
 * This value reaches only the schema.org `image` field, which a crawler
 * fetches and we never do, so a remote HTTPS host stays legitimate here — a
 * registry entry meant for rendering is held to the stricter own-origin rule
 * in `lib/media/url.ts` instead.
 *
 * The obfuscation check is load-bearing rather than defensive: without it
 * `"/\\evil.example.com/x.png"` and a tab-separated `"/<TAB>/evil.example.com/x.png"`
 * both pass the `/` prefix test and then resolve to a foreign host.
 */
function isSafeLogoReference(value: string): boolean {
  if (hasUrlObfuscation(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    // Userinfo is rejected so a stored value cannot read as our own domain
    // (`https://hkwtia.org@evil.example.com/logo.png`) while resolving elsewhere.
    if (url.username || url.password) return false;
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

const optionalLogoReference = z.string().trim().max(500).nullable().optional()
  .transform((value) => value?.trim() || null)
  .refine(
    (value) => value === null || isSafeLogoReference(value),
    {message: "LOGO_REFERENCE_INVALID"},
  );

const facet = z.string().trim().min(1).max(64);
const facetList = z.array(facet).max(20);

export const showcaseFilterSchema = z.object({
  category: z.string().trim().max(64).optional(),
  useCase: z.string().trim().max(64).optional(),
  deployment: z.string().trim().max(64).optional(),
  language: z.string().trim().max(32).optional(),
  worksWith: z.string().trim().max(64).optional(),
  q: z.string().trim().max(120).optional(),
}).transform((value) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ""),
) as ShowcaseFilters);

export type ShowcaseFilters = Readonly<{
  category?: string;
  useCase?: string;
  deployment?: string;
  language?: string;
  worksWith?: string;
  q?: string;
}>;

function firstValue(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" ? candidate : undefined;
}

export function parseShowcaseFilters(input: Readonly<Record<string, unknown>>): ShowcaseFilters {
  return showcaseFilterSchema.parse({
    category: firstValue(input.category),
    useCase: firstValue(input.useCase),
    deployment: firstValue(input.deployment),
    language: firstValue(input.language),
    worksWith: firstValue(input.worksWith),
    q: firstValue(input.q),
  });
}

export const listingInputSchema = z.object({
  slug: z.string().trim().min(2).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nameEn: z.string().trim().min(1).max(160),
  nameZhHk: z.string().trim().min(1).max(160),
  taglineEn: z.string().trim().min(1).max(240),
  taglineZhHk: z.string().trim().min(1).max(240),
  descriptionEn: z.string().trim().min(1).max(2_000),
  descriptionZhHk: z.string().trim().min(1).max(2_000),
  category: facet,
  useCases: facetList,
  deploymentOptions: facetList,
  supportedLanguages: facetList,
  worksWith: facetList,
  videoUrl: optionalHttpsUrl,
  caseStudyUrl: optionalHttpsUrl,
  caseStudySummaryEn: z.string().trim().max(2_000).nullable().optional().transform((value) => value?.trim() || null),
  caseStudySummaryZhHk: z.string().trim().max(2_000).nullable().optional().transform((value) => value?.trim() || null),
  logoReference: optionalLogoReference,
});

export type ListingInput = z.infer<typeof listingInputSchema>;

const transitions: Record<ShowcaseListingStatus, readonly ShowcaseListingStatus[]> = {
  draft: ["draft", "pending_review"],
  pending_review: ["pending_review", "published", "rejected"],
  published: ["published", "pending_review"],
  rejected: ["rejected", "pending_review", "draft"],
};

export function transitionListingStatus(
  current: ShowcaseListingStatus,
  next: ShowcaseListingStatus,
): boolean {
  return transitions[current].includes(next);
}

type PublicSource = Pick<
  ShowcaseListing,
  | "slug" | "status" | "premium" | "goneGlobal" | "views" | "memberSince"
  | "nameEn" | "nameZhHk" | "taglineEn" | "taglineZhHk"
  | "descriptionEn" | "descriptionZhHk" | "category" | "useCases"
  | "deploymentOptions" | "supportedLanguages" | "worksWith" | "videoUrl"
  | "caseStudyUrl" | "caseStudySummaryEn" | "caseStudySummaryZhHk" | "logoReference"
> & PublicLogoJoin & Record<string, unknown>;

/**
 * Columns a public read joins in from the media registry. Optional so a test
 * double or a listing with no registered logo needs no extra shape.
 */
export type PublicLogoJoin = Readonly<{
  logoMediaUrl?: string | null;
  logoMediaAltEn?: string | null;
  logoMediaAltZh?: string | null;
}>;

export type PublicListing = Readonly<{
  slug: string;
  premium: boolean;
  goneGlobal: boolean;
  views: number;
  memberSince: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  useCases: readonly string[];
  deploymentOptions: readonly string[];
  supportedLanguages: readonly string[];
  worksWith: readonly string[];
  videoUrl: string | null;
  caseStudyUrl: string | null;
  caseStudySummary: string | null;
  /**
   * The free-text member-supplied reference. It reaches the schema.org `image`
   * field and nothing else — `logo` is what the site renders.
   */
  logoReference: string | null;
  /** Resolved from the curated registry, so this is always an own-origin path. */
  logo: Readonly<{url: string; alt: string}> | null;
}>;

export function toPublicListing(row: PublicSource, locale: AppLocale): PublicListing {
  const chinese = locale === "zh-HK";
  return {
    slug: row.slug,
    premium: row.premium,
    goneGlobal: row.goneGlobal,
    views: row.views,
    memberSince: String(row.memberSince),
    name: chinese ? row.nameZhHk : row.nameEn,
    tagline: chinese ? row.taglineZhHk : row.taglineEn,
    description: chinese ? row.descriptionZhHk : row.descriptionEn,
    category: row.category,
    useCases: row.useCases,
    deploymentOptions: row.deploymentOptions,
    supportedLanguages: row.supportedLanguages,
    worksWith: row.worksWith,
    videoUrl: row.videoUrl,
    caseStudyUrl: row.caseStudyUrl,
    caseStudySummary: chinese ? row.caseStudySummaryZhHk : row.caseStudySummaryEn,
    logoReference: row.logoReference,
    logo: row.logoMediaUrl
      ? {
        url: row.logoMediaUrl,
        // Both alt columns are NOT NULL, so the company name only covers a
        // partial test double rather than any real row.
        alt: (chinese ? row.logoMediaAltZh : row.logoMediaAltEn)
          ?? (chinese ? row.nameZhHk : row.nameEn),
      }
      : null,
  };
}
