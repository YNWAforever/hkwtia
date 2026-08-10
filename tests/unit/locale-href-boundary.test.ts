import {readdirSync, readFileSync} from "node:fs";
import {join, relative, resolve} from "node:path";

import ts from "typescript";
import {describe, expect, it} from "vitest";

/**
 * `routing.localePrefix` maps the `zh-HK` locale onto the `/zh` URL prefix, so
 * the locale segment a page receives in `params` is NOT the segment a browser
 * may ask for. Building an href as `` `/${locale}/admin/news` `` therefore
 * emits `/zh-HK/admin/news`, which the middleware does not recognise as a
 * prefixed route: it 404s. Only the English half of such a link works, and only
 * because `/en/...` happens to redirect to the unprefixed path.
 *
 * This was live across the staff CMS: on the Chinese admin every link into the
 * news, page-copy and media editors 404'd, leaving those editors reachable only
 * by typing a URL. The public Chinese events listing 404'd on every event.
 *
 * `localizedPath(locale, path)` is the one place that knows the mapping. This
 * test keeps hand-built locale prefixes from coming back.
 *
 * `revalidatePath` is deliberately NOT covered: it takes the INTERNAL app-router
 * path, where `/zh-HK/...` is correct, and `admin-revalidate-path.test.ts` pins
 * exactly that.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return entry.isFile() && path.endsWith(".tsx") ? [path] : [];
  });
}

/** True for an expression that starts with a `/` literal followed by the locale. */
function startsWithLocaleSegment(node: ts.Expression): boolean {
  const isLocale = (expression: ts.Expression): boolean =>
    (ts.isIdentifier(expression) && expression.text === "locale")
    || (ts.isPropertyAccessExpression(expression) && expression.name.text === "locale");

  // `/${locale}/admin/news`
  if (ts.isTemplateExpression(node)) {
    const [first] = node.templateSpans;
    return first !== undefined
      && node.head.text.startsWith("/")
      && !node.head.text.slice(1).includes("/")
      && isLocale(first.expression);
  }

  // "/" + locale + "/admin/news"
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const flattened: ts.Expression[] = [];
    const flatten = (expression: ts.Expression): void => {
      if (ts.isBinaryExpression(expression)
        && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        flatten(expression.left);
        flatten(expression.right);
        return;
      }
      flattened.push(expression);
    };
    flatten(node);
    const [head, next] = flattened;
    return head !== undefined && next !== undefined
      && ts.isStringLiteral(head) && head.text === "/"
      && isLocale(next);
  }

  return false;
}

function handBuiltLocaleHrefs(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(
    fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const offenders: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node)
      && ts.isIdentifier(node.name)
      && node.name.text === "href"
      && node.initializer
      && ts.isJsxExpression(node.initializer)
      && node.initializer.expression
      && startsWithLocaleSegment(node.initializer.expression)) {
      const {line} = file.getLineAndCharacterOfPosition(node.getStart(file));
      offenders.push(`line ${line + 1}: ${node.getText(file).slice(0, 80)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return offenders;
}

const files = ["app", "components"]
  .flatMap((root) => sourceFiles(resolve(process.cwd(), root)))
  .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"))
  .sort();

describe("locale href boundary", () => {
  it("discovers the rendered surface", () => {
    // Vacuous-pass guard: a broken walk would make every assertion below
    // trivially true.
    expect(files.length).toBeGreaterThanOrEqual(100);
    for (const known of [
      "app/[locale]/(public)/events/page.tsx",
      "app/[locale]/(admin)/admin/news/page.tsx",
      "app/[locale]/(admin)/admin/page-copy/page.tsx",
      "app/[locale]/(admin)/admin/media/page.tsx",
      "components/admin/board-draft-list.tsx",
    ]) {
      expect(files, known).toContain(known);
    }
  });

  it.each(files)("%s builds no href from a raw locale segment", (path) => {
    const offenders = handBuiltLocaleHrefs(readFileSync(resolve(process.cwd(), path), "utf8"), path);

    expect(
      offenders,
      `${path} builds ${offenders.length} href(s) from a raw locale segment:\n`
      + `${offenders.join("\n")}\n`
      + "`zh-HK` is served under the `/zh` prefix, so this emits a URL that 404s. "
      + "Use localizedPath(locale, path) from @/lib/urls.",
    ).toEqual([]);
  });

  it("detects the shapes it is meant to catch", () => {
    const hostile = [
      'const a = <Link href={`/${locale}/admin/news`}>x</Link>;',
      'const b = <Link href={`/${locale}/events/${event.slug}`}>x</Link>;',
      'const c = <a href={"/" + locale + "/admin/media"}>x</a>;',
      'const d = <Link href={`/${props.locale}/admin/reports`}>x</Link>;',
    ];
    for (const source of hostile) {
      expect(handBuiltLocaleHrefs(source, "candidate.tsx"), source).not.toEqual([]);
    }

    const safe = [
      'const e = <Link href={localizedPath(locale, "/admin/news")}>x</Link>;',
      'const f = <Link href={localizedPath(locale, `/events/${event.slug}`)}>x</Link>;',
      'const g = <Link href={`${memberHref}#member-note-body`}>x</Link>;',
      'const h = <Link href={`${localizedPath(locale, "/join")}?plan=${tier.id}`}>x</Link>;',
      'const i = <Link href="/admin/members">x</Link>;',
      // revalidatePath keeps the internal path, and is not an href.
      'const j = revalidatePath(`/${locale}/admin/approvals`);',
      // A locale-shaped segment that is not the prefix position.
      'const k = <Link href={`/api/${locale}/feed`}>x</Link>;',
    ];
    for (const source of safe) {
      expect(handBuiltLocaleHrefs(source, "candidate.tsx"), source).toEqual([]);
    }
  });
});
