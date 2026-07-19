import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {AdminNav} from "@/components/admin/admin-nav";
import {MemberTable} from "@/components/admin/member-table";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("admin presentation", () => {
  it.each([en.Admin, zh.Admin])("renders one page heading, an accessible nav, a table caption, and translated empty state", (labels) => {
    const nav = renderToStaticMarkup(<AdminNav locale="en" labels={labels.navigation}/>);
    const table = renderToStaticMarkup(<MemberTable labels={labels.members} page={{items: [], nextCursor: null}} query="" locale="en"/>);
    const page = renderToStaticMarkup(<main><h1>{labels.members.title}</h1>{table}</main>);

    expect(page.match(/<h1/g)).toHaveLength(1);
    expect(nav).toContain(`aria-label="${labels.navigation.label}"`);
    expect(table).toMatch(new RegExp(`<caption[^>]*>${labels.members.caption}</caption>`));
    expect(table).toContain(labels.members.empty);
  });
});
