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
