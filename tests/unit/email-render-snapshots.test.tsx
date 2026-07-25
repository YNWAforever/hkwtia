import {describe, expect, it} from "vitest";

import {EMAIL_TEMPLATE_IDS} from "@/lib/email/catalog";
import {renderEmail} from "@/lib/email/render";

const fixtureVars = {
  recipientName: "Fixture Member",
  ctaUrl: "https://www.hkwtia.org/portal",
  companyName: "Fixture Company",
  renewalDate: "30 September 2026",
  amount: "HK$1,000",
};

describe("renderEmail", () => {
  it.each(["en", "zh-HK"] as const)(
    "renders every approved template in %s without missing copy",
    async (locale) => {
      for (const template of EMAIL_TEMPLATE_IDS) {
        const rendered = await renderEmail({
          template,
          locale,
          recipientName: "Fixture Member",
          variables: fixtureVars,
          unsubscribeUrl: "https://www.hkwtia.org/api/unsubscribe?token=signed-fixture",
        });

        expect(rendered.subject).not.toMatch(/MISSING|undefined/i);
        expect(rendered.html).not.toMatch(/MISSING|undefined/i);
        expect(rendered.text).not.toMatch(/MISSING|undefined/i);
        expect(rendered.html).toMatchSnapshot(`${locale}-${template}`);
      }
    },
  );

  it("renders accessible language, title, preheader, and dark-mode styles", async () => {
    const rendered = await renderEmail({
      template: "day1_video",
      locale: "zh-HK",
      recipientName: "Fixture Member",
      variables: fixtureVars,
      unsubscribeUrl: "https://www.hkwtia.org/api/unsubscribe?token=signed-fixture",
    });

    expect(rendered.html).toMatch(/<html[^>]*lang="zh-HK"/);
    expect(rendered.html).toContain("<title>");
    expect(rendered.html).toContain("email-preheader");
    expect(rendered.html).toContain(".email-brand { color: #93c5fd !important; }");
    expect(rendered.html).toContain('class="email-brand"');
    expect(rendered.html).toContain("@media (prefers-color-scheme: dark)");
    expect(rendered.html).toContain(".email-heading { color: #f8fafc !important; }");
    expect(rendered.html).toContain(".email-copy { color: #e2e8f0 !important; }");
  });

  it("adds visible address, unsubscribe copy, and one-click headers only to marketing email", async () => {
    const unsubscribeUrl = "https://www.hkwtia.org/api/unsubscribe?token=signed-fixture";
    const marketing = await renderEmail({
      template: "day1_video",
      locale: "en",
      recipientName: "Fixture Member",
      variables: fixtureVars,
      unsubscribeUrl,
    });
    const transactional = await renderEmail({
      template: "welcome",
      locale: "en",
      recipientName: "Fixture Member",
      variables: fixtureVars,
    });

    expect(marketing.html).toContain("4/F, KOHO, 73-75 Hung To Road, Kwun Tong, Hong Kong");
    expect(marketing.html).toContain("Unsubscribe from marketing email");
    expect(marketing.headers).toEqual({
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });

    expect(transactional.html).not.toContain("4/F, KOHO, 73-75 Hung To Road, Kwun Tong, Hong Kong");
    expect(transactional.html).not.toContain("Unsubscribe from marketing email");
    expect(transactional.headers).toEqual({});
  });

  it("fails closed when a marketing email has no signed unsubscribe URL", async () => {
    await expect(renderEmail({
      template: "campaign_generic",
      locale: "en",
      recipientName: "Fixture Member",
      variables: fixtureVars,
    })).rejects.toThrow("MARKETING_UNSUBSCRIBE_URL_REQUIRED");
  });

  it.each([
    ["missing", {recipientName: "Fixture Member"}],
    ["blank", {...fixtureVars, ctaUrl: "  "}],
  ])("fails closed when the CTA URL is %s", async (_kind, variables) => {
    await expect(renderEmail({
      template: "welcome",
      locale: "en",
      recipientName: "Fixture Member",
      variables,
    })).rejects.toThrow("EMAIL_CTA_URL_REQUIRED");
  });
});
