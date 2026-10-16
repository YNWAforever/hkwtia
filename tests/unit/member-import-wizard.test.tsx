import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

const spies = vi.hoisted(() => ({validate: vi.fn(), read: vi.fn(), confirm: vi.fn(), prepare: vi.fn(), push: vi.fn()}));
vi.mock("@/lib/admin/imports/actions", () => ({validateMemberImportAction: spies.validate, readMemberImportRunAction: spies.read, confirmMemberImportAction: spies.confirm}));
vi.mock("@/lib/admin/batches/actions", () => ({prepareAdminBatchAction: spies.prepare}));
vi.mock("next/navigation", () => ({useRouter: () => ({push: spies.push})}));

import {MemberImportWizard, type MemberImportLabels} from "@/components/admin/member-import-wizard";

const labels: MemberImportLabels = {title: "Import members", steps: ["Upload", "Map", "Validate", "Preview", "Submit"], upload: "Upload file", chooseFile: "Choose file", next: "Next", error: "Import failed", fields: {profileId: "Member ID", displayName: "Name", email: "Email", locale: "Language", planCode: "Plan", renewalAt: "Renewal", tags: "Tags", ownerProfileId: "Owner"}, skip: "Skip", validate: "Validate", preview: "Preview differences", confirm: "Confirm selected", prepare: "Prepare batch", selectAll: "Select all eligible", selected: "{count} selected", status: "Status", reason: "Reason", row: "Row", before: "Current", incoming: "Incoming", total: "Total", create: "Create contact", update: "Update member", conflict: "Conflict", invalid: "Invalid", duplicate: "Duplicate", unchanged: "Unchanged", limits: "CSV or XLSX, 10 MiB and 5000 rows"};

describe("member import wizard", () => {
  afterEach(() => {vi.unstubAllGlobals(); vi.clearAllMocks();});
  it("confirms only explicitly selected eligible rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, json: async () => ({uploadId: "upload-1", headers: ["email"], rowCount: 2})}));
    spies.validate.mockResolvedValue({runId: "run-1", state: "validated", total: 2, create: 1, update: 0, unchanged: 0, duplicate: 0, conflict: 1, invalid: 0});
    spies.read.mockResolvedValue({rows: [
      {rowNumber: 1, status: "create", values: {email: "new@example.test"}, before: {}, targetId: null, expectedVersion: null, reason: null},
      {rowNumber: 2, status: "conflict", values: {email: "held@example.test"}, before: {}, targetId: null, expectedVersion: null, reason: "EMAIL_CANDIDATE_REVIEW"},
    ]});
    spies.confirm.mockResolvedValue({runId: "run-1", state: "confirmed"});
    render(<MemberImportWizard locale="en" labels={{...labels, downloadErrors: "Download row issues"}}/>);
    fireEvent.change(screen.getByLabelText("Choose file"), {target: {files: [new File(["email\nnew@example.test"], "members.csv", {type: "text/csv"})]}});
    fireEvent.click(screen.getByRole("button", {name: "Upload file"}));
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Email"), {target: {value: "email"}});
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Preview differences"})).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", {name: "Preview differences"}));
    expect(screen.getByRole("link", {name: "Download row issues"})).toHaveAttribute("href", "/api/admin/members/import/run-1/errors?locale=en");
    expect(screen.getByRole("checkbox", {name: "Row 2"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Confirm selected"})).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", {name: "Row 1"}));
    fireEvent.click(screen.getByRole("button", {name: "Confirm selected"}));
    await waitFor(() => expect(spies.confirm).toHaveBeenCalledWith({runId: "run-1", rowNumbers: [1]}));
  });
  it("starts with an explicit upload step and states the size and row limits", () => {
    render(<MemberImportWizard locale="en" labels={labels}/>);
    expect(screen.getByRole("heading", {name: "Import members"})).toBeInTheDocument();
    expect(screen.getByText("CSV or XLSX, 10 MiB and 5000 rows")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Upload file"})).toBeDisabled();
  });
});
