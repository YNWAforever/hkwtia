import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({failure: null as Error | null, context: null as null | Record<string, unknown>, action: null as null | ((state: unknown, data: FormData) => Promise<unknown>), companies: [{id: "11111111-1111-4111-8111-111111111111", canManage: true, displayName: "Acme"}], memberships: [{companyId: "11111111-1111-4111-8111-111111111111", status: "active"}]}));
vi.mock("next-intl/server", () => ({getTranslations: vi.fn(async () => (key: string, values?: {company?: string}) => values?.company ? `${key}:${values.company}` : key), setRequestLocale: vi.fn()}));
vi.mock("next/navigation", () => ({redirect: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({getActor: vi.fn(async () => ({kind: "member", userId: "u", profileId: "p"}))}));
vi.mock("@/lib/events/member-core", () => ({loadMemberEventsContext: vi.fn(async () => {if (state.failure) throw state.failure; return state.context;})}));
vi.mock("@/lib/events/member-actions", () => ({saveMemberEventAction: vi.fn()}));
vi.mock("@/lib/portal/queries", () => ({getDashboard: vi.fn(async () => ({companies: state.companies, memberships: state.memberships}))}));
vi.mock("@/components/portal/event-form", () => ({EventForm: ({action}: {action: (state: unknown, data: FormData) => Promise<unknown>}) => {state.action = action; return <form data-member-event-form>form</form>;}}));

import NewMemberEventPage from "@/app/[locale]/(member)/portal/events/new/page";
import {saveMemberEventAction} from "@/lib/events/member-actions";
import {loadMemberEventsContext} from "@/lib/events/member-core";

const props = {params: Promise.resolve({locale: "en"})};

describe("/portal/events/new recovery", () => {
  beforeEach(() => {state.failure = null; state.context = null; state.action = null; state.companies = [{id: "11111111-1111-4111-8111-111111111111", canManage: true, displayName: "Acme"}]; state.memberships = [{companyId: "11111111-1111-4111-8111-111111111111", status: "active"}]; vi.mocked(saveMemberEventAction).mockClear();});

  it("explains when the managed company has no active membership", async () => {
    state.failure = new Error("NO_MEMBERSHIP_FOR_COMPANY");
    render(await NewMemberEventPage(props));
    expect(screen.getByText("errors.NO_MEMBERSHIP_FOR_COMPANY")).toBeVisible();
    expect(screen.queryByText("noCompany")).toBeNull();
  });

  it("explains when all memberships have expired", async () => {
    state.failure = new Error("MEMBERSHIP_INACTIVE");
    render(await NewMemberEventPage(props));
    expect(screen.getByText("errors.NO_MEMBERSHIP_FOR_COMPANY")).toBeVisible();
  });
  it("shows the no-company state only for an actual missing manager role", async () => {
    state.failure = new Error("NO_MANAGED_COMPANY");
    render(await NewMemberEventPage(props));
    expect(screen.getByText("noCompany")).toBeVisible();
  });

  it("binds the rendered company into the new-event server action", async () => {
    const companyId = "11111111-1111-4111-8111-111111111111";
    state.context = {companyId, companyName: "Acme", plan: "startup", usedThisQuarter: 0, limit: 2, canPublish: true};
    render(await NewMemberEventPage(props));
    expect(screen.getByText("publishingFor:Acme")).toBeVisible();
    const formData = new FormData();
    await state.action!({status: "idle"}, formData);
    expect(saveMemberEventAction).toHaveBeenCalledWith("en", companyId, {status: "idle"}, formData);
  });
  it("honours an explicitly selected managed company", async () => {
    const companyId = "33333333-3333-4333-8333-333333333333";
    state.context = {companyId, companyName: "Other", plan: "startup", usedThisQuarter: 0, limit: 2, canPublish: true};
    state.companies.push({id: companyId, canManage: true, displayName: "Other"});
    state.memberships.push({companyId, status: "active"});
    render(await NewMemberEventPage({params: props.params, searchParams: Promise.resolve({companyId})}));
    expect(screen.getByRole("combobox", {name: "chooseCompany"})).toHaveValue(companyId);
    expect(screen.getByRole("button", {name: "useCompany"})).toBeVisible();
    expect(loadMemberEventsContext).toHaveBeenCalledWith(
      {kind: "member", userId: "u", profileId: "p"}, undefined, {companyId},
    );
  });
  it("warns before switching companies with an unsaved event", async () => {
    state.context = {companyId: state.companies[0].id, companyName: "Acme", plan: "startup", usedThisQuarter: 0, limit: 2, canPublish: true};
    const otherId = "33333333-3333-4333-8333-333333333333";
    state.companies.push({id: otherId, canManage: true, displayName: "Other"});
    state.memberships.push({companyId: otherId, status: "active"});
    render(await NewMemberEventPage(props));
    const eventForm = document.querySelector("[data-member-event-form]") as HTMLFormElement;
    eventForm.dataset.dirty = "true";
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const picker = screen.getByRole("button", {name: "useCompany"}).closest("form")!;
    const selector = screen.getByRole("combobox", {name: "chooseCompany"}) as HTMLSelectElement;
    selector.value = otherId;
    const submit = new Event("submit", {bubbles: true, cancelable: true});
    picker.dispatchEvent(submit);
    expect(confirm).toHaveBeenCalledWith("changeCompanyWarning");
    expect(submit.defaultPrevented).toBe(true);
    expect(selector).toHaveValue(state.context!.companyId as string);
    confirm.mockRestore();
  });
  it("lets a database outage reach the error boundary", async () => {
    state.failure = new Error("database unavailable");
    await expect(NewMemberEventPage(props)).rejects.toThrow("database unavailable");
  });
});