import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";

// ActionLink (inside HonestEmpty) uses the locale-aware Link, which needs an intl provider.
vi.mock("@/i18n/navigation", () => ({Link: ({href, children, ...rest}: {href: string; children: React.ReactNode}) => <a href={href} {...rest}>{children}</a>}));

import {DocumentList} from "@/components/portal/document-list";
import type {DocumentItem} from "@/lib/portal/content";

const d = en.Portal.documents;
const labels = {
  receiptsHeading: d.receiptsHeading, resourcesHeading: d.resourcesHeading, openReceipt: d.openReceipt, openDocument: d.openDocument,
  newTab: en.Portal.common.newTab, empty: d.empty, emptyLine: d.emptyLine, emptyAction: d.emptyAction,
};
const item = (over: Partial<DocumentItem>): DocumentItem => ({
  id: "d1", title: "Doc", kind: "resource", url: "https://example.org/a.pdf", issuedAt: "2026-09-01T00:00:00.000Z", amount: null, currency: null, status: null, ...over,
});
const render = (items: DocumentItem[]) => renderToStaticMarkup(<DocumentList items={items} labels={labels} locale="en" />);

describe("DocumentList", () => {
  it("labels receipt and resource actions by kind", () => {
    const html = render([item({id: "r1", kind: "receipt", title: "R"}), item({id: "d1", title: "D"})]);
    expect(html).toContain("Open receipt");
    expect(html).toContain("Open document");
  });

  it("renders Receipts then WTIA resources, and only non-empty groups", () => {
    const both = render([item({id: "d1", title: "D"}), item({id: "r1", kind: "receipt", title: "R"})]);
    expect(both.indexOf("Receipts")).toBeGreaterThan(-1);
    expect(both.indexOf("WTIA resources")).toBeGreaterThan(both.indexOf("Receipts"));
    const only = render([item({})]);
    expect(only).toContain("WTIA resources");
    expect(only).not.toContain("Receipts");
  });

  it("formats the date in long form", () => {
    const html = render([item({})]);
    expect(html).toContain("1 September 2026");
    expect(html).not.toContain("9/1/2026");
  });

  it("has no action without a url and no date without issuedAt", () => {
    const html = render([item({url: null, issuedAt: null})]);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<time");
  });

  it("opens external links in a new tab with a screen-reader notice", () => {
    const html = render([item({})]);
    expect(html).toContain('target="_blank"');
    expect(html).toMatch(/rel="[^"]*noopener/);
    expect(html).toContain('<span class="sr-only"> (opens in a new tab)</span>');
  });

  it("keeps same-site links in the same tab", () => {
    const html = render([item({url: "/files/a.pdf"})]);
    expect(html).not.toContain("_blank");
    expect(html).not.toContain("opens in a new tab");
  });

  it("points an empty list at billing", () => {
    const html = render([]);
    expect(html).toContain("No documents are available yet.");
    expect(html).toContain("Receipts appear here after your first payment.");
    expect(html).toMatch(/href="\/portal\/billing"[^>]*>Go to billing/);
  });
});
