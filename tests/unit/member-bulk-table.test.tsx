import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const batchSpies = vi.hoisted(() => ({prepare: vi.fn(), push: vi.fn()}));
vi.mock("@/lib/admin/batches/actions", () => ({prepareAdminBatchAction: batchSpies.prepare}));
vi.mock("next/navigation", () => ({useRouter: () => ({push: batchSpies.push})}));

import {MemberBulkTable} from "@/components/admin/member-bulk-table";

const member = (id: string, name: string) => ({profileId: id, membershipId: id, companyId: null, displayName: name, email: `${id}@example.test`, companyName: null, planCode: "community", membershipStatus: "active", renewalAt: null, score: null, matchingMembershipIds: [id]});
const labels = {name: "Name", email: "Email", company: "Company", plan: "Plan", status: "Status", renewal: "Renewal", score: "Score", view: "View", caption: "Members", empty: "No members", unavailable: "Unavailable", previous: "Previous", next: "Next"};
const selectionLabels = {page: "Select this page", all: "Select all {count} matching", clear: "Clear selection", selected: "{count} selected", row: "Select {name}"};

describe("member page selection", () => {
  it("retains a page selection across pagination and clears it when filters change", () => {
    sessionStorage.clear();
    const first = render(<MemberBulkTable locale="en" items={[member("a", "Ada")]} totalMatching={10} labels={labels} selectionLabels={selectionLabels} selectionKey="active" rowHrefs={{a: "/admin/members/a"}} previousHref={null} nextHref={"/admin/members?cursor=next"}/>);
    fireEvent.click(screen.getByRole("checkbox", {name: "Select Ada"}));
    first.unmount();
    const second = render(<MemberBulkTable locale="en" items={[member("b", "Bea")]} totalMatching={10} labels={labels} selectionLabels={selectionLabels} selectionKey="active" rowHrefs={{b: "/admin/members/b"}} previousHref={"/admin/members"} nextHref={null}/>);
    expect(screen.getByRole("status")).toHaveTextContent("1 selected");
    second.unmount();
    render(<MemberBulkTable locale="en" items={[member("b", "Bea")]} totalMatching={2} labels={labels} selectionLabels={selectionLabels} selectionKey="expired" rowHrefs={{b: "/admin/members/b"}} previousHref={null} nextHref={null}/>);
    expect(screen.getByRole("status")).toHaveTextContent("0 selected");
  });

  it("selects this page before an explicit all-matching choice and permits exclusions", () => {
    sessionStorage.clear();
    render(<MemberBulkTable locale="en" items={[member("a", "Ada"), member("b", "Bea")]} totalMatching={10} labels={labels} selectionLabels={selectionLabels} selectionKey="active" rowHrefs={{a: "/admin/members/a", b: "/admin/members/b"}} previousHref={null} nextHref={null}/>);
    fireEvent.click(screen.getByRole("checkbox", {name: "Select this page"}));
    expect(screen.getByRole("status")).toHaveTextContent("2 selected");
    fireEvent.click(screen.getByRole("button", {name: "Select all 10 matching"}));
    expect(screen.getByRole("status")).toHaveTextContent("10 selected");
    fireEvent.click(screen.getByRole("checkbox", {name: "Select Ada"}));
    expect(screen.getByRole("status")).toHaveTextContent("9 selected");
    fireEvent.click(screen.getByRole("button", {name: "Clear selection"}));
    expect(screen.getByRole("status")).toHaveTextContent("0 selected");
  });
});


describe("member selection to batch preview", () => {
  it("submits only the explicit page IDs and navigates to the durable preview", async () => {
    sessionStorage.clear();
    batchSpies.prepare.mockResolvedValueOnce({batchId: "11111111-1111-4111-8111-111111111111"});
    render(<MemberBulkTable locale="en" items={[member("a", "Ada"), member("b", "Bea")]} totalMatching={10} labels={labels} selectionLabels={selectionLabels} selectionKey="active" rowHrefs={{a: "/admin/members/a", b: "/admin/members/b"}} previousHref={null} nextHref={null} batchLabels={{preview: "Preview language change", reason: "Reason", language: "Language", english: "English", chinese: "Chinese", error: "Could not prepare batch"}}/>);
    fireEvent.click(screen.getByRole("checkbox", {name: "Select Ada"}));
    fireEvent.change(screen.getByRole("textbox", {name: "Reason"}), {target: {value: "Member requested English"}});
    fireEvent.click(screen.getByRole("button", {name: "Preview language change"}));
    await waitFor(() => expect(batchSpies.prepare).toHaveBeenCalledWith(expect.objectContaining({operation: "profile_patch", selection: {mode: "ids", profileIds: ["a"]}, payload: {patch: {locale: "en"}, reason: "Member requested English"}})));
    expect(batchSpies.push).toHaveBeenCalledWith("/admin/batches/11111111-1111-4111-8111-111111111111");
  });
});
