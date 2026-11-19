/**
 * Turns Avada/Fusion builder shortcodes into HTML the article renderer can read.
 * Layout attributes are dropped. Inner wording, headings, links, images, and tables stay.
 */

const LAYOUT_TAGS = new Set([
  "fusion_builder_container",
  "fusion_builder_row",
  "fusion_builder_column",
  "fusion_text",
  "fusion_content_boxes",
]);

type Shortcode = Readonly<{
  name: string;
  attrs: Readonly<Record<string, string>>;
  selfClosing: boolean;
  end: number;
}>;

export function unwrapFusionContent(content: string): string {
  return renderRegion(content).replace(/\n{3,}/g, "\n\n").trim();
}

function renderRegion(input: string): string {
  let index = 0;
  let output = "";
  while (index < input.length) {
    const start = input.indexOf("[", index);
    if (start < 0) {
      output += input.slice(index);
      break;
    }
    output += input.slice(index, start);
    const tag = readShortcode(input, start);
    if (!tag || tag.name.startsWith("/")) {
      output += "[";
      index = start + 1;
      continue;
    }
    if (tag.selfClosing) {
      output += renderTag(tag.name, tag.attrs, "");
      index = tag.end;
      continue;
    }
    const close = findClose(input, tag.end, tag.name);
    const inner = renderRegion(input.slice(tag.end, close.start));
    output += renderTag(tag.name, tag.attrs, inner);
    index = close.end;
  }
  return output;
}

function renderTag(name: string, attrs: Readonly<Record<string, string>>, inner: string): string {
  const tag = name.toLowerCase();
  if (LAYOUT_TAGS.has(tag)) return inner;
  if (tag === "fusion_content_box") {
    const title = attrs.title?.trim() ?? "";
    const href = attrs.link?.trim() ?? "";
    const label = attrs.linktext?.trim() || href;
    const heading = title ? `<h2>${escapeHtml(title)}</h2>` : "";
    const link = href ? `<p><a href="${escapeAttr(href)}">${escapeHtml(label)}</a></p>` : "";
    return `${heading}${inner}${link}`;
  }
  if (tag === "fusion_imageframe") {
    const src = inner.trim();
    if (!/^https?:\/\//i.test(src)) return inner;
    const alt = attrs.alt?.trim() ?? "";
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" />`;
  }
  if (tag === "pdf-embedder") {
    const raw = attrs.url?.trim() ?? "";
    if (!raw || /^(?:javascript|data):/i.test(raw)) return "";
    const href = raw.startsWith("/") ? `https://hkwtia.org${raw}` : raw;
    if (!/^https?:\/\//i.test(href)) return "";
    const label = href.split("/").pop() || "PDF";
    return `<p><a href="${escapeAttr(href)}">${escapeHtml(label)}</a></p>`;
  }
  if (tag === "fusion_button") {
    const href = attrs.link?.trim() ?? "";
    const label = inner.trim() || attrs.title?.trim() || href;
    if (!href) return label;
    return `<p><a href="${escapeAttr(href)}">${escapeHtml(label)}</a></p>`;
  }
  if (tag.startsWith("fusion_")) return inner;
  return inner;
}

function readShortcode(input: string, start: number): Shortcode | null {
  if (input[start] !== "[") return null;
  let index = start + 1;
  if (input[index] === "/") index += 1;
  const name = /^[A-Za-z][\w-]*/.exec(input.slice(index));
  if (!name) return null;
  index += name[0].length;
  const attrs: Record<string, string> = {};
  while (index < input.length) {
    while (input[index] === " " || input[index] === "\n" || input[index] === "\t") index += 1;
    if (input[index] === "]" || (input[index] === "/" && input[index + 1] === "]")) break;
    const attr = /^([A-Za-z_:][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/.exec(input.slice(index));
    if (!attr) break;
    index += attr[0].length;
    attrs[attr[1]!.toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? "";
  }
  const selfClosing = input[index] === "/";
  if (selfClosing) index += 1;
  if (input[index] !== "]") return null;
  return {name: name[0], attrs, selfClosing, end: index + 1};
}

function findClose(input: string, from: number, name: string): {start: number; end: number} {
  let depth = 1;
  let index = from;
  const open = `[${name}`;
  const close = `[/${name}]`;
  while (index < input.length && depth > 0) {
    const nextOpen = input.indexOf(open, index);
    const nextClose = input.indexOf(close, index);
    if (nextClose < 0) return {start: input.length, end: input.length};
    if (nextOpen >= 0 && nextOpen < nextClose) {
      const tag = readShortcode(input, nextOpen);
      if (tag && tag.name.toLowerCase() === name.toLowerCase() && !input.startsWith("[/", nextOpen)) {
        depth += 1;
        index = tag.end;
        continue;
      }
    }
    depth -= 1;
    if (depth === 0) return {start: nextClose, end: nextClose + close.length};
    index = nextClose + close.length;
  }
  return {start: input.length, end: input.length};
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
