import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {Component, type ReactNode} from "react";
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
  unknown: "Save result needs verification",
  checkResult: "Check saved result",
  checking: "Checking saved result",
  changed: "Newer case version; compare before saving",
  savedRefreshRequired: "Saved; refresh is unavailable",
  reference: "Save reference",
  missingFields: { companyWebsite: "Website" },
  nextActions: { none: "None", await_documents: "Await documents" },
};
const original: ApplicationCase = {
  profile: {
    email: null,
    phone: null,
    jobTitle: null,
    locale: "en",
    onboardingState: "profile",
  },
  company: null,
  application: {
    id: "10000000-0000-4000-8000-000000000001",
    profileId: "profile",
    name: "Synthetic applicant",
    companyId: null,
    companyName: null,
    planCode: "startup",
    status: "draft",
    step: "profile",
    createdAt: "2026-10-16T01:00:00.000Z",
    updatedAt: "2026-10-16T01:00:00.000Z",
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
  it("does not dispatch a second review while the first save is still pending", async () => {
    let completeSave:
      | ((value: { status: "saved"; version: string }) => void)
      | undefined;
    const save = vi.fn(
      () =>
        new Promise<{
          status: "saved";
          version: string;
        }>((resolve) => {
          completeSave = resolve;
        }),
    );
    render(
      <ApplicationCaseForm
        record={original}
        owners={[]}
        labels={labels}
        action={save}
        refreshHref="/admin/members/queue/example"
      />,
    );
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Synthetic single-save note" },
    });
    const form = screen.getByRole("button", { name: "Save" }).closest("form")!;
    await act(async () => {
      form.requestSubmit();
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const saving = screen.getByRole("button", { name: "Saving" });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      completeSave?.({
        status: "saved",
        version: "10000000-0000-4000-8000-000000000003",
      });
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
  });

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

describe("application case recovery after a failed save", () => {
  it.each(["conflict", "error"] as const)(
    "retains the review fields and retry state after a %s result",
    async (status) => {
      const save = vi.fn(async () => ({ status }));
      render(
        <ApplicationCaseForm
          record={original}
          owners={[{ id: "synthetic-owner", name: "Synthetic owner" }]}
          labels={labels}
          action={save}
          refreshHref="/admin/members/queue/example"
        />,
      );
      fireEvent.change(screen.getByLabelText("Owner"), {
        target: { value: "synthetic-owner" },
      });
      fireEvent.change(screen.getByLabelText("Due"), {
        target: { value: "2030-12-01T10:00" },
      });
      fireEvent.change(screen.getByLabelText("Next action"), {
        target: { value: "await_documents" },
      });
      fireEvent.click(screen.getByRole("checkbox", { name: "Website" }));
      fireEvent.change(screen.getByLabelText("Note"), {
        target: { value: "Synthetic recovery note" },
      });
      const form = screen.getByRole("button", { name: "Save" }).closest("form")!;
      await act(async () => {
        form.requestSubmit();
      });
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          status === "conflict" ? "Conflict" : "Error",
        ),
      );
      expect(save).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Owner")).toHaveValue("synthetic-owner");
      expect(screen.getByLabelText("Due")).toHaveValue("2030-12-01T10:00");
      expect(screen.getByLabelText("Next action")).toHaveValue(
        "await_documents",
      );
      expect(screen.getByRole("checkbox", { name: "Website" })).toBeChecked();
      expect(screen.getByLabelText("Note")).toHaveValue(
        "Synthetic recovery note",
      );
      expect(
        form.querySelector('input[name="expectedVersion"]'),
      ).toHaveValue(original.version);
      if (status === "conflict")
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      else
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    },
  );
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

class SaveFailureBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    return this.state.failed ? <p role="alert">Unhandled action failure</p> : this.props.children;
  }
}

describe("save outcome and request identity", () => {
  it("suppresses two form handlers before the pending button can repaint", async () => {
    const save = vi.fn(action);
    render(<ApplicationCaseForm record={original} owners={[]} labels={labels}
      action={save} refreshHref="/admin/members/queue/example"/>);
    fireEvent.change(screen.getByLabelText("Note"), {target: {value: "One logical save"}});
    const form = screen.getByRole("button", {name: "Save"}).closest("form")!;
    await act(async () => {form.requestSubmit(); form.requestSubmit();});
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not show a rejection while the same pending save refreshes the server record", async () => {
    let finish!: (value: Awaited<ReturnType<typeof action>>) => void;
    const save = () => new Promise<Awaited<ReturnType<typeof action>>>(resolve => {finish = resolve;});
    const {rerender} = render(<ApplicationCaseForm record={original} owners={[]} labels={labels}
      action={save} refreshHref="/admin/members/queue/example"/>);
    fireEvent.change(screen.getByLabelText("Note"), {target: {value: "Pending commit"}});
    const form = screen.getByRole("button", {name: "Save"}).closest("form")!;
    await act(async () => {form.requestSubmit();});
    rerender(<ApplicationCaseForm record={{...original, version:"10000000-0000-4000-8000-000000000003"}}
      owners={[]} labels={labels} action={save} refreshHref="/admin/members/queue/example"/>);
    try {
      expect(screen.queryByText("Conflict")).not.toBeInTheDocument();
    } finally {
      await act(async () => {finish(await action());});
    }
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("keeps a confirmed save successful when a newer external record is subsequently read", async () => {
    const {rerender} = render(<ApplicationCaseForm record={original} owners={[]} labels={labels}
      action={action} refreshHref="/admin/members/queue/example"/>);
    fireEvent.change(screen.getByLabelText("Note"), {target:{value:"Confirmed save"}});
    await act(async () => {screen.getByRole("button",{name:"Save"}).closest("form")!.requestSubmit();});
    rerender(<ApplicationCaseForm record={{...original,version:"10000000-0000-4000-8000-000000000099"}}
      owners={[]} labels={labels} action={action} refreshHref="/admin/members/queue/example"/>);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.queryByText("Conflict")).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Save"})).toBeDisabled();
  });

  it("retains all fields after a lost response and reconciles by reading rather than rewriting", async () => {
    const save = vi.fn(async () => {throw new Error("SYNTHETIC_RESPONSE_LOST");});
    const checkOutcome = vi.fn(async () => action());
    render(<SaveFailureBoundary><ApplicationCaseForm record={original}
      owners={[{id:"synthetic-owner",name:"Synthetic owner"}]} labels={labels}
      action={save} refreshHref="/admin/members/queue/example"
      {...{checkOutcome}}/></SaveFailureBoundary>);
    fireEvent.change(screen.getByLabelText("Owner"),{target:{value:"synthetic-owner"}});
    fireEvent.change(screen.getByLabelText("Due"),{target:{value:"2030-12-01T10:00"}});
    fireEvent.click(screen.getByRole("checkbox",{name:"Website"}));
    fireEvent.change(screen.getByLabelText("Next action"),{target:{value:"await_documents"}});
    fireEvent.change(screen.getByLabelText("Note"),{target:{value:"Keep uncertain draft"}});
    await act(async()=>{screen.getByRole("button",{name:"Save"}).closest("form")!.requestSubmit();});
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent(labels.unknown));
    expect(screen.getByLabelText("Owner")).toHaveValue("synthetic-owner");
    expect(screen.getByLabelText("Due")).toHaveValue("2030-12-01T10:00");
    expect(screen.getByRole("checkbox",{name:"Website"})).toBeChecked();
    expect(screen.getByLabelText("Next action")).toHaveValue("await_documents");
    expect(screen.getByLabelText("Note")).toHaveValue("Keep uncertain draft");
    expect(screen.getByRole("button",{name:"Save"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:labels.checkResult}));
    await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Saved"));
    expect(checkOutcome).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps one request identity until confirmation and issues a new one for a new edit", async () => {
    const sent: {id: FormDataEntryValue | null; version: FormDataEntryValue | null}[]=[];
    const save=vi.fn(async (_previous: unknown,data: FormData)=>{
      sent.push({id:data.get("requestId"),version:data.get("expectedVersion")});
      return action();
    });
    render(<ApplicationCaseForm record={original} owners={[]} labels={labels}
      action={save} refreshHref="/admin/members/queue/example"/>);
    fireEvent.change(screen.getByLabelText("Note"),{target:{value:"First intent"}});
    await act(async()=>{screen.getByRole("button",{name:"Save"}).closest("form")!.requestSubmit();});
    await act(async()=>{screen.getByRole("button",{name:"Save"}).closest("form")!.requestSubmit();});
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Note"),{target:{value:"Second intent"}});
    await act(async()=>{screen.getByRole("button",{name:"Save"}).closest("form")!.requestSubmit();});
    expect(save).toHaveBeenCalledTimes(2);
    expect(sent[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sent[1].id).not.toBe(sent[0].id);
    expect(sent[1].version).toBe("10000000-0000-4000-8000-000000000003");
  });
  it("retains the last acknowledged version after a later validation error", async () => {
    const sent: (FormDataEntryValue | null)[] = [];
    const save = vi.fn(async (_state: unknown,data: FormData) => {
      sent.push(data.get("expectedVersion"));
      return sent.length === 2 ? {status:"error" as const} : action();
    });
    render(<ApplicationCaseForm record={original} owners={[]} labels={labels}
      action={save} refreshHref="/admin/members/queue/example"/>);
    for (const note of ["First save","Invalid owner edit","Corrected owner edit"]) {
      fireEvent.change(screen.getByLabelText("Note"),{target:{value:note}});
      await act(async()=>{screen.getByRole("button",{name:"Save"}).closest("form")!.requestSubmit();});
    }
    expect(sent).toEqual([original.version,"10000000-0000-4000-8000-000000000003","10000000-0000-4000-8000-000000000003"]);
  });
  it("does not present the previous success as the result of a new pending save", async () => {
    let finish!: (value: Awaited<ReturnType<typeof action>>) => void;
    const save=vi.fn().mockImplementationOnce(action).mockImplementationOnce(
      ()=>new Promise<Awaited<ReturnType<typeof action>>>(resolve=>{finish=resolve;}));
    render(<ApplicationCaseForm record={original} owners={[]} labels={labels}
      action={save} refreshHref="/admin/members/queue/example"/>);
    fireEvent.change(screen.getByLabelText("Note"),{target:{value:"First save"}});
    await act(async()=>{screen.getByRole("button",{name:"Save"}).closest("form")!.requestSubmit();});
    fireEvent.change(screen.getByLabelText("Note"),{target:{value:"New pending save"}});
    await act(async()=>{screen.getByRole("button",{name:"Save"}).closest("form")!.requestSubmit();});
    try { expect(screen.queryByRole("status")).not.toBeInTheDocument(); }
    finally { await act(async()=>{finish(await action());}); }
  });
  it("can save a subsequent edit when crypto.randomUUID is unavailable", async () => {
    const sent: (FormDataEntryValue | null)[] = [];
    const save=vi.fn(async (_state: unknown,data: FormData)=>{
      sent.push(data.get("requestId")); return action();
    });
    const unavailable=vi.spyOn(globalThis.crypto,"randomUUID").mockImplementation(()=>{
      throw new Error("SYNTHETIC_RANDOM_UUID_UNAVAILABLE");
    });
    try {
      render(<SaveFailureBoundary><ApplicationCaseForm record={original} owners={[]} labels={labels}
        initialRequestId="70000000-0000-4000-8000-000000000001"
        action={save} refreshHref="/admin/members/queue/example"/></SaveFailureBoundary>);
      for(const note of ["First save","Next save"]) {
        fireEvent.change(screen.getByLabelText("Note"),{target:{value:note}});
        await act(async()=>{screen.getByRole("button",{name:"Save"}).closest("form")!.requestSubmit();});
      }
      expect(save).toHaveBeenCalledTimes(2);
      expect(sent[1]).toMatch(/^[0-9a-f-]{36}$/i);
      expect(sent[1]).not.toBe(sent[0]);
      expect(screen.getByRole("status")).toHaveTextContent("Saved");
    } finally { unavailable.mockRestore(); }
  });
});
