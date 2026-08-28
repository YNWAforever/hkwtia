import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

const root = process.cwd();
const paths = {
  delivery: resolve(root, "docs/integration/wisetech-delivery-gates.md"),
  template: resolve(root, ".github/pull_request_template.md"),
  provenance: resolve(root, "docs/integration/wisetech-source-provenance.md"),
  reconciliation: resolve(root, "docs/integration/wisetech-authoritative-source-reconciliation.md"),
  routes: resolve(root, "docs/integration/wisetech-route-parity.md"),
  content: resolve(root, "docs/integration/wisetech-content-mapping.md"),
  components: resolve(root, "docs/integration/wisetech-component-inventory.md"),
  assets: resolve(root, "docs/integration/wisetech-asset-register.md"),
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
  "Focused RED evidence", "Focused GREEN evidence", "npm.cmd run audit:strings", "npm.cmd test", "npm.cmd run lint", "npm.cmd run typecheck", "npm.cmd run build", "npm.cmd audit --omit=dev --audit-level=high", "Route/content parity", "Database/provider gates", "Rollback notes", "GitHub branch protection", "isolated Neon/test identities/providers", "Preview/UAT", "production approval", "6 September 2026 unsubscribe fallback deadline", "Do not mark an external gate as passed without recorded evidence.",
] as const;
const statuses = [
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
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
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

const authoritativeIdentity = [
  "https://github.com/YNWAforever/wisetech",
  "f91ecc5fa29c2b9d416ed8315f23e9492baf993d",
  "d13a99e6c47f2b3ea279c5d02da5cf15008807b7",
  "138 tracked files",
  "79d543e6794f604af6c59cfe43928ac4b5e5fa578ba4559d354e6291cfe8f24c",
  "d2d82c01099490a8c2768c942186735667bbc881",
  "411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54",
] as const;
const authoritativeTotals = [
  "2 locales", "67 sitemap paths", "134 locale URLs", "27 dispatcher behaviors",
  "35 navigation placements", "6 physical forms", "9 logical flows", "13 donor app artifacts",
  "33/18/16", "99 assets", "6 archive images", "2 brand assets", "5 editorial images",
  "7 root assets", "79 historical partner logos", "c864faa2057bfe1257d0db9ff6166717d73a3cae90d957bfecdc0921bbbbff79",
] as const;
const staleSourceClaims = [
  "There are zero `site-v13-source` asset entries.",
  "site-v13-source` has zero current records",
  "There are currently zero such entries.",
  "The authoritative Site archive is not available in this workspace.",
] as const;

function validateAuthoritativeDocumentation(documents: Record<string, string>) {
  const errors: string[] = [];
  const reconciliation = documents.reconciliation;
  for (const value of authoritativeIdentity) if (!reconciliation.includes(value)) errors.push(`missing exact identity: ${value}`);
  for (const value of authoritativeTotals) if (!reconciliation.includes(value)) errors.push(`missing exact inventory total: ${value}`);
  for (const value of [
    "PASSED LOCALLY",
    "Historical archive byte/history equivalence remains UNRESOLVED",
    "non-blocking provenance",
    "not a byte or history continuity claim",
    "config/wisetech-authoritative-source-inventory.ts",
    "lib/integration/authoritative-source-reconciliation.ts",
    "config/wisetech-integration-manifest.ts",
    "tests/unit/wisetech-authoritative-source-reconciliation.test.ts",
    "tests/unit/wisetech-route-parity.test.ts",
    "tests/unit/wisetech-delivery-gates.test.ts",
  ]) if (!reconciliation.includes(value)) errors.push(`missing reconciliation contract: ${value}`);

  for (const [label, document] of Object.entries(documents)) {
    if (!document.includes("f91ecc5fa29c2b9d416ed8315f23e9492baf993d")) errors.push(`${label} is missing the authoritative donor commit`);
    if (!document.includes("d2d82c01099490a8c2768c942186735667bbc881")) errors.push(`${label} is missing the historical identity`);
    if (!document.includes("unverified")) errors.push(`${label} must keep historical equivalence unverified`);
    for (const stale of staleSourceClaims) if (document.includes(stale)) errors.push(`${label} contains stale unavailable or zero-source language`);
  }
  if (!documents.provenance.includes("[authoritative source reconciliation](wisetech-authoritative-source-reconciliation.md)")) errors.push("provenance lacks reconciliation cross-link");
  if (!documents.routes.includes("all 67") || !documents.routes.includes("exactly once") || !documents.routes.includes("134 locale URLs") || !documents.routes.includes("27 dispatcher behaviors") || !documents.routes.includes("35 navigation placements")) errors.push("route parity lacks exact complete source classification");
  for (const alias of ["asia-smart-innovation-awards-summit-2025", "smart-innovation-meets-genai", "programmes/tech-connect", "programmes/asia-smart-innovation-awards", "programmes/asia-smart-innovation-awards/2025", "programmes/hkict-startup-award"]) if (!documents.routes.includes(alias)) errors.push(`route parity lacks explicit source alias: ${alias}`);
  if (!documents.routes.includes("historical/no-seed/no-edition")) errors.push("route parity lacks historical/no-seed/no-edition boundary");
  if (!documents.components.includes("13 donor app artifacts") || !documents.components.includes("33/18/16") || !documents.components.includes("no donor router/auth/D1/Workers/runtime import") || !documents.components.includes("presentation patterns only")) errors.push("component inventory lacks source-artifact/runtime boundary");
  if (!documents.content.includes("source evidence, not current data") || !documents.content.includes("no donor event/programme edition/metrics/testimonials/membership/portal/form persistence import")) errors.push("content mapping lacks source-data boundary");
  if (!documents.assets.includes("99 assets") || !documents.assets.includes("79 historical partner logos") || !documents.assets.includes("do not establish relationship, rights, or publication") || !documents.assets.includes("unreviewed, retired, and non-publishable") || !documents.assets.includes("Current hkwtia assets remain separate")) errors.push("asset register lacks fail-closed donor asset boundary");
  return errors;
}

describe("WiseTech authoritative source documentation", () => {
  it("separates the locally passed Git donor reconciliation from unresolved archive provenance and external gates", () => {
    const documents = Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "template").map(([key, path]) => [key, readRequired(path, key)]));
    expect(validateAuthoritativeDocumentation(documents)).toEqual([]);
  });

  it("rejects lost source evidence, stale unavailability, and false archive equivalence", () => {
    const documents = Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "template").map(([key, path]) => [key, readRequired(path, key)]));
    for (const [label, hostile] of [
      ["lost donor commit", {...documents, reconciliation: documents.reconciliation.replace("f91ecc5fa29c2b9d416ed8315f23e9492baf993d", "missing")}],
      ["stale unavailable claim", {...documents, provenance: documents.provenance + "\nThere are currently zero such entries.\n"}],
      ["false equivalence", {...documents, reconciliation: documents.reconciliation.replace("Historical archive byte/history equivalence remains UNRESOLVED", "Historical archive byte/history equivalence is VERIFIED")}],
    ] as const) expect(validateAuthoritativeDocumentation(hostile), label).not.toEqual([]);
  });
});

describe("WiseTech corrected source-state documentation", () => {
  it("keeps the Git donor locally passed while archive equivalence is non-blocking provenance", () => {
    const docs = Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "template").map(([key, path]) => [key, readRequired(path, key)]));
    for (const [label, document] of Object.entries(docs)) {
      expect(document, `${label} must state the locally reconciled donor`).toContain("PASSED LOCALLY");
      expect(document, `${label} must keep only historical equivalence unresolved`).toMatch(/historical.*unverified|unverified.*historical/i);
    }
    expect(docs.delivery).not.toMatch(/Site source archive transfer: NOT PASSED|archive reconciliation and required GitHub branch protection|Obtain the authoritative Site v13 archive/i);
    expect(readRequired(paths.template, "pull-request template")).not.toContain("Site source archive transfer");
    expect(docs.routes).toContain("133 entries: route 116, CTA 5, form 3, locale 1 and asset 8");
    expect(docs.routes).toContain("retain 47, redirect 4, merge 67 and retire 15");
    expect(docs.routes).toContain("6 direct `site-v13-source` evidence rows");
    expect(docs.routes).toContain("all 67 sitemap routes");
  });

  it("rejects every reviewed stale variant and archive-gate regression", () => {
    const baseline = Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "template").map(([key, path]) => [key, readRequired(path, key)]));
    const staleVariants = [
      ["provenance zero source", {...baseline, provenance: baseline.provenance + "\nNo current manifest entry uses this label.\n"}],
      ["asset unavailable", {...baseline, assets: baseline.assets + "\nThe archive is unavailable.\n"}],
      ["component unavailable", {...baseline, components: baseline.components + "\nThe archive itself is unavailable.\n"}],
      ["content blocked", {...baseline, content: baseline.content + "\nSite content transfer remains blocked.\n"}],
      ["archive gate", {...baseline, delivery: baseline.delivery + "\n| Site source archive transfer | Site source archive transfer: NOT PASSED | required |\n"}],
      ["stale totals", {...baseline, routes: baseline.routes.replace("133 entries: route 116", "127 entries: route 110")}],
    ] as const;
    for (const [label, hostile] of staleVariants) expect(validateCorrectedSourceState(hostile), label).not.toEqual([]);
  });
});

function validateCorrectedSourceState(docs: Record<string, string>) {
  const errors: string[] = [];
  for (const [label, document] of Object.entries(docs)) {
    if (!document.includes("PASSED LOCALLY")) errors.push(`${label}: missing passed-local status`);
    if (!/historical.*unverified|unverified.*historical/i.test(document)) errors.push(`${label}: missing historical unverified boundary`);
    if (/No current manifest entry uses this label|The archive is unavailable|The archive itself is unavailable|Site content transfer remains blocked/i.test(document)) errors.push(`${label}: stale authoritative-source state`);
  }
  if (/Site source archive transfer: NOT PASSED|archive reconciliation and required GitHub branch protection|Obtain the authoritative Site v13 archive/i.test(docs.delivery)) errors.push("delivery: archive transfer is wrongly external");
  for (const current of ["133 entries: route 116, CTA 5, form 3, locale 1 and asset 8", "retain 47, redirect 4, merge 67 and retire 15", "6 direct `site-v13-source` evidence rows", "all 67 sitemap routes"]) if (!docs.routes.includes(current)) errors.push(`routes: missing ${current}`);
  return errors;
}

describe("WiseTech original evidence matrices", () => {
  it("states positive frozen Git evidence in every surviving original row and legend", () => {
    const provenance = readRequired(paths.provenance, "provenance");
    const components = readRequired(paths.components, "components");
    const content = readRequired(paths.content, "content");
    const assets = readRequired(paths.assets, "assets");
    const delivery = readRequired(paths.delivery, "delivery");
    expect(provenance.match(/Frozen authoritative Git source evidence/g)).toHaveLength(5);
    for (const value of ["frozen Git-source evidence", "historical byte/history comparison is optional", "Frozen donor artifact evidence", "All donor source inventory is reconciled", "historical archive bytes are optional provenance only"]) expect(components + content).toContain(value);
    expect(content.match(/All donor source inventory is reconciled/g)).toHaveLength(2);
    expect(content.match(/historical archive bytes are optional provenance only/g)).toHaveLength(2);
    expect(components.match(/historical byte\/history comparison is optional/g)).toHaveLength(2);
    expect(assets.match(/Frozen donor file evidence; unreviewed, retired, and non-publishable/g)).toHaveLength(3);
    expect(assets.match(/The 99 exact source-path\/category\/SHA-256 rows are indexed/g)).toHaveLength(1);
    expect(assets).toContain("Current hkwtia assets remain separate");
    expect(delivery).toContain("- Historical archive identity:");
  });

  it("rejects exact surviving matrix, legend, asset, and list-item regressions", () => {
    const docs = Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "template").map(([key, path]) => [key, readRequired(path, key)]));
    for (const [label, hostile] of [
      ["provenance unavailable", {...docs, provenance: docs.provenance.replace("Frozen authoritative Git source evidence", "Unavailable")}],
      ["component unavailable legend", {...docs, components: docs.components.replace("frozen Git-source evidence", "source-archive unavailable")}],
      ["component historical qualifier", {...docs, components: docs.components.replace("historical byte/history comparison is optional", "exact Site source component unavailable")}],
      ["content archive transfer", {...docs, content: docs.content.replace("All donor source inventory is reconciled", "Reconcile every Site file after archive transfer")}],
      ["content unavailable archive", {...docs, content: docs.content.replace("historical archive bytes are optional provenance only", "unavailable Site archive has not been reconciled")}],
      ["asset evidence absence", {...docs, assets: docs.assets.replace("Frozen donor file evidence; unreviewed, retired, and non-publishable", "No transferred file evidence")}],
    ] as const) expect(validateOriginalEvidenceMatrices(hostile), label).not.toEqual([]);
  });
});

function validateOriginalEvidenceMatrices(docs: Record<string, string>) {
  const errors: string[] = [];
  if ((docs.provenance.match(/Frozen authoritative Git source evidence/g) ?? []).length !== 5) errors.push("provenance matrix must have five positive frozen-source rows");
  for (const value of ["frozen Git-source evidence", "historical byte/history comparison is optional", "Frozen donor artifact evidence", "All donor source inventory is reconciled", "historical archive bytes are optional provenance only"]) if (!(docs.components + docs.content).includes(value)) errors.push(`missing positive matrix state: ${value}`);
  if ((docs.components.match(/historical byte\/history comparison is optional/g) ?? []).length !== 2) errors.push("component rows must preserve optional historical comparison");
  if ((docs.content.match(/All donor source inventory is reconciled/g) ?? []).length !== 2) errors.push("content rows must state reconciled donor inventory");
  if ((docs.content.match(/historical archive bytes are optional provenance only/g) ?? []).length !== 2) errors.push("content rows must retain optional historical provenance");
  if ((docs.assets.match(/Frozen donor file evidence; unreviewed, retired, and non-publishable/g) ?? []).length !== 3) errors.push("asset rows must acknowledge frozen evidence and publication boundary");
  if ((docs.assets.match(/The 99 exact source-path\/category\/SHA-256 rows are indexed/g) ?? []).length !== 1) errors.push("asset index handoff must not be duplicated");
  if (!docs.assets.includes("Current hkwtia assets remain separate")) errors.push("asset separation sentence must be capitalized");
  if (!docs.delivery.includes("- Historical archive identity:")) errors.push("delivery historical identity must remain a branch-context bullet");
  return errors;
}

describe("WiseTech complete donor semantic audit", () => {
  it("rejects surviving donor-unavailable denials while allowing historical byte equivalence limits", () => {
    const docs = Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "template").map(([key, path]) => [key, readRequired(path, key)]));
    expect(validateCompleteDonorSemanticState(docs)).toEqual([]);
    for (const [label, hostile] of [
      ["future donor proof", {...docs, provenance: docs.provenance + "\nA future source archive can prove donor implementation details.\n"}],
      ["identity only", {...docs, provenance: docs.provenance + "\nThe known Site commit/hash establishes a donor identity only and does not prove classification.\n"}],
      ["photo unavailable", {...docs, components: docs.components + "\nSite photo file is unavailable.\n"}],
      ["archive unavailable", {...docs, components: docs.components + "\nArchive unavailable; logos, metrics, and testimonials have no source evidence.\n"}],
      ["route unavailable", {...docs, routes: docs.routes + "\nThe protected inventory does not classify any unavailable Site archive route.\n"}],
    ] as const) expect(validateCompleteDonorSemanticState(hostile), label).not.toEqual([]);
    expect(validateCompleteDonorSemanticState({...docs, provenance: docs.provenance + "\nHistorical archive bytes are unavailable only for optional byte/history equivalence.\n"})).toEqual([]);
  });
});

function validateCompleteDonorSemanticState(docs: Record<string, string>) {
  const errors: string[] = [];
  const forbidden = ["future source archive can prove donor implementation details", "establishes a donor identity only and does not prove classification", "Site photo file is unavailable", "Archive unavailable; logos, metrics, and testimonials have no source evidence", "does not classify any unavailable Site archive route"];
  for (const [label, document] of Object.entries(docs)) for (const phrase of forbidden) if (document.includes(phrase)) errors.push(`${label}: donor source denial: ${phrase}`);
  return errors;
}
