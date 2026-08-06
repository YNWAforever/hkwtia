import {describe, expect, it} from "vitest";

import {
  applyPageCopy,
  icuPlaceholders,
  pageCopyLeaves,
  pageCopyRejection,
  readLeaf,
  type PageCopyOverride,
} from "@/lib/i18n/apply-page-copy";

function bundle() {
  return {
    Home: {
      title: "Hong Kong Wireless Technology Industry Association",
      stats: [
        {value: "1,000+", label: "members"},
        {value: "25", label: "years"},
      ],
    },
    Privacy: {
      title: "Privacy notice",
      sections: [
        {heading: "What we collect", body: ["Your name.", "Your email."]},
        {heading: "How long we keep it", body: ["Until you ask us to delete it."]},
      ],
    },
    Footer: {copyright: "© {year} HKWTIA"},
    LaunchPad: {applyCta: "Apply"},
  };
}

function override(keyPath: string, value: string, namespace = "Privacy"): PageCopyOverride {
  return {namespace: namespace as PageCopyOverride["namespace"], keyPath, value};
}

describe("applyPageCopy", () => {
  it("replaces a leaf nested under an array and keeps the array an array", () => {
    const merged = applyPageCopy(bundle(), [override("sections.0.body.0", "Your full name.")]);

    expect(merged.Privacy.sections[0]?.body[0]).toBe("Your full name.");
    // A generic deep merge would leave an object keyed "0" here, which
    // type-checks and silently breaks every t.raw() consumer.
    expect(Array.isArray(merged.Privacy.sections)).toBe(true);
    expect(Array.isArray(merged.Privacy.sections[0]?.body)).toBe(true);
    expect(merged.Privacy.sections).toHaveLength(2);
    expect(merged.Privacy.sections[0]?.body).toHaveLength(2);
  });

  it("leaves every untouched value in place", () => {
    const merged = applyPageCopy(bundle(), [override("sections.0.body.0", "Your full name.")]);

    expect(merged.Privacy.sections[0]?.heading).toBe("What we collect");
    expect(merged.Privacy.sections[0]?.body[1]).toBe("Your email.");
    expect(merged.Privacy.sections[1]).toEqual(bundle().Privacy.sections[1]);
    expect(merged.Home).toEqual(bundle().Home);
    expect(merged.LaunchPad).toEqual(bundle().LaunchPad);
  });

  it("never mutates the bundle it was given", () => {
    const input = bundle();
    applyPageCopy(input, [override("sections.0.body.0", "Edited.")]);

    expect(input.Privacy.sections[0]?.body[0]).toBe("Your name.");
  });

  it("applies several overrides to the same array, including different indices", () => {
    const merged = applyPageCopy(bundle(), [
      override("sections.0.body.0", "One."),
      override("sections.0.body.1", "Two."),
      override("sections.1.heading", "Retention"),
      override("title", "Our privacy notice"),
      override("stats.1.value", "26", "Home"),
    ]);

    expect(merged.Privacy.sections[0]?.body).toEqual(["One.", "Two."]);
    expect(merged.Privacy.sections[1]?.heading).toBe("Retention");
    expect(merged.Privacy.title).toBe("Our privacy notice");
    expect(merged.Home.stats[1]).toEqual({value: "26", label: "years"});
    expect(Array.isArray(merged.Home.stats)).toBe(true);
  });

  it("returns the bundle itself when there is nothing to apply", () => {
    const input = bundle();

    expect(applyPageCopy(input, [])).toBe(input);
    expect(applyPageCopy(input, [override("sections.9.body.0", "Nope")])).toBe(input);
  });

  it.each([
    ["an out-of-scope namespace", override("applyCta", "Join now", "LaunchPad")],
    ["an unknown key path", override("sections.0.missing", "Nope")],
    ["an out-of-range array index", override("sections.7.heading", "Nope")],
    ["a negative-looking index", override("sections.-1.heading", "Nope")],
    ["a container rather than a leaf", override("sections", "Nope")],
    ["a prototype-pollution path", override("__proto__.polluted", "Nope")],
  ])("drops %s", (_case, dropped) => {
    const merged = applyPageCopy(bundle(), [dropped, override("title", "Kept")]);

    expect(merged).toEqual({...bundle(), Privacy: {...bundle().Privacy, title: "Kept"}});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("pageCopyRejection", () => {
  it.each([
    ["NAMESPACE_NOT_EDITABLE", {namespace: "LaunchPad", keyPath: "applyCta", value: "Join"}],
    ["KEY_PATH_UNKNOWN", {namespace: "Privacy", keyPath: "sections.0.nope", value: "x"}],
    ["KEY_PATH_UNKNOWN", {namespace: "Privacy", keyPath: "sections", value: "x"}],
  ])("returns %s", (expected, candidate) => {
    expect(pageCopyRejection(bundle(), candidate)).toBe(expected);
  });

  it("accepts a valid replacement", () => {
    expect(pageCopyRejection(bundle(), {
      namespace: "Privacy", keyPath: "sections.1.body.0", value: "Seven years.",
    })).toBeNull();
  });

  it("rejects a value whose ICU placeholders differ from the shipped one", () => {
    const withPlaceholder = {Home: {title: "Since {year}"}};

    expect(pageCopyRejection(withPlaceholder, {
      namespace: "Home", keyPath: "title", value: "Since {yr}",
    })).toBe("PLACEHOLDER_MISMATCH");
    expect(pageCopyRejection(withPlaceholder, {
      namespace: "Home", keyPath: "title", value: "Founded in {year}",
    })).toBeNull();
  });
});

describe("page copy helpers", () => {
  it("enumerates every string leaf as a dotted path in bundle order", () => {
    expect(pageCopyLeaves(bundle(), "Privacy").map(({keyPath}) => keyPath)).toEqual([
      "title",
      "sections.0.heading",
      "sections.0.body.0",
      "sections.0.body.1",
      "sections.1.heading",
      "sections.1.body.0",
    ]);
    expect(pageCopyLeaves(bundle(), "Missing")).toEqual([]);
  });

  it("reads a leaf and refuses a container", () => {
    expect(readLeaf(bundle(), "Privacy.sections.0.heading")).toBe("What we collect");
    expect(readLeaf(bundle(), "Privacy.sections.0")).toBeNull();
    expect(readLeaf(bundle(), "Privacy.sections.0.heading.extra")).toBeNull();
  });

  it("extracts sorted ICU argument names", () => {
    expect(icuPlaceholders("© {year} HKWTIA")).toEqual(["year"]);
    expect(icuPlaceholders("{count, plural, one {# item} other {# items}}")).toEqual(["count"]);
    expect(icuPlaceholders("no placeholders")).toEqual([]);
  });
});
