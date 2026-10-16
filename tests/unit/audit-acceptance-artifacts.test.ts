import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {parse} from "yaml";

type Workflow = {jobs: Record<string, {steps?: {uses?: string; with?: {path?: string}}[]}>};
function unsafeAuthenticatedArtifacts(workflow: Workflow): string[] {
  return Object.entries(workflow.jobs).filter(([name]) => name.includes("authenticated")).flatMap(([name, job]) =>
    (job.steps ?? []).filter(step => step.uses?.startsWith("actions/upload-artifact@")).flatMap(step =>
      (step.with?.path ?? "").split(/\r?\n/).map(path => path.trim()).filter(Boolean).filter(path => path !== "test-results/audit-authenticated.json").map(path => `${name}: ${path}`)));
}
describe("audit acceptance credential artifacts", () => {
  it("detects broad upload paths that would include saved member sessions", () => {
    const workflow = (path: string): Workflow => ({jobs: {"isolated-authenticated": {steps: [{uses: "actions/upload-artifact@v4", with: {path}}]}}});
    for (const hostile of ["test-results/", "test-results/**", "test-results/m2-auth/staff.json", ".playwright/"]) expect(unsafeAuthenticatedArtifacts(workflow(hostile))).toHaveLength(1);
    expect(unsafeAuthenticatedArtifacts(workflow("test-results/audit-authenticated.json"))).toEqual([]);
  });
  it("uploads the result report without exporting credential-bearing storage state", () => {
    const workflow = parse(readFileSync(".github/workflows/audit-acceptance.yml", "utf8")) as Workflow;
    expect(Object.keys(workflow.jobs).filter(name => name.includes("authenticated"))).toHaveLength(1);
    expect(workflow.jobs["isolated-authenticated"]?.steps?.filter(step => step.uses?.startsWith("actions/upload-artifact@"))).toHaveLength(1);
    expect(unsafeAuthenticatedArtifacts(workflow)).toEqual([]);
  });
});
