import {createRef} from "react";
import {fireEvent, render, screen} from "@testing-library/react";
import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import ts from "typescript";
import {describe, expect, it, vi} from "vitest";
import type {ComponentProps} from "react";
import type NextLink from "next/link";

vi.mock("next/link", () => ({default: ({prefetch, ...props}: ComponentProps<typeof NextLink>) => <a {...props} href={String(props.href)} data-prefetch={String(prefetch ?? "auto")} />}));
import {PrivateLink} from "@/components/internal-shell/private-link";

function eagerImports(source: string): string[] {
  const parsed = ts.createSourceFile("candidate.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return parsed.statements.filter(ts.isImportDeclaration).filter((node) => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "next/link" && node.importClause && !node.importClause.isTypeOnly).map((node) => node.getText(parsed));
}
/**
 * The locale-aware public link family -- `@/i18n/navigation`'s Link and the two WiseTech
 * components built on it -- prefetches by default. A private page that renders one without
 * `prefetch={false}` starts fetching member-only routes the moment the link scrolls into view,
 * which is the exact cost PrivateLink exists to avoid (commit 42930d9a). Returns each offending
 * element; a link to the public home `/` is exempt, since prefetching it is harmless.
 */
const eagerComponentModules: Readonly<Record<string, string>> = {
  "@/i18n/navigation": "Link",
  "@/components/wt/action-link": "ActionLink",
  "@/components/wt/inner-card-grid": "InnerCardGrid",
};
function eagerLinkUsages(source: string): {flagged: string[]; scanned: number} {
  const parsed = ts.createSourceFile("candidate.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const localNames = new Set<string>();
  for (const node of parsed.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.importClause?.isTypeOnly) continue;
    const exported = eagerComponentModules[node.moduleSpecifier.text];
    const bindings = node.importClause?.namedBindings;
    if (!exported || !bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (!element.isTypeOnly && (element.propertyName ?? element.name).text === exported) localNames.add(element.name.text);
    }
  }
  const flagged: string[] = [];
  let scanned = 0;
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && localNames.has(node.tagName.getText(parsed))) {
      scanned += 1;
      const attribute = (name: string) => node.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(parsed) === name);
      const prefetch = attribute("prefetch")?.initializer;
      const href = attribute("href")?.initializer;
      const prefetchOff = prefetch !== undefined && ts.isJsxExpression(prefetch) && prefetch.expression?.kind === ts.SyntaxKind.FalseKeyword;
      const publicHome = href !== undefined && ts.isStringLiteral(href) && href.text === "/";
      if (!prefetchOff && !publicHome) flagged.push(node.getText(parsed));
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return {flagged, scanned};
}
function sources(path: string): string[] {
  return readdirSync(path, {withFileTypes: true}).flatMap((entry) => entry.isDirectory() ? sources(join(path, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(path, entry.name)] : []);
}

describe("private link boundary", () => {
  it.each([undefined, true, "auto"] as const)("disables preload while preserving anchor props and ref (%s)", (prefetch) => {
    const ref = createRef<HTMLAnchorElement>();
    const onClick = vi.fn((event) => event.preventDefault());
    render(<PrivateLink href="/zh/admin/members?q=synthetic" prefetch={prefetch} ref={ref} onClick={onClick} aria-current="page" className="private-link">Members</PrivateLink>);
    const link = screen.getByRole("link", {name: "Members"});
    expect(link).toHaveAttribute("data-prefetch", "false");
    expect(link).toHaveAttribute("href", "/zh/admin/members?q=synthetic");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("private-link");
    expect(ref.current).toBe(link);
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("detects the imports it is meant to catch", () => {
    expect(eagerImports('import Link from "next/link";')).toHaveLength(1);
    expect(eagerImports('import {default as OtherName} from "next/link";')).toHaveLength(1);
    expect(eagerImports('import {PrivateLink} from "@/components/internal-shell/private-link";')).toEqual([]);
    expect(eagerImports('import type {LinkProps} from "next/link";')).toEqual([]);
  });
  it("detects the eager locale-aware links it is meant to catch", () => {
    const hostile = [
      'import {ActionLink} from "@/components/wt/action-link"; const a = <ActionLink href="/portal/company">Go</ActionLink>;',
      'import {InnerCardGrid} from "@/components/wt/inner-card-grid"; const a = <InnerCardGrid items={items} actionLabel="Open" />;',
      'import {Link} from "@/i18n/navigation"; const a = <Link href="/portal/events">Events</Link>;',
      'import {Link as LocaleLink} from "@/i18n/navigation"; const a = <LocaleLink href={href}>Events</LocaleLink>;',
      'import {ActionLink} from "@/components/wt/action-link"; const a = <ActionLink href="/portal" prefetch={true}>Go</ActionLink>;',
      'import {ActionLink} from "@/components/wt/action-link"; const a = <ActionLink href="/portal" prefetch={eager}>Go</ActionLink>;',
    ];
    for (const sample of hostile) expect(eagerLinkUsages(sample).flagged, sample).toHaveLength(1);
    const safe = [
      'import {ActionLink} from "@/components/wt/action-link"; const a = <ActionLink href="/portal/company" prefetch={false}>Go</ActionLink>;',
      'import {InnerCardGrid} from "@/components/wt/inner-card-grid"; const a = <InnerCardGrid items={items} actionLabel="Open" prefetch={false} />;',
      'import {Link} from "@/i18n/navigation"; const a = <Link href="/">Back to the public site</Link>;',
      'import {PrivateLink as Link} from "@/components/internal-shell/private-link"; const a = <Link href="/portal">Portal</Link>;',
      'import {useRouter} from "@/i18n/navigation"; const a = <Other href="/portal" />;',
    ];
    for (const sample of safe) expect(eagerLinkUsages(sample).flagged, sample).toEqual([]);
  });
  it("renders no prefetching locale-aware link to a member route", () => {
    const files = ["app/[locale]/(member)", "components/portal"].flatMap(sources);
    const results = files.map((path) => ({path, ...eagerLinkUsages(readFileSync(path, "utf8"))}));
    // The dashboard's next step, Manage seats and the benefit cards, plus the shell's public `/`
    // link: if the scan stops seeing them, it has stopped looking, not found the tree clean.
    expect(results.reduce((total, result) => total + result.scanned, 0)).toBeGreaterThanOrEqual(4);
    expect(results.filter((result) => result.flagged.length > 0).map(({path, flagged}) => ({path, flagged}))).toEqual([]);
  });
  it("keeps every discovered private caller behind the same boundary", () => {
    const files = ["app/[locale]/(admin)", "app/[locale]/(member)", "components/admin", "components/portal", "components/internal-shell"].flatMap(sources);
    expect(files.length).toBeGreaterThan(100);
    const callers = files.filter((path) => readFileSync(path, "utf8").includes('from "@/components/internal-shell/private-link"'));
    expect(callers.length).toBeGreaterThanOrEqual(51);
    const violations = files.filter((path) => !path.endsWith("private-link.tsx") && eagerImports(readFileSync(path, "utf8")).length > 0);
    expect(violations).toEqual([]);
  });
});
