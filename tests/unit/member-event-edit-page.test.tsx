import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({failure: null as Error | null, status: "pending_review" as string, limit: 2}));
vi.mock("next-intl/server", () => ({getTranslations: vi.fn(async () => (key: string) => key), setRequestLocale: vi.fn()}));
vi.mock("next/navigation", () => ({redirect: vi.fn(), notFound: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({getActor: vi.fn(async () => ({kind: "member", userId: "u", profileId: "p"}))}));
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {getForMemberEdit: vi.fn(async () => ({id: "event-id", organiser_company_id: "33333333-3333-4333-8333-333333333333"}))}}));
vi.mock("@/lib/events/member-contract", () => ({memberEventViewFromRow: vi.fn(() => ({id: "event-id", status: state.status, titleEn: "Event", rejectionReason: null}))}));
vi.mock("@/lib/events/member-core", () => ({loadMemberEventsContext: vi.fn(async () => {
  if (state.failure) throw state.failure;
  return {canPublish: false, limit: state.limit};
})}));
vi.mock("@/lib/events/member-actions", () => ({saveMemberEventAction: vi.fn()}));
vi.mock("@/components/portal/event-form", () => ({EventForm: ({canSubmit, canSaveDraft}: {canSubmit: boolean; canSaveDraft: boolean}) => <div data-can-save-draft={canSaveDraft} data-can-submit={canSubmit}>form</div>}));

import EditMemberEventPage from "@/app/[locale]/(member)/portal/events/[id]/edit/page";
import {loadMemberEventsContext} from "@/lib/events/member-core";

const props = {params: Promise.resolve({locale: "en", id: "event-id"}), searchParams: Promise.resolve({})};

describe("/portal/events/[id]/edit recovery", () => {
  beforeEach(() => {state.failure = null; state.status = "pending_review"; state.limit = 2;});

  it("does not enable resubmission when membership is no longer active", async () => {
    state.failure = new Error("NO_MEMBERSHIP_FOR_COMPANY");
    render(await EditMemberEventPage(props));
    expect(screen.getByText("form")).toHaveAttribute("data-can-submit", "false");
    expect(screen.getByText("form")).toHaveAttribute("data-can-save-draft", "false");
    expect(screen.getByText("errors.NO_MEMBERSHIP_FOR_COMPANY")).toBeVisible();
  });

  it("disables resubmission and explains when all memberships have expired", async () => {
    state.failure = new Error("MEMBERSHIP_INACTIVE");
    render(await EditMemberEventPage(props));
    expect(screen.getByText("form")).toHaveAttribute("data-can-submit", "false");
    expect(screen.getByText("form")).toHaveAttribute("data-can-save-draft", "false");
    expect(screen.getByText("errors.NO_MEMBERSHIP_FOR_COMPANY")).toBeVisible();
  });
  it("disables resubmission of a pending event when the other submissions fill the quota", async () => {
    render(await EditMemberEventPage(props));
    expect(screen.getByText("form")).toHaveAttribute("data-can-submit", "false");
  });

  it("does not offer resubmission on a Community plan after downgrade", async () => {
    state.limit = 0;
    render(await EditMemberEventPage(props));
    expect(screen.getByText("form")).toHaveAttribute("data-can-submit", "false");
    expect(screen.getByText("form")).toHaveAttribute("data-can-save-draft", "true");
  });
  it("sizes the edit controls from the event owner's company", async () => {
    await EditMemberEventPage(props);
    expect(loadMemberEventsContext).toHaveBeenCalledWith(
      {kind: "member", userId: "u", profileId: "p"},
      undefined,
      {companyId: "33333333-3333-4333-8333-333333333333", excludeEventId: "event-id"},
    );
  });
  it("lets a database outage reach the error boundary", async () => {
    state.failure = new Error("database unavailable");
    await expect(EditMemberEventPage(props)).rejects.toThrow("database unavailable");
  });
});