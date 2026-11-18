import {createHash} from "node:crypto";

import {z} from "zod";

export const archiveSlugSchema = z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const inlineNodeSchema: z.ZodType<InlineNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({type: z.literal("text"), text: z.string()}).strict(),
    z.object({type: z.literal("strong"), children: z.array(inlineNodeSchema)}).strict(),
    z.object({type: z.literal("em"), children: z.array(inlineNodeSchema)}).strict(),
    z.object({type: z.literal("link"), href: z.string().url(), children: z.array(inlineNodeSchema)}).strict(),
  ]),
);

export type InlineNode =
  | {readonly type: "text"; readonly text: string}
  | {readonly type: "strong"; readonly children: readonly InlineNode[]}
  | {readonly type: "em"; readonly children: readonly InlineNode[]}
  | {readonly type: "link"; readonly href: string; readonly children: readonly InlineNode[]};

const localPathSchema = z.string().regex(/^\/(?:images|files)\/news-archive\/[A-Za-z0-9._/-]+$/);

const blockSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), children: z.array(inlineNodeSchema)}).strict(),
  z.object({type: z.literal("paragraph"), children: z.array(inlineNodeSchema)}).strict(),
  z.object({type: z.literal("list"), ordered: z.boolean(), items: z.array(z.array(inlineNodeSchema))}).strict(),
  z.object({type: z.literal("table"), rows: z.array(z.array(z.array(inlineNodeSchema)))}).strict(),
  z.object({
    type: z.literal("figure"),
    sourceUrl: z.string().url(),
    alt: z.string(),
    caption: z.array(inlineNodeSchema),
    localPath: localPathSchema.nullable(),
    originalPath: localPathSchema.nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    error: z.string().nullable(),
    assetStatus: z.enum(["stored", "open", "unresolved"]),
    /** What the stored bytes are allowed to claim. Absent on earlier Wayback files. */
    byteClaim: z.enum(["wxr-size-match", "current-url-not-wxr-proven", "wxr-size-unknown"]).nullable().optional(),
  }).strict(),
  z.object({
    type: z.literal("file"),
    sourceUrl: z.string().url(),
    label: z.string().min(1),
    localPath: localPathSchema.nullable(),
    originalPath: localPathSchema.nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    error: z.string().nullable(),
    assetStatus: z.enum(["stored", "open", "unresolved"]),
    byteClaim: z.enum(["wxr-size-match", "current-url-not-wxr-proven", "wxr-size-unknown"]).nullable().optional(),
  }).strict(),
  z.object({type: z.literal("embed"), sourceUrl: z.string().url(), label: z.string().min(1)}).strict(),
]);

export type ArchiveBlock = z.infer<typeof blockSchema>;

export const sourceLanguageSchema = z.enum(["en", "zh-Hant"]);
export type SourceLanguage = z.infer<typeof sourceLanguageSchema>;

export const archiveArticleSchema = z.object({
  canonicalUrl: z.string().url(),
  sourceId: z.string().regex(/^\d+$/).nullable(),
  slug: archiveSlugSchema,
  title: z.string().min(1).max(500),
  publishedAt: z.string().datetime({offset: true}),
  modifiedAt: z.string().datetime({offset: true}).nullable(),
  visibleDateText: z.string().nullable(),
  author: z.string().min(1).max(160),
  categories: z.array(z.string().min(1)).max(12),
  sourceLanguages: z.array(sourceLanguageSchema).min(1),
  plainText: z.string().min(1),
  blocks: z.array(blockSchema),
  extractionStatus: z.enum(["extracted", "partial", "failed"]),
  errors: z.array(z.string()),
  waybackTimestamp: z.string().regex(/^\d{14}$/).nullable(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict();

export type ArchiveArticle = z.infer<typeof archiveArticleSchema>;

export type ArchiveNotice = "original" | "fallback-zh" | "fallback-en";

export function archiveNotice(locale: "en" | "zh-HK", languages: readonly SourceLanguage[]): ArchiveNotice {
  const english = languages.includes("en");
  const chinese = languages.includes("zh-Hant");
  if (locale === "en" && chinese && !english) return "fallback-zh";
  if (locale === "zh-HK" && english && !chinese) return "fallback-en";
  return "original";
}

export function dominantTitleLang(title: string): "en" | "zh-Hant" | null {
  const han = title.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latin = title.match(/[A-Za-z]/g)?.length ?? 0;
  const total = han + latin;
  if (total < 4) return null;
  if (han / total >= 0.7) return "zh-Hant";
  if (latin / total >= 0.7) return "en";
  return null;
}

export function titleLangForLocale(title: string, locale: "en" | "zh-HK"): "en" | "zh-Hant" | undefined {
  const dominant = dominantTitleLang(title);
  if (dominant === "zh-Hant" && locale === "en") return "zh-Hant";
  if (dominant === "en" && locale === "zh-HK") return "en";
  return undefined;
}

const TRACKED_HOSTS = ["hkwtia.org", "www.hkwtia.org"];

export function canonicalNewsUrl(input: string): string {
  const url = new URL(input.trim());
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (!TRACKED_HOSTS.includes(url.hostname.toLowerCase()) && host !== "hkwtia.org") {
    throw new Error(`Not an hkwtia.org URL: ${input}`);
  }
  const decoded = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
  const built = new URL(decoded, "https://hkwtia.org");
  const pathname = built.pathname.replace(/\/$/, "").replace(/%[0-9a-f]{2}/gi, (part) => part.toUpperCase());
  return `https://hkwtia.org${pathname}`;
}

export function slugFromCanonicalUrl(canonicalUrl: string): string {
  const path = decodeURIComponent(new URL(canonicalUrl).pathname);
  const last = path.split("/").filter(Boolean).pop() ?? "article";
  const ascii = last.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const words = ascii.split("-").filter((part) => part.length > 0 && !/^(?:19|20)\d{2}$/.test(part));
  const asciiIdentifies = !/[^\u0000-\u007F]/.test(last) || words.join("").length >= 8;
  if (asciiIdentifies && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ascii) && ascii.length >= 3) return ascii.slice(0, 80).replace(/-+$/g, "");
  const year = path.match(/\/((?:19|20)\d{2})\//)?.[1] ?? "undated";
  const hash = createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 10);
  return `archive-${year}-${hash}`;
}
