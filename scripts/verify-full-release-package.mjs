import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
const root = resolve("docs/audits/hkwtia-2026-10-03-full-fix");
const load = (name) =>
  parse(readFileSync(resolve(root, name), "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  });
const tasks = load("tasks.csv"),
  findings = load("status.csv"),
  cases = load("acceptance.csv");
assert.equal(tasks.length, 22);
assert.equal(findings.length, 28);
assert.equal(cases.length, 64);
const ids = (rows, key) => {
  const values = rows.map((row) => row[key]);
  assert.equal(new Set(values).size, rows.length);
  assert(values.every(Boolean));
  return new Set(values);
};
const taskIds = ids(tasks, "task_id"),
  findingIds = ids(findings, "finding_id"),
  caseIds = ids(cases, "case_id");
for (let n = 1; n <= 40; n++)
  assert(caseIds.has("UC-" + String(n).padStart(2, "0")));
for (let n = 1; n <= 24; n++)
  assert(caseIds.has("AC-" + String(n).padStart(2, "0")));
const refs = (raw, set, allowAll = false) => {
  if (allowAll && raw === "ALL") return;
  for (const id of raw.split(";").filter(Boolean))
    assert(set.has(id), "UNKNOWN_TRACEABILITY_REFERENCE");
};
for (const row of tasks) {
  refs(row.finding_ids, findingIds, row.task_id === "T00");
  refs(row.user_case_ids, caseIds);
}
for (const row of findings) {
  refs(row.task_ids, taskIds);
  refs(row.case_ids, caseIds);
}
let immutableUc = 0,
  evidenceReferences = 0;
for (const row of cases) {
  refs(row.task_ids, taskIds);
  refs(row.finding_ids, findingIds);
  if (row.case_id.startsWith("UC-")) {
    const original = JSON.parse(row.source_case_json);
    assert.equal(original.case_id, row.case_id);
    assert.equal(original.result, row.baseline_result);
    immutableUc++;
  } else assert.equal(row.baseline_result, "NEW_CASE");
  for (const relative of row.evidence_path.split(";").filter(Boolean)) {
    const path = resolve(root, relative.trim());
    assert(path.startsWith(root + sep));
    assert(existsSync(path), "MISSING_CASE_EVIDENCE");
    evidenceReferences++;
  }
  assert(row.implementation_result);
}
assert.equal(immutableUc, 40);
const verifyEvidencePaths = (raw) => {
  for (const relative of raw.split(";").filter(Boolean)) {
    const path = resolve(root, relative.trim());
    assert(path.startsWith(root + sep));
    assert(existsSync(path), "MISSING_TASK_OR_FINDING_EVIDENCE");
  }
};
for (const row of tasks) verifyEvidencePaths(row.evidence_ids);
for (const row of findings) verifyEvidencePaths(row.evidence_path);

const manifest = JSON.parse(
  readFileSync(resolve(root, "release-manifest.json"), "utf8"),
);
assert.equal(
  manifest.fullFixComplete,
  false,
  "MANDATORY_OPERATIONAL_GATES_REMAIN",
);
assert.equal(manifest.production.releasedThisScope, false);
assert.equal(manifest.production.migrationsAppliedThisScope, false);
assert.equal(manifest.production.flagsEnabledThisScope, false);
assert.equal(manifest.candidateProductionDeployment, null);
const historicalCases = cases.filter(row => row.case_id.startsWith("UC-")).map(row => ({case_id:row.case_id,source_case_json:row.source_case_json,baseline_result:row.baseline_result}));
assert.equal(createHash("sha256").update(JSON.stringify(historicalCases)).digest("hex"),manifest.historicalCases.originalUcSha256,"ORIGINAL_AUDIT_CASES_CHANGED");

assert.deepEqual(manifest.counts, { tasks: 22, findings: 28, cases: 64 });
for (const file of [
  "rollout.md",
  "rollback.md",
  "runbook.md",
  "environment-matrix.md",
  "decision-register.md",
])
  assert(existsSync(resolve(root, file)));
const hashes = Object.fromEntries(
  [
    "tasks.csv",
    "status.csv",
    "acceptance.csv",
    "source-map.json",
    "release-manifest.json",
    "rollout.md",
    "rollback.md",
    "runbook.md",
  ].map((file) => [
    file,
    createHash("sha256")
      .update(readFileSync(resolve(root, file)))
      .digest("hex"),
  ]),
);
const result = {
  observedAt: new Date().toISOString(),
  tasks: 22,
  findings: 28,
  cases: 64,
  immutableHistoricalUc: immutableUc,
  newAcceptanceCases: 24,
  validEvidenceReferences: evidenceReferences,
  hashes,
  productionReleased: false,
  fullFixComplete: false,
  meaning:
    "Traceability and evidence-file integrity; not provider, human or deployment acceptance",
};
writeFileSync(
  resolve(root, "evidence/t16/release-package-check.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
