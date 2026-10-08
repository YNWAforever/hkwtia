import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";

// ActionLink (inside HonestEmpty) uses the locale-aware Link, which needs an intl provider.
vi.mock("@/i18n/navigation", () => ({Link: ({href, children, ...rest}: {href: string; children: React.ReactNode}) => <a href={href} {...rest}>{children}</a>}));

import {DirectoryResults} from "@/components/portal/directory-results";

const d = en.Portal.directory;
const labels = {
  search: d.search, showingFor: d.showingFor.replace("{query}", "robotics"), clear: d.clear, empty: d.empty,
  emptyQuery: d.emptyQuery.replace("{query}", "robotics"), emptyQueryHint: d.emptyQueryHint, emptyNone: d.emptyNone, emptyNoneAction: d.emptyNoneAction,
  next: d.next, first: d.first, pages: d.pages, company: d.company, industry: d.industry, sizeBand: d.sizeBand,
};
const record = {userId: "u1", companyId: "c1", displayName: "Ada Chan", jobTitle: "CTO", companyDisplayName: "Acme", industry: "Robotics", sizeBand: "11-50"};
const render = (props: Partial<React.ComponentProps<typeof DirectoryResults>>) =>
  renderToStaticMarkup(<DirectoryResults labels={labels} locale="en" page={{items: [record], nextCursor: null}} query="" {...props} />);

describe("DirectoryResults", () => {
  it("labels the search input", () => {
    expect(render({})).toMatch(/<label for="directory-search">Search members<\/label>/);
  });

  it("shows the active query with a clear link back to the bare directory", () => {
    const html = render({query: "robotics"});
    expect(html).toContain("Showing results for “robotics”");
    expect(html).toMatch(/href="\/portal\/directory">Clear search</);
    expect(render({})).not.toContain("Clear search");
  });

  it("renders cards as a definition list without label prefixes", () => {
    const html = render({});
    expect(html).toContain("<dl");
    expect(html).toContain("<dt>Company</dt><dd>Acme</dd>");
    expect(html).toContain("<dt>Industry</dt><dd>Robotics</dd>");
    expect(html).toContain("<dt>Company size</dt><dd>11-50</dd>");
    expect(html).not.toContain("Company:");
  });

  it("puts Next page after Back to first page and keeps the search in both", () => {
    const html = render({query: "robotics", cursor: "c1", page: {items: [record], nextCursor: "c2"}});
    expect(html.indexOf("Back to first page")).toBeGreaterThan(-1);
    expect(html.indexOf("Next page")).toBeGreaterThan(html.indexOf("Back to first page"));
    expect(html).toContain('href="/portal/directory?q=robotics"');
    expect(html).toContain('href="/portal/directory?q=robotics&amp;cursor=c2"');
  });

  it("has no paging on a single first page", () => {
    expect(render({})).not.toContain("Back to first page");
  });

  it("explains an empty search", () => {
    const html = render({query: "robotics", page: {items: [], nextCursor: null}});
    expect(html).toContain("No members match “robotics”");
    // One helpful line under the title, not "No opted-in members found." repeating it.
    expect(html).toContain("Try a company name or industry.");
    expect(html).not.toContain(d.empty);
    expect(html).toMatch(/<h2>No members match/);
    expect(html).not.toContain("Update your profile");
  });

  it("treats a whitespace-only query as no search", () => {
    const html = render({query: "   ", page: {items: [], nextCursor: null}});
    expect(html).not.toContain("Showing results for");
    expect(html).not.toContain("Clear search");
    expect(html).toContain(d.emptyNone);
  });

  it("names the paging landmark for pages, not search, and marks the form as a search", () => {
    const html = render({query: "robotics", cursor: "c1", page: {items: [record], nextCursor: "c2"}});
    expect(html).toContain('<nav aria-label="Directory pages" class="portal-paging">');
    expect(html).not.toContain('<nav aria-label="Search members"');
    expect(html).toMatch(/<form[^>]*role="search"/);
  });

  it("explains an empty directory and points at the profile", () => {
    const html = render({page: {items: [], nextCursor: null}});
    expect(html).toContain(d.emptyNone);
    expect(html).toMatch(/href="\/portal\/profile">Update your profile</);
  });
});
