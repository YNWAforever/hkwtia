import {canonicalNewsUrl, slugFromCanonicalUrl, type ArchiveArticle, type ArchiveBlock, type InlineNode, type SourceLanguage} from "@/lib/news/archive-document";
import {attr, findElement, hasClass, parseHtml, textContent, unwrapWayback, walk, type HtmlNode} from "@/lib/news/html-fragment";

const SKIP_CLASS = /fusion-meta-info|single-related-posts|fusion-sharing|about-author|sharedaddy|jp-relatedposts|screen-reader-text/;
const LOGO = /wtia_new_logo|favicon|logo-300x108/i;

export function parseNewsListing(html: string): {articleUrls: string[]; nextPageUrls: string[]} {
  const source = unwrapWayback(html);
  const articles = new Set<string>();
  for (const match of source.matchAll(/https?:\/\/(?:www\.)?hkwtia\.org\/\d{4}\/\d{2}\/[^"'#\s<>]+/gi)) {
    try {
      articles.add(canonicalNewsUrl(match[0].replace(/[),.;]+$/, "")));
    } catch {
      // A listing chrome link that is not a post URL stays out of the set.
    }
  }
  const next = [...source.matchAll(/https?:\/\/(?:www\.)?hkwtia\.org\/news\/page\/\d+\/?/gi)].map((match) => match[0]);
  return {articleUrls: [...articles], nextPageUrls: [...new Set(next)]};
}

export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]!);
}

export function extractNewsArticle(html: string, sourceUrl: string): ArchiveArticle {
  const errors: string[] = [];
  const document = unwrapWayback(html);
  const nodes = parseHtml(document);
  const canonical = readCanonical(document, sourceUrl, errors);
  const title = readTitle(nodes, document);
  if (!title) errors.push("missing-title");
  const publishedAt = readMeta(document, "article:published_time");
  if (!publishedAt) errors.push("missing-published-time");
  const modifiedAt = readMeta(document, "article:modified_time");
  const author = cleanAuthor(readMeta(document, "author") ?? "WTIA");
  const categories = readCategories(nodes);
  const sourceId = document.match(/postid-(\d+)/)?.[1] ?? null;
  const content = findElement(nodes, (node) => hasClass(node, "post-content"));
  const blocks = content ? blocksFrom(content.children, canonical) : [];
  const featured = readMeta(document, "og:image");
  const withFeatured = dedupeFiles(featured && !LOGO.test(featured) && !blocks.some((block) => block.type === "figure" && sameImage(block.sourceUrl, featured))
    ? [{type: "figure" as const, sourceUrl: absoluteUrl(featured, canonical) ?? featured, alt: "", caption: [], localPath: null, originalPath: null, sha256: null, error: null, assetStatus: "unresolved" as const}, ...blocks]
    : blocks);
  const plain = plainText(withFeatured);
  if (!plain) errors.push("missing-body");
  const languages = sourceLanguages(`${title ?? ""} ${plain}`);
  const slug = slugFromCanonicalUrl(canonical);
  return {
    canonicalUrl: canonical,
    sourceId,
    slug,
    title: title || slug,
    publishedAt: publishedAt ?? "1970-01-01T00:00:00.000Z",
    modifiedAt,
    visibleDateText: readVisibleDate(document),
    author,
    categories,
    collection: "news-archive",
    sourceLanguages: languages,
    plainText: plain || title || slug,
    blocks: withFeatured,
    extractionStatus: errors.length > 0 ? "failed" : "extracted",
    errors,
    waybackTimestamp: null,
    sourceSha256: null,
  };
}

function readCanonical(html: string, fallback: string, errors: string[]): string {
  const og = readMeta(html, "og:url");
  try {
    return canonicalNewsUrl(og ?? fallback);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "bad-canonical");
    return fallback;
  }
}

function readTitle(nodes: readonly HtmlNode[], html: string): string | null {
  const heading = findElement(nodes, (node) => node.tag === "h1" && hasClass(node, "entry-title"));
  const fromHeading = heading ? textContent(heading.children) : "";
  if (fromHeading) return fromHeading;
  const og = readMeta(html, "og:title");
  if (!og) return null;
  return og.replace(/\s*\|\s*WTIA\b[\s\S]*$/, "").trim() || null;
}

function readMeta(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = metaAttrs(tag);
    const name = attrs.property ?? attrs.name ?? "";
    if (name.toLowerCase() !== key.toLowerCase()) continue;
    const content = attrs.content?.trim();
    if (content) return content;
  }
  return null;
}

function metaAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return attrs;
}

function readCategories(nodes: readonly HtmlNode[]): string[] {
  const categories: string[] = [];
  walk(nodes, (node) => {
    if (node.type !== "element" || node.tag !== "a" || attr(node, "rel") !== "category tag") return;
    const label = textContent(node.children);
    if (label && !categories.includes(label)) categories.push(label);
  });
  return categories;
}

function readVisibleDate(html: string): string | null {
  const match = html.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4}\b/);
  return match?.[0] ?? null;
}

function cleanAuthor(value: string): string {
  const author = value.replace(/\s+/g, " ").trim();
  if (!author || /hong kong wireless technology industry association/i.test(author)) return "WTIA";
  return author.slice(0, 160);
}

function blocksFrom(nodes: readonly HtmlNode[], pageUrl: string): ArchiveBlock[] {
  const blocks: ArchiveBlock[] = [];
  let inline: InlineNode[] = [];
  const flush = () => {
    if (inline.some((node) => node.type !== "text" || node.text.trim())) blocks.push({type: "paragraph", children: inline});
    inline = [];
  };
  for (const node of nodes) {
    if (node.type === "text") {
      // Official Fusion text uses blank lines as paragraphs and has no <p> tags.
      const pieces = node.text.split(/\n[ \t]*\n/);
      pieces.forEach((piece, index) => {
        if (index > 0) flush();
        const text = piece.replace(/[ \t]*\n[ \t]*/g, " ").replace(/[ \t]{2,}/g, " ");
        if (text.trim()) inline.push({type: "text", text});
      });
      continue;
    }
    if (SKIP_CLASS.test(attr(node, "class")) || node.tag === "script" || node.tag === "style" || node.tag === "form" || node.tag === "noscript") continue;
    if (node.tag === "br") {
      inline.push({type: "text", text: " "});
      continue;
    }
    if (isInline(node) && !containsImage(node)) {
      inline.push(...inlineFrom(node, pageUrl));
      if (node.tag === "a" && /\.pdf(?:$|\?)/i.test(attr(node, "href"))) {
        flush();
        const file = fileFrom(node, pageUrl);
        if (file) blocks.push(file);
      }
      continue;
    }
    flush();
    blocks.push(...blockFrom(node, pageUrl));
  }
  flush();
  return dedupeFigures(blocks);
}

function blockFrom(node: HtmlNode, pageUrl: string): ArchiveBlock[] {
  if (node.type !== "element") return [];
  if (SKIP_CLASS.test(attr(node, "class"))) return [];
  if (node.tag === "img") {
    const figure = figureFrom(node, null, pageUrl);
    return figure ? [figure] : [];
  }
  if (node.tag === "a" && containsImage(node)) {
    const image = findElement(node.children, (child) => child.tag === "img");
    const figure = image ? figureFrom(image, attr(node, "href"), pageUrl) : null;
    const file = fileFrom(node, pageUrl);
    return [...(figure ? [figure] : []), ...(file ? [file] : [])];
  }
  if (/^h[1-6]$/.test(node.tag)) {
    const level = Math.min(4, Math.max(2, Number(node.tag[1]))) as 2 | 3 | 4;
    const children = inlineOnly(node, pageUrl);
    return children.length > 0 ? [{type: "heading", level, children}] : [];
  }
  if (node.tag === "ul" || node.tag === "ol") {
    const items = node.children.filter((child) => child.type === "element" && child.tag === "li").map((child) => inlineOnly(child, pageUrl));
    return items.length > 0 ? [{type: "list", ordered: node.tag === "ol", items}] : [];
  }
  if (node.tag === "table") {
    const rows = tableRows(node, pageUrl);
    return rows.length > 0 ? [{type: "table", rows}] : [];
  }
  if (node.tag === "iframe" || node.tag === "embed" || node.tag === "object") {
    const source = absoluteUrl(attr(node, "src") || attr(node, "data"), pageUrl);
    return source ? [{type: "embed", sourceUrl: source, label: source}] : [];
  }
  return blocksFrom(node.children, pageUrl);
}

function figureFrom(image: HtmlNode, linkHref: string | null, pageUrl: string): ArchiveBlock | null {
  const candidates = imageCandidates(image);
  if (linkHref && isImageUrl(linkHref)) candidates.push(linkHref);
  const source = bestImage(candidates.map((url) => absoluteUrl(url, pageUrl)).filter((url): url is string => Boolean(url)));
  if (!source || LOGO.test(source)) return null;
  const alt = attr(image, "alt").replace(/\s+/g, " ").trim();
  return {type: "figure", sourceUrl: source, alt, caption: [], localPath: null, originalPath: null, sha256: null, error: null, assetStatus: "unresolved"};
}

function fileFrom(link: HtmlNode, pageUrl: string): ArchiveBlock | null {
  const href = absoluteUrl(attr(link, "href"), pageUrl);
  if (!href || !/\.pdf($|\?)/i.test(href)) return null;
  const label = textContent(link.type === "element" ? link.children : []) || "PDF";
  return {type: "file", sourceUrl: href.split("?")[0]!, label: label.slice(0, 180) || "PDF", localPath: null, originalPath: null, sha256: null, error: null, assetStatus: "unresolved"};
}

function tableRows(table: HtmlNode, pageUrl: string): InlineNode[][][] {
  const rows: InlineNode[][][] = [];
  walk([table], (node) => {
    if (node.type !== "element" || node.tag !== "tr") return;
    const cells = node.children
      .filter((child) => child.type === "element" && (child.tag === "td" || child.tag === "th"))
      .map((child) => inlineOnly(child, pageUrl));
    if (cells.length > 0) rows.push(cells);
  });
  return rows;
}

function inlineOnly(node: HtmlNode, pageUrl: string): InlineNode[] {
  if (node.type === "text") {
    const text = node.text.replace(/\s+/g, " ");
    return text.trim() ? [{type: "text", text}] : [];
  }
  if (SKIP_CLASS.test(attr(node, "class")) || node.tag === "script" || node.tag === "style") return [];
  return inlineFrom(node, pageUrl);
}

function inlineFrom(node: HtmlNode, pageUrl: string): InlineNode[] {
  if (node.type === "text") {
    const text = node.text.replace(/\s+/g, " ");
    return text ? [{type: "text", text}] : [];
  }
  if (node.tag === "br") return [{type: "text", text: " "}];
  if (node.tag === "strong" || node.tag === "b") return [{type: "strong", children: flatten(node, pageUrl)}];
  if (node.tag === "em" || node.tag === "i") return [{type: "em", children: flatten(node, pageUrl)}];
  if (node.tag === "a") {
    const href = safeHref(attr(node, "href"), pageUrl);
    const children = flatten(node, pageUrl);
    if (!href) return children;
    return [{type: "link", href, children: children.length > 0 ? children : [{type: "text", text: href}]}];
  }
  return flatten(node, pageUrl);
}

function flatten(node: HtmlNode, pageUrl: string): InlineNode[] {
  if (node.type !== "element") return [];
  return node.children.flatMap((child) => child.type === "text" ? inlineFrom(child, pageUrl) : inlineFrom(child, pageUrl));
}

function isInline(node: HtmlNode): boolean {
  return node.type === "element" && ["a", "strong", "b", "em", "i", "span", "small", "sup", "sub"].includes(node.tag);
}

function containsImage(node: HtmlNode): boolean {
  let found = false;
  walk([node], (child) => {
    if (child.type === "element" && child.tag === "img") found = true;
  });
  return found;
}

function imageCandidates(image: HtmlNode): string[] {
  const urls = ["data-orig-src", "data-lazy-src", "data-src", "src"].map((key) => attr(image, key)).filter((url) => /^https?:/i.test(url));
  for (const part of attr(image, "srcset").split(",")) {
    const url = part.trim().split(/\s+/)[0] ?? "";
    if (/^https?:/i.test(url)) urls.push(url);
  }
  return urls;
}

function bestImage(urls: string[]): string | null {
  const unique = [...new Set(urls)];
  unique.sort((left, right) => rank(right) - rank(left));
  return unique[0] ?? null;
}

function rank(url: string): number {
  const sized = url.match(/-(\d+)x(\d+)(?:@2x)?\.(?:jpe?g|png|gif|webp)/i);
  if (!sized) return 10_000_000;
  const area = Number(sized[1]) * Number(sized[2]);
  return /@2x/i.test(url) ? area * 2 : area;
}

function isImageUrl(url: string): boolean {
  return /\.(?:jpe?g|png|gif|webp)(?:$|\?)/i.test(url);
}

function absoluteUrl(value: string, pageUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^(?:javascript|data|vbscript):/i.test(trimmed)) return null;
  try {
    return new URL(trimmed, pageUrl).toString();
  } catch {
    return null;
  }
}

function safeHref(value: string, pageUrl: string): string | null {
  const href = absoluteUrl(value, pageUrl);
  if (!href || !/^https?:/i.test(href)) return null;
  return href;
}

function dedupeFiles(blocks: ArchiveBlock[]): ArchiveBlock[] {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (block.type !== "file") return true;
    if (seen.has(block.sourceUrl)) return false;
    seen.add(block.sourceUrl);
    return true;
  });
}

function dedupeFigures(blocks: ArchiveBlock[]): ArchiveBlock[] {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (block.type !== "figure") return true;
    const stem = imageStem(block.sourceUrl);
    if (seen.has(stem)) return false;
    seen.add(stem);
    return true;
  });
}

function sameImage(left: string, right: string): boolean {
  return imageStem(left) === imageStem(right);
}

function imageStem(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase().replace(/-\d+x\d+(?:@2x)?(?=\.[a-z0-9]+$)/i, "").replace(/-scaled(?=\.[a-z0-9]+$)/i, "");
  } catch {
    return url;
  }
}

export function plainText(blocks: readonly ArchiveBlock[]): string {
  return blocks.map(blockText).join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function blockText(block: ArchiveBlock): string {
  if (block.type === "heading" || block.type === "paragraph") return inlineText(block.children);
  if (block.type === "list") return block.items.map((item) => inlineText(item)).join("\n");
  if (block.type === "table") return block.rows.map((row) => row.map(inlineText).join(" | ")).join("\n");
  if (block.type === "figure") return block.alt;
  if (block.type === "file" || block.type === "embed") return block.label;
  return "";
}

function inlineText(nodes: readonly InlineNode[]): string {
  return nodes.map((node) => node.type === "text" ? node.text : inlineText(node.children)).join("").replace(/\s+/g, " ").trim();
}

export function sourceLanguages(text: string): SourceLanguage[] {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  const languages: SourceLanguage[] = [];
  if (latin >= 20) languages.push("en");
  if (han >= 8) languages.push("zh-Hant");
  return languages.length > 0 ? languages : ["en"];
}
