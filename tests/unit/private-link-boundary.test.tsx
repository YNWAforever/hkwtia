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
  it("keeps every discovered private caller behind the same boundary", () => {
    const files = ["app/[locale]/(admin)", "app/[locale]/(member)", "components/admin", "components/portal", "components/internal-shell"].flatMap(sources);
    expect(files.length).toBeGreaterThan(100);
    const callers = files.filter((path) => readFileSync(path, "utf8").includes('from "@/components/internal-shell/private-link"'));
    expect(callers.length).toBeGreaterThanOrEqual(51);
    const violations = files.filter((path) => !path.endsWith("private-link.tsx") && eagerImports(readFileSync(path, "utf8")).length > 0);
    expect(violations).toEqual([]);
  });
});
