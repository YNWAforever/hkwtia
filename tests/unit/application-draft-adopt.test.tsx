import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { ApplicationDraftAdopt } from "@/components/admin/application-draft-adopt";
import {
  AdminUnsavedChangesProvider,
  useAdminUnsavedChanges,
} from "@/components/admin/unsaved-changes-guard";
const input = {
  draftId: "10000000-0000-4000-8000-000000000001",
  expectedVersion: 2,
  expectedCaseVersion: "0",
};
const labels = {
  adopt: "Save reviewed note",
  pending: "Saving note",
  description: "Note only; no send or membership/payment changes",
  saveFirst: "Save or discard other edits first",
  states: {
    idle: "",
    adopted: "Note adopted",
    disabled: "Disabled",
    stale: "Reload facts",
    forbidden: "No permission",
    invalid: "Invalid",
    unavailable: "Unavailable",
  },
};
function DirtyCase() {
  const { setDirty } = useAdminUnsavedChanges();
  return <button onClick={() => setDirty(true)}>Edit case</button>;
}
describe("application note adoption", () => {
  it("uses only the approved draft versions for explicit note adoption", async () => {
    const action = vi.fn(async () => ({ status: "adopted" as const }));
    render(
      <ApplicationDraftAdopt
        enabled
        input={input}
        action={action}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: labels.adopt }));
    expect(await screen.findByText("Note adopted")).toBeVisible();
    expect(action).toHaveBeenCalledWith(input);
    expect(refresh).toHaveBeenCalled();
  });
  it("cannot overwrite another editor's unsaved work", () => {
    const action = vi.fn();
    render(
      <AdminUnsavedChangesProvider confirmMessage="Keep edits">
        <DirtyCase />
        <ApplicationDraftAdopt
          enabled
          input={input}
          action={action}
          labels={labels}
        />
      </AdminUnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByText("Edit case"));
    expect(screen.getByRole("button", { name: labels.adopt })).toBeDisabled();
    expect(screen.getByText(labels.saveFirst)).toBeVisible();
    expect(action).not.toHaveBeenCalled();
  });
});
