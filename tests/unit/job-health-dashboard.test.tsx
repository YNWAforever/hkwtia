import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import en from "@/messages/en.json";
import {AutomationDashboardView} from "@/components/admin/automation-dashboard";
import {HEALTH_JOB_KEYS} from "@/lib/jobs/health-registry";
import {projectJobHealth} from "@/lib/jobs/health";
const now = new Date("2026-10-01T12:00:00Z");
const healthLabels = {
  heading: "Verified worker health",
  description: "Completed polling only",
  job: "Job",
  state: "Health",
  reason: "Observation",
  reasons: {DISABLED: "Disabled by configuration", WORKER_REVISION_UNCONFIGURED: "Worker version not configured", NO_RECEIPT: "No verified polling receipt", INVALID_RECEIPT: "Invalid polling receipt", REVISION_MISMATCH: "Worker version mismatch", POLL_IN_PROGRESS: "Polling not completed", POLL_OVERDUE: "Polling completion overdue", VERIFIED_SUCCESS: "Verified completion", STALE_RECEIPT: "Polling window overdue", FAILED_ITEMS: "Failed items need attention", RECONCILIATION_REQUIRED: "Reconciliation required", CAPABILITY_MISMATCH: "Worker capability mismatch"},
  lastStarted: "Started",
  lastSuccess: "Succeeded",
  nextExpected: "Expected",
  oldestPending: "Oldest pending",
  failed: "Failed",
  uncertain: "Uncertain",
  deployment: "Worker revision",
  unobserved: "Not observed",
  states: {
    unknown: "Unknown",
    disabled: "Disabled",
    healthy: "Healthy",
    degraded: "Degraded",
  },
  jobs: Object.fromEntries(HEALTH_JOB_KEYS.map((key) => [key, key])),
};
describe("automation health section", () => {
  it("shows the observation reason and unobserved counters for a missing receipt", () => {
    render(<AutomationDashboardView action={async () => ({status: "success", code: "scheduled"})} locale="en" labels={en.Admin.automations}
      dashboard={{asOf:now.toISOString(),counts:{due:0,upcoming:0,failed:0,processing:0},jobs:[],rows:[],nextCursor:null}}
      health={[projectJobHealth("rate-limit-cleanup", null, now, {WORKER_HEALTH_REVISION:"a".repeat(40)})]} healthLabels={healthLabels} />);
    expect(screen.getByRole("columnheader", {name:"Observation"})).toBeVisible();
    expect(screen.getByText("No verified polling receipt")).toBeVisible();
  });

  it("keeps unknown, disabled and confirmed idle distinct with no raw empty-queue health claim", () => {
    render(
      <AutomationDashboardView
        action={async () => ({status: "success", code: "scheduled"})}
        locale="en"
        labels={en.Admin.automations}
        dashboard={{
          asOf: now.toISOString(),
          counts: {due: 0, upcoming: 0, failed: 0, processing: 0},
          jobs: [],
          rows: [],
          nextCursor: null,
        }}
        {...{
          health: HEALTH_JOB_KEYS.map((key) =>
            projectJobHealth(key, null, now, {}),
          ),
          healthLabels,
        }}
      />,
    );
    expect(
      screen.getByRole("heading", {name: healthLabels.heading}),
    ).toBeVisible();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Disabled").length).toBeGreaterThan(0);
    expect(screen.queryByText("Healthy")).toBeNull();
  });
});
