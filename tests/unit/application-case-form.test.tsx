import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApplicationCaseForm } from "@/components/admin/application-case-form";
import type { ApplicationCase } from "@/lib/admin/application-case-types";
const labels = {
  title: "Synthetic follow-up",
  description: "Synthetic description",
  owner: "Owner",
  unassigned: "Unassigned",
  due: "Due",
  missing: "Missing",
  nextAction: "Next action",
  note: "Note",
  save: "Save",
  saving: "Saving",
  saved: "Saved",
  conflict: "Conflict",
  error: "Error",
  refresh: "Reload",
  missingFields: { companyWebsite: "Website" },
  nextActions: { none: "None", await_documents: "Await documents" },
};
const original: ApplicationCase = {
  application: {
    id: "10000000-0000-4000-8000-000000000001",
    profileId: "profile",
    name: "Synthetic applicant",
    companyId: null,
    companyName: null,
    planCode: "startup",
    status: "draft",
    step: "profile",
  },
  membership: null,
  payment: null,
  version: "10000000-0000-4000-8000-000000000002",
  ownerProfileId: null,
  dueAt: null,
  missingFields: [],
  nextActionCode: "none",
  timeline: [],
};
const action = async () => ({
  status: "saved" as const,
  version: "10000000-0000-4000-8000-000000000003",
});
describe("application case editor snapshot", () => {
  it("an external refresh cannot upgrade the CAS version attached to unsaved fields", () => {
    const { container, rerender } = render(
      <ApplicationCaseForm
        record={original}
        owners={[]}
        labels={labels}
        action={action}
        refreshHref="/admin/members/queue/example"
      />,
    );
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Unsaved synthetic note" },
    });
    rerender(
      <ApplicationCaseForm
        record={{
          ...original,
          version: "10000000-0000-4000-8000-000000000099",
          nextActionCode: "await_documents",
        }}
        owners={[]}
        labels={labels}
        action={action}
        refreshHref="/admin/members/queue/example"
      />,
    );
    expect(screen.getByLabelText("Note")).toHaveValue("Unsaved synthetic note");
    expect(
      container.querySelector('input[name="expectedVersion"]'),
    ).toHaveValue(original.version);
  });
});

const proposal = {
  factsHash: "a".repeat(64),
  caseVersion: original.version,
  triage: {
    missingFields: ["displayName"] as const,
    validationIssues: [],
    nextActionCode: "await_documents" as const,
    paymentDisposition: "none" as const,
  },
  note: "Synthetic required-name follow-up",
  labels: {
    organize: "Organize case",
    apply: "Use suggestion",
    ruleOnly: "Form rules; no AI request",
    noneMissing: "No required fields missing",
    validation: "Manual validation required",
    stale: "Reload current case before applying",
    noteKept: "Your existing note is retained",
    description: "Follow-up only; no membership/payment/send changes",
  },
};
describe("application rule proposal stays in manual follow-up", () => {
  it("explicitly adopts required-field suggestions without sending or saving, retaining manual note and case version", () => {
    const saved = vi.fn(action),
      { container } = render(
        <ApplicationCaseForm
          record={original}
          owners={[]}
          labels={{
            ...labels,
            missingFields: { displayName: "Name", companyWebsite: "Website" },
          }}
          action={saved}
          refreshHref="/admin/members/queue/example"
          {...{ triageProposal: proposal }}
        />,
      );
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Existing unsaved note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize case" }));
    expect(screen.getByText("Form rules; no AI request")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect(screen.getByRole("checkbox", { name: "Name" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Website" })).not.toBeChecked();
    expect(screen.getByLabelText("Next action")).toHaveValue("await_documents");
    expect(screen.getByLabelText("Note")).toHaveValue("Existing unsaved note");
    expect(
      container.querySelector('input[name="expectedVersion"]'),
    ).toHaveValue(original.version);
    expect(saved).not.toHaveBeenCalled();
  });
  it("fills the proposed note only when the manual note is empty", () => {
    render(
      <ApplicationCaseForm
        record={original}
        owners={[]}
        labels={labels}
        action={action}
        refreshHref="/admin/members/queue/example"
        {...{ triageProposal: proposal }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Organize case" }));
    fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect(screen.getByLabelText("Note")).toHaveValue(proposal.note);
  });
  it("changed source proposals cannot silently upgrade an existing editor snapshot", () => {
    const { rerender } = render(
      <ApplicationCaseForm
        record={original}
        owners={[]}
        labels={labels}
        action={action}
        refreshHref="/admin/members/queue/example"
        {...{ triageProposal: proposal }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Organize case" }));
    rerender(
      <ApplicationCaseForm
        record={original}
        owners={[]}
        labels={labels}
        action={action}
        refreshHref="/admin/members/queue/example"
        {...{ triageProposal: { ...proposal, factsHash: "b".repeat(64) } }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Use suggestion" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Reload current case before applying"),
    ).toBeVisible();
  });
});

describe("application AI drafting remains separate from manual follow-up", () => {
  const draftLabels = {
    request: "Draft with AI",
    requesting: "Drafting",
    disabled: "AI is not enabled; manual follow-up remains available",
    review: "Review draft",
    states: {
      idle: "",
      created: "Draft needs review",
      disabled: "Disabled",
      configuration: "Needs approved route",
      busy: "Already in progress",
      unknown: "Reconcile the existing request",
      stale: "Reload facts",
      forbidden: "Not authorized",
      unavailable: "Temporarily unavailable",
      invalid: "Invalid case",
    },
  };
  it("keeps a disabled new AI capability separate from the usable manual form", () => {
    render(
      <ApplicationCaseForm
        record={original}
        owners={[]}
        labels={labels}
        action={action}
        refreshHref="/admin/members/queue/example"
        {...{
          draftRequest: {
            enabled: false,
            action: async () => ({ status: "disabled" as const }),
            labels: draftLabels,
          },
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Draft with AI" }),
    ).toBeDisabled();
    expect(screen.getByText(draftLabels.disabled)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
  it("an enabled request only creates a review link and retains unsaved manual notes", async () => {
    const request = vi.fn(async () => ({
      status: "created" as const,
      reviewHref: "/admin/tasks?draft=10000000-0000-4000-8000-000000000002",
    }));
    render(
      <ApplicationCaseForm
        record={original}
        owners={[]}
        labels={labels}
        action={action}
        refreshHref="/admin/members/queue/example"
        {...{
          draftRequest: { enabled: true, action: request, labels: draftLabels },
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Existing unsaved case note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft with AI" }));
    expect(
      await screen.findByRole("link", { name: "Review draft" }),
    ).toHaveAttribute(
      "href",
      "/admin/tasks?draft=10000000-0000-4000-8000-000000000002",
    );
    expect(screen.getByLabelText("Note")).toHaveValue(
      "Existing unsaved case note",
    );
    expect(request).toHaveBeenCalledOnce();
  });
});

it("keeps AI review inside the case with its filtered queue return path", async () => {
  const draftId = "10000000-0000-4000-8000-000000000002",
    localReviewPath =
      "/zh/admin/members/queue/" +
      original.application.id +
      "?returnTo=%2Fzh%2Fadmin%2Fmembers%2Fqueue%3Fstatus%3Ddraft";
  const request = async () => ({
    status: "created" as const,
    reviewHref: "/zh/admin/tasks?draft=" + draftId,
  });
  const draftLabels = {
    request: "Draft with AI",
    requesting: "Drafting",
    disabled: "Disabled",
    review: "Review local draft",
    states: {
      idle: "",
      created: "Needs review",
      disabled: "Disabled",
      configuration: "Config",
      busy: "Busy",
      unknown: "Unknown",
      stale: "Stale",
      forbidden: "Forbidden",
      unavailable: "Unavailable",
      invalid: "Invalid",
    },
  };
  render(
    <ApplicationCaseForm
      record={original}
      owners={[]}
      labels={labels}
      action={action}
      refreshHref={localReviewPath}
      {...{
        draftRequest: {
          enabled: true,
          action: request,
          labels: draftLabels,
          localReviewPath,
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Draft with AI" }));
  expect(
    await screen.findByRole("link", { name: "Review local draft" }),
  ).toHaveAttribute("href", localReviewPath + "&draft=" + draftId);
});

it("a refreshed case cannot save old fields and offers explicit reload without clearing them", () => {
  const { rerender } = render(
    <ApplicationCaseForm
      record={original}
      owners={[]}
      labels={labels}
      action={action}
      refreshHref="/admin/members/queue/current"
    />,
  );
  fireEvent.change(screen.getByLabelText("Note"), {
    target: { value: "Keep this unsaved note" },
  });
  rerender(
    <ApplicationCaseForm
      record={{ ...original, version: "10000000-0000-4000-8000-000000000099" }}
      owners={[]}
      labels={labels}
      action={action}
      refreshHref="/admin/members/queue/current"
    />,
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Reload" })).toHaveAttribute(
    "href",
    "/admin/members/queue/current",
  );
  expect(screen.getByLabelText("Note")).toHaveValue("Keep this unsaved note");
});
