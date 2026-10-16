import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/lib/admin/member-view-actions", () => ({saveMemberViewAction: vi.fn()}));
import {MemberSavedViews} from "@/components/admin/member-saved-views";
import {adminMemberQuerySchema} from "@/lib/admin/member-query";

const query = adminMemberQuerySchema.parse({status: ["active"]});
const labels = {title: "Saved views", name: "View name", save: "Save view", saved: "Saved", invalid: "Invalid", error: "Unavailable", shared: "Share with staff", empty: "No saved views"};

describe("member saved views", () => {
  it("renders a personal view as a local filter URL and shows a named save form", () => {
    const html = renderToStaticMarkup(<MemberSavedViews locale="en" query={query} views={[{id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ownerProfileId: "staff", name: "Active", query, shared: false, updatedAt: "2026-09-27T00:00:00Z"}]} canShare={false} labels={labels}/>);
    expect(html).toContain("Saved views");
    expect(html).toContain('href="/admin/members?status=active"');
    expect(html).toContain('name="name"');
    expect(html).not.toContain('name="shared"');
  });
});
