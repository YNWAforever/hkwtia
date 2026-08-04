import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {CohortApplicationForm} from "@/components/marketing/cohort-application-form";
import {applyToCohort, applyToCohortAction} from "@/lib/launchpad/member-actions";
import type {CohortRepository} from "@/lib/db/repos/cohorts";
import {actorFor, anonymousActor} from "@/tests/helpers/fakes";

const cohortId = "11111111-1111-4111-8111-111111111111";
const actor = actorFor("member-a");
const input = {cohortId, readiness: {market: "Singapore", readiness: "Pilot-ready"}};

function application(id = "22222222-2222-4222-8222-222222222222") {
  return {id, cohortId, companyId: "33333333-3333-4333-8333-333333333333", stage: "applied", readiness: input.readiness} as never;
}

function repository(create = vi.fn(async () => application())): Pick<CohortRepository, "createApplication"> {
  return {createApplication: create};
}

describe("M6 member cohort application", () => {
  it("delegates an authenticated member application to the actor-scoped repository", async () => {
    const createApplication = vi.fn(async () => application());
    const result = await applyToCohort(actor, cohortId, input, repository(createApplication));

    expect(result).toEqual(application());
    expect(createApplication).toHaveBeenCalledWith(actor, cohortId, input);
  });

  it("does not bypass repository authorization for an anonymous applicant", async () => {
    const createApplication = vi.fn(async () => { throw new Error("FORBIDDEN"); });

    await expect(applyToCohort(anonymousActor(), cohortId, input, repository(createApplication))).rejects.toThrow("FORBIDDEN");
    expect(createApplication).toHaveBeenCalledWith(anonymousActor(), cohortId, input);
  });

  it("surfaces a closed-cohort rejection without a fallback mutation", async () => {
    const createApplication = vi.fn(async () => { throw new Error("COHORT_NOT_OPEN"); });

    await expect(applyToCohort(actor, cohortId, input, repository(createApplication))).rejects.toThrow("COHORT_NOT_OPEN");
    expect(createApplication).toHaveBeenCalledTimes(1);
  });

  it("preserves repository idempotency for repeat submissions", async () => {
    const existing = application();
    const createApplication = vi.fn(async () => existing);
    const repo = repository(createApplication);

    await expect(applyToCohort(actor, cohortId, input, repo)).resolves.toEqual(existing);
    await expect(applyToCohort(actor, cohortId, input, repo)).resolves.toEqual(existing);
    expect(createApplication).toHaveBeenCalledTimes(2);
  });

  it("renders bilingual accessible fields without a company identifier", () => {
    const labels = {
      title: "Apply to this cohort", cohort: "Cohort", market: "Target market", readiness: "Readiness", consent: "I consent to WTIA using this application for cohort review.", submit: "Apply", submitting: "Applying", success: "Application received", invalid: "Check the required fields", unauthorized: "Sign in", signIn: "Sign in", error: "Unable to submit your application",
    };
    const english = render(<CohortApplicationForm action={async () => ({status: "success"})} cohorts={[{id: cohortId, name: "Singapore Launch", status: "open"}]} labels={labels}/>);

    expect(screen.getByLabelText("Cohort")).toHaveAttribute("name", "cohortId");
    expect(screen.getByLabelText("Target market")).toHaveAttribute("name", "market");
    expect(screen.getByLabelText("Readiness")).toHaveAttribute("name", "readiness");
    expect(screen.getByLabelText(labels.consent)).toHaveAttribute("name", "consent");
    expect(screen.queryByDisplayValue(/company/i)).not.toBeInTheDocument();

    english.unmount();
    render(<CohortApplicationForm action={async () => ({status: "success"})} cohorts={[{id: cohortId, name: "新加坡創科起動", status: "open"}]} labels={{...labels, title: "申請參與小組", cohort: "小組", market: "目標市場", readiness: "準備程度", consent: "我同意 WTIA 使用此申請作小組評審。", submit: "提交申請"}}/>);
    expect(screen.getByRole("heading", {name: "申請參與小組"})).toBeInTheDocument();
    expect(screen.getByLabelText("小組")).toBeInTheDocument();
  });

  it("rejects missing consent before an application mutation", async () => {
    const formData = new FormData();
    formData.set("cohortId", cohortId);
    formData.set("market", "Singapore");
    formData.set("readiness", "Pilot-ready");

    await expect(applyToCohortAction(formData)).resolves.toEqual({status: "invalid"});
  });
});
