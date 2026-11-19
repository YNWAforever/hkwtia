/**
 * A small HTML fragment parser for archived WordPress pages.
 * It never executes markup. Script and style bodies are opaque text.
 */

export type HtmlAttrs = Readonly<Record<string, string>>;

export type HtmlNode =
  | {readonly type: "text"; readonly text: string}
  | {readonly type: "element"; readonly tag: string; readonly attrs: HtmlAttrs; readonly children: readonly HtmlNode[]};

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title", "noscript"]);

export function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, body: string) => {
    const key = body.toLowerCase();
    if (key === "amp") return "&";
    if (key === "lt") return "<";
    if (key === "gt") return ">";
    if (key === "quot") return "\"";
    if (key === "apos") return "'";
    if (key === "nbsp") return " ";
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return entity;
  });
}

export function unwrapWayback(html: string): string {
  return html.replace(/https?:\/\/web\.archive\.org\/web\/\d+(?:[a-z]{2}_)?\//gi, "");
}

export function parseHtml(input: string): readonly HtmlNode[] {
  const html = unwrapWayback(input).replace(/\r\n?/g, "\n");
  const root: HtmlNode[] = [];
  const stack: {tag: string; attrs: HtmlAttrs; children: HtmlNode[]}[] = [];
  let index = 0;

  const parent = () => (stack.length > 0 ? stack[stack.length - 1]!.children : root);

  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      const text = decodeHtml(html.slice(index, next < 0 ? html.length : next));
      if (text.length > 0) parent().push({type: "text", text});
      index = next < 0 ? html.length : next;
      continue;
    }
    if (html.startsWith("</", index)) {
      const close = readTag(html, index);
      if (!close) {
        parent().push({type: "text", text: "<"});
        index += 1;
        continue;
      }
      index = close.end;
      const name = close.name.toLowerCase();
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        if (stack[depth]!.tag === name) {
          // An unclosed <p> must stay inside the element that closes around it.
          // Pushing it out used to drop the PDF link that followed a Fusion column.
          while (stack.length > depth + 1) {
            const inner = stack.pop()!;
            stack[stack.length - 1]!.children.push(elementNode(inner));
          }
          const closed = stack.pop()!;
          const element = elementNode(closed);
          if (stack.length === 0) root.push(element);
          else stack[stack.length - 1]!.children.push(element);
          break;
        }
      }
      continue;
    }
    const tag = readTag(html, index);
    if (!tag) {
      parent().push({type: "text", text: "<"});
      index += 1;
      continue;
    }
    index = tag.end;
    const name = tag.name.toLowerCase();
    if (tag.closing) continue;
    if (VOID_TAGS.has(name) || tag.selfClosing) {
      parent().push({type: "element", tag: name, attrs: tag.attrs, children: []});
      continue;
    }
    if (RAW_TEXT_TAGS.has(name)) {
      const closer = new RegExp(`</${name}\\s*>`, "i");
      const rest = html.slice(index);
      const found = closer.exec(rest);
      const raw = found ? rest.slice(0, found.index) : rest;
      index += found ? found.index + found[0].length : rest.length;
      const children: HtmlNode[] = raw.length > 0 ? [{type: "text", text: name === "title" ? decodeHtml(raw) : raw}] : [];
      parent().push({type: "element", tag: name, attrs: tag.attrs, children});
      continue;
    }
    stack.push({tag: name, attrs: tag.attrs, children: []});
  }

  while (stack.length > 0) {
    const dangling = stack.shift()!;
    const element = elementNode(dangling);
    (stack.length > 0 ? stack[0]!.children : root).push(element);
  }
  return root;
}

function elementNode(frame: {tag: string; attrs: HtmlAttrs; children: HtmlNode[]}): HtmlNode {
  return {type: "element", tag: frame.tag, attrs: frame.attrs, children: frame.children};
}

function readTag(html: string, start: number): {name: string; attrs: HtmlAttrs; selfClosing: boolean; closing: boolean; end: number} | null {
  let index = start + 1;
  if (html[index] === "/") index += 1;
  const nameMatch = /^([A-Za-z][\w:-]*)/.exec(html.slice(index));
  if (!nameMatch) return null;
  index += nameMatch[1]!.length;
  const attrs: Record<string, string> = {};
  while (index < html.length) {
    while (html[index] === " " || html[index] === "\n" || html[index] === "\t" || html[index] === "\r" || html[index] === "/") {
      if (html[index] === "/" && html[index + 1] === ">") break;
      index += 1;
    }
    if (html[index] === ">" || html.startsWith("/>", index)) break;
    const attr = /^([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(html.slice(index));
    if (!attr) break;
    index += attr[0].length;
    const raw = attr[2] ?? attr[3] ?? attr[4] ?? "";
    attrs[attr[1]!.toLowerCase()] = decodeHtml(raw);
  }
  const selfClosing = html[index] === "/";
  if (selfClosing) index += 1;
  if (html[index] === ">") index += 1;
  return {name: nameMatch[1]!, attrs, selfClosing, closing: html[start + 1] === "/", end: index};
}

export function classTokens(attrs: HtmlAttrs): readonly string[] {
  return (attrs.class ?? "").split(/\s+/).filter(Boolean);
}

export function hasClass(node: HtmlNode, token: string): boolean {
  return node.type === "element" && classTokens(node.attrs).includes(token);
}

export function walk(nodes: readonly HtmlNode[], visit: (node: HtmlNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.type === "element") walk(node.children, visit);
  }
}

export function findElement(nodes: readonly HtmlNode[], predicate: (node: HtmlNode & {type: "element"}) => boolean): (HtmlNode & {type: "element"}) | null {
  let found: (HtmlNode & {type: "element"}) | null = null;
  walk(nodes, (node) => {
    if (!found && node.type === "element" && predicate(node)) found = node;
  });
  return found;
}

export function textContent(nodes: readonly HtmlNode[]): string {
  let text = "";
  walk(nodes, (node) => {
    if (node.type === "text") text += node.text;
  });
  return text.replace(/\s+/g, " ").trim();
}

export function attr(node: HtmlNode, name: string): string {
  return node.type === "element" ? node.attrs[name] ?? "" : "";
}
