import {describe, expect, it} from "vitest";

import {parsePolicySections} from "@/components/marketing/policy-sections";
import {publicRoutes} from "@/config/public-routes";
import {pageCopyNamespaces} from "@/lib/i18n/page-copy-scope";
import {ROUTE_BREADCRUMB_LABEL_KEYS} from "@/lib/seo/route-breadcrumbs";
import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";

const bundles = [
  ["en", en as unknown as Record<string, unknown>],
  ["zh-HK", zhHK as unknown as Record<string, unknown>],
] as const;

/** The namespace surface the page reads; anything extra is copy drift, anything missing is a crash. */
const refundPolicyKeys = [
  "metaTitle",
  "metaDescription",
  "eyebrow",
  "title",
  "description",
  "breadcrumbCurrent",
  "sections",
] as const;

function namespaceOf(bundle: Record<string, unknown>): Record<string, unknown> {
  return bundle.RefundPolicy as Record<string, unknown>;
}

function messageAt(bundle: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (node, part) => (node as Record<string, unknown> | undefined)?.[part],
    bundle,
  );
}

describe("refund policy page", () => {
  it("declares RefundPolicy in both bundles with the same key set", () => {
    for (const [locale, bundle] of bundles) {
      const namespace = namespaceOf(bundle);
      expect(namespace, locale).toBeDefined();
      expect(Object.keys(namespace).sort(), locale).toEqual([...refundPolicyKeys].sort());
    }
  });

  it("parses into at least four headed sections in both locales", () => {
    for (const [locale, bundle] of bundles) {
      const sections = parsePolicySections(namespaceOf(bundle).sections);
      expect(sections.length, locale).toBeGreaterThanOrEqual(4);
      for (const section of sections) {
        expect(section.heading.trim(), `${locale}: ${section.heading}`).not.toBe("");
      }
    }
  });

  it("keeps the cancelled-event promise that the refund tool can honour", () => {
    // §4.5 makes this a public promise, so it must survive an edit to the copy. The
    // assertion is semantic rather than a literal: the section must say a WTIA-cancelled
    // event refunds the whole paid order in full, in both locales.
    // One claim, not two words: asserting `/refund/i` and `/full/i` independently
    // passes on "Not every paid order is refunded in full." because both tokens
    // are present and unrelated. The promise is the whole phrase, and a negation
    // in front of "every" is rejected, not merely the vocabulary.
    const english = parsePolicySections(namespaceOf(bundles[0][1]).sections)
      .find((section) => /cancel/i.test(section.heading));
    expect(english, "no English cancellation section").toBeDefined();
    expect(english!.body.join(" ")).toMatch(/every paid order is refunded in full/i);
    expect(english!.body.join(" ")).not.toMatch(/\bnot\s+every\b/i);

    const chinese = parsePolicySections(namespaceOf(bundles[1][1]).sections)
      .find((section) => /取消/.test(section.heading));
    expect(chinese, "no Chinese cancellation section").toBeDefined();
    // The Chinese promise, as a phrase: every paid order receives a full refund.
    expect(chinese!.body.join(" ")).toMatch(/所有已付款訂單[^。]*全額退款/);
    expect(chinese!.body.join(" ")).not.toMatch(/並非所有|不是所有/);
  });

  it("registers the route, its breadcrumb label and its editable namespace", () => {
    expect([...publicRoutes]).toContain("/refund-policy");

    const labels = ROUTE_BREADCRUMB_LABEL_KEYS as Readonly<Record<string, string | undefined>>;
    const key = labels["/refund-policy"];
    expect(key).toBe("Common.breadcrumbRefundPolicy");
    for (const [locale, bundle] of bundles) {
      // A label that does not resolve throws MISSING_MESSAGE at request time and takes
      // the page down -- the shape of the /admin/page-copy outage of 2026-09-13.
      expect(messageAt(bundle, key!), locale).toBeTypeOf("string");
    }

    expect([...pageCopyNamespaces]).toContain("RefundPolicy");
  });
});
