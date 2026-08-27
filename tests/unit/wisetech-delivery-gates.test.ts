import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

const root = process.cwd();
const paths = {
  delivery: resolve(root, "docs/integration/wisetech-delivery-gates.md"),
  template: resolve(root, ".github/pull_request_template.md"),
  provenance: resolve(root, "docs/integration/wisetech-source-provenance.md"),
};
const scopes = [
  "PR 1 — Scope: CI, branch safety, parity documents and known semantic/locale fixes. Must not include: Visual redesign.",
  "PR 2 — Scope: Tokens, fonts, header, mega menu, footer, responsive shell. Must not include: Schema changes.",
  "PR 3 — Scope: Homepage, About, History and programmes. Must not include: Demo content import.",
  "PR 4 — Scope: Announcement, partners, media upload and localized news migrations/CMS. Must not include: Public cutover.",
  "PR 5 — Scope: Events, News, Showcase, Launch Pad, Membership and contact journeys. Must not include: Auth/payment rewrites.",
  "PR 6 — Scope: Join, portal and admin visual alignment plus end-to-end regression. Must not include: Production deployment.",
  "PR 7 — Scope: Approved content migration, SEO/redirect validation and release evidence. Must not include: Unreviewed scope.",
] as const;
const deliveryRequirements = [
  "c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f",
  "d2d82c01099490a8c2768c942186735667bbc881",
  "quality",
  "Preview must be independent from production",
  "rollback by reverting its independently deployable PR/commit",
  "Fail closed",
  "No production database, provider, deploy, migration, or seed action was performed.",
] as const;
const checklistItems = [
  "Focused RED evidence", "Focused GREEN evidence", "npm.cmd run audit:strings", "npm.cmd test", "npm.cmd run lint", "npm.cmd run typecheck", "npm.cmd run build", "npm.cmd audit --omit=dev --audit-level=high", "Route/content parity", "Database/provider gates", "Rollback notes", "Site source archive transfer", "GitHub branch protection", "isolated Neon/test identities/providers", "Preview/UAT", "production approval", "6 September 2026 unsubscribe fallback deadline", "Do not mark an external gate as passed without recorded evidence.",
] as const;
const statuses = [
  "Site source archive transfer: NOT PASSED",
  "GitHub branch protection: NOT PASSED",
  "isolated Neon/test identities/providers: NOT PASSED",
  "Preview/UAT: NOT PASSED",
  "production approval: NOT PASSED",
  "6 September 2026 unsubscribe fallback deadline: NOT PASSED",
] as const;
const browserReleaseGates = [
  [
    "npm.cmd run test:e2e",
    "NOT PASSED",
    "Required",
    "Required for protected, authenticated, or provider-backed release scenarios: test-only identities and provider configuration.",
    "Isolated Preview and isolated Neon; never Production.",
    "Record the Preview URL, isolated resource identifiers, scenario totals, and sanitized failures or skips.",
  ],
  [
    "npm.cmd run test:lighthouse",
    "NOT PASSED",
    "Required",
    "Not required by the command when its target is public.",
    "An isolated Preview target is required for final release acceptance.",
    "Record the audited Preview URL, Lighthouse scores, thresholds, and report location.",
  ],
] as const;

function readRequired(path: string, label: string) {
  expect(existsSync(path), `missing required ${label}`).toBe(true);
  return readFileSync(path, "utf8");
}

function section(markdown: string, heading: string) {
  const start = markdown.indexOf(heading);
  if (start < 0) return "";
  const rest = markdown.slice(start + heading.length);
  const nextHeading = rest.search(/^## /m);
  return nextHeading < 0 ? rest : rest.slice(0, nextHeading);
}

function tableRows(markdown: string) {
  return markdown.split(/\r?\n/)
    .filter((line) => /^\|.*\|\s*$/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, "")))
    .filter((cells) => cells[0] !== "Gate" && cells[0] !== "Exact command" && !cells.every((cell) => /^-+$/.test(cell)));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checklistPattern(item: string) {
  const markdown = item.startsWith("npm.cmd ") ? `\`${item}\`` : item;
  return new RegExp(`^- \\[ \\] ${escapeRegex(markdown)}(?:$|\\s|—)`, "m");
}

function validate(delivery: string, template: string, provenance: string) {
  const errors: string[] = [];
  for (const requirement of deliveryRequirements) if (!delivery.includes(requirement)) errors.push(`missing delivery requirement: ${requirement}`);

  const scopeRows = [...section(delivery, "## Sequential PR scopes and hard boundaries").matchAll(/^(\d+)\. (PR [1-7] — Scope: .+? Must not include: .+)$/gm)];
  if (scopeRows.length !== scopes.length) errors.push(`expected exactly ${scopes.length} PR scope rows, found ${scopeRows.length}`);
  for (const [index, scope] of scopes.entries()) {
    if (scopeRows[index]?.[1] !== String(index + 1) || scopeRows[index]?.[2] !== scope) errors.push(`PR ${index + 1} scope/boundary is missing, reordered, duplicated, or changed`);
  }

  const external = section(delivery, "## External delivery gates");
  const rows = tableRows(external);
  if (rows.length !== statuses.length) errors.push(`expected exactly ${statuses.length} external status rows, found ${rows.length}`);
  for (const [index, status] of statuses.entries()) if (rows[index]?.[1] !== status) errors.push(`external status ${index + 1} must be exactly ${status}`);
  if (/: PASSED\b/.test(external)) errors.push("external delivery gates contain a contradictory : PASSED claim");

  for (const item of checklistItems) if (!checklistPattern(item).test(template)) errors.push(`required unchecked Markdown checklist item is missing: ${item}`);
  if (!provenance.includes("[WiseTech delivery gates](wisetech-delivery-gates.md)")) errors.push("provenance must cross-link the WiseTech delivery gates document");
  return errors;
}

function validateBrowserReleaseGates(delivery: string, template: string) {
  const errors: string[] = [];
  const sections = [
    ["delivery checklist", section(delivery, "## Local command and evidence checklist")],
    ["PR evidence request", section(template, "## Browser release evidence — unresolved")],
  ] as const;

  for (const [label, releaseSection] of sections) {
    const rows = tableRows(releaseSection);
    if (rows.length !== browserReleaseGates.length) {
      errors.push(`${label} must contain exactly ${browserReleaseGates.length} browser release command rows`);
      continue;
    }
    for (const [index, expected] of browserReleaseGates.entries()) {
      if (JSON.stringify(rows[index]) !== JSON.stringify(expected)) {
        errors.push(`${label} browser release row ${index + 1} must classify ${expected[0]} exactly`);
      }
    }
    if (/: PASSED\b|\|\s*PASSED\s*\|/.test(releaseSection)) {
      errors.push(`${label} must not report a browser release command as passed`);
    }
  }

  const templateReleaseSection = sections[1][1];
  for (const [command] of browserReleaseGates) {
    const checkboxPattern = new RegExp(
      `^- \\[[ xX]\\] ${escapeRegex(`\`${command}\``)}\\s*$`,
      "m",
    );
    if (checkboxPattern.test(templateReleaseSection)) {
      errors.push(`${command} must be an evidence request, not a misleading PR checkbox`);
    }
  }
  return errors;
}

describe("WiseTech delivery gates", () => {
  it("records the exact branch, source, scope, rollback, Preview, and fail-closed evidence", () => {
    expect(validate(
      readRequired(paths.delivery, "WiseTech delivery-gates document"),
      readRequired(paths.template, "pull-request template"),
      readRequired(paths.provenance, "WiseTech provenance document"),
    )).toEqual([]);
  });

  it("rejects contradictory statuses, prose checklists, PR reorder/duplication, and a missing provenance link", () => {
    const delivery = readRequired(paths.delivery, "WiseTech delivery-gates document");
    const template = readRequired(paths.template, "pull-request template");
    const provenance = readRequired(paths.provenance, "WiseTech provenance document");
    const cases = [
      ["PR reorder", delivery.replace(`1. ${scopes[0]}\n2. ${scopes[1]}`, `2. ${scopes[1]}\n1. ${scopes[0]}`), template, provenance],
      ["PR duplication", delivery.replace(`7. ${scopes[6]}`, `7. ${scopes[6]}\n1. ${scopes[0]}`), template, provenance],
      ["contradictory production status", delivery.replace("production approval: NOT PASSED", "production approval: NOT PASSED\nproduction approval: PASSED"), template, provenance],
      ["prose checklist", delivery, template.replace("- [ ] Focused RED evidence", "Focused RED evidence"), provenance],
      ["removed provenance link", delivery, template, provenance.replace("[WiseTech delivery gates](wisetech-delivery-gates.md)", "WiseTech delivery gates")],
    ] as const;
    for (const [label, hostileDelivery, hostileTemplate, hostileProvenance] of cases) {
      expect(validate(hostileDelivery, hostileTemplate, hostileProvenance), `${label} must fail delivery evidence validation`).not.toEqual([]);
    }
  });

  it("records unresolved browser release commands with their exact environment dependencies", () => {
    expect(validateBrowserReleaseGates(
      readRequired(paths.delivery, "WiseTech delivery-gates document"),
      readRequired(paths.template, "pull-request template"),
    )).toEqual([]);
  });

  it("rejects checked completion claims for exact browser release commands", () => {
    const delivery = readRequired(paths.delivery, "WiseTech delivery-gates document");
    const template = readRequired(paths.template, "pull-request template");
    const tableHeading = "| Exact command | Current status | Browser | Credentials | Isolated infrastructure | Evidence required |";
    const cases = [
      ["lowercase checked E2E claim", "x", browserReleaseGates[0][0]],
      ["uppercase checked Lighthouse claim", "X", browserReleaseGates[1][0]],
    ] as const;

    for (const [label, marker, command] of cases) {
      const hostileTemplate = template.replace(tableHeading, `- [${marker}] \`${command}\`\n\n${tableHeading}`);
      expect(validateBrowserReleaseGates(delivery, hostileTemplate), `${label} must fail browser release validation`).not.toEqual([]);
    }
  });
});
