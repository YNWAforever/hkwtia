import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {buildRawMessageKeyPattern} from "../helpers/raw-message-key";

const namespaces = Object.keys(
  JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")) as Record<string, unknown>
);
const rawKey = buildRawMessageKeyPattern(namespaces);

// Unit coverage for tests/helpers/raw-message-key.ts, the pattern the e2e-only
// tests/e2e/wisetech-zh-walk.spec.ts uses to catch a raw i18n key leaking into rendered text.
// The walk itself stays e2e (it needs a live rendered page); this file pins the pattern's shape
// against known text so a future edit can't silently narrow or widen it without a failing test.
describe("raw message key pattern", () => {
  it("catches a digit-bearing key segment the old letters-only class missed", () => {
    // Membership.first90.* renders on /zh/membership, which the walk covers. An
    // [A-Za-z]+-only segment class stops matching at the digit and misses the leak entirely.
    expect("Membership.first90.eyebrow").toMatch(rawKey);
    expect("Join.backToMembership").toMatch(rawKey);
  });

  it("does not match ordinary domains, emails, version strings or sentence-ending abbreviations", () => {
    expect("WTIA.org.hk").not.toMatch(rawKey);
    expect("info@hkwtia.org.hk").not.toMatch(rawKey);
    expect("Node.js").not.toMatch(rawKey);
    expect("v1.2.3").not.toMatch(rawKey);
    // A sentence ending in "Events." followed by a new sentence, not a namespaced key.
    expect("Events. Next").not.toMatch(rawKey);
  });
});
