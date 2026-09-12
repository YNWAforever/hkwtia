import {describe, expect, it} from "vitest";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {resolveTemplateBody} from "@/lib/whatsapp/template-body";

/**
 * C-9 review. Three outbound paths now read this one function — the journey
 * runner, the notifications dispatcher and the staff inbox — so its contract is
 * pinned here rather than inferred from any one of them.
 *
 * The rule it enforces: `lib/channels/woztell.ts` fills a BODY parameter it was
 * not given with `""`, Meta rejects an empty BODY parameter, and S-15 makes the
 * resulting 4xx permanent. So a blank is never a degraded message — it is a
 * failed delivery and a staff task per recipient, which is why the refusal has
 * to happen before the adapter and not inside it.
 */
describe("resolveTemplateBody", () => {
  it("returns exactly the declared parameters, dropping anything else the caller carried", () => {
    // The journey lane hands over a whole context bag — ctaUrl, profileUrl,
    // membershipStatus and more — and only the declared keys may reach the
    // provider, in the order the template declares them.
    const body = resolveTemplateBody("renewal_14", {
      memberName: "Chan Tai Man",
      renewalDate: "2027-02-01",
      renewalUrl: "https://example.test/renew",
      ctaUrl: "https://example.test/member",
      membershipStatus: "active",
    });

    expect(body).toEqual({
      memberName: "Chan Tai Man",
      renewalDate: "2027-02-01",
      renewalUrl: "https://example.test/renew",
    });
    expect(Object.keys(body ?? {})).toEqual([...WHATSAPP_TEMPLATES.renewal_14.variables]);
  });

  it.each([
    ["absent", {memberName: "Chan Tai Man", renewalUrl: "https://example.test/renew"}],
    ["empty", {memberName: "Chan Tai Man", renewalDate: "", renewalUrl: "https://example.test/renew"}],
    ["whitespace", {memberName: "Chan Tai Man", renewalDate: "   ", renewalUrl: "https://example.test/renew"}],
  ])("refuses the whole body when a declared parameter is %s", (_label, variables) => {
    // All three are the same thing to the provider, and only one of them looks
    // wrong to a reader — which is why the check is `trim() === ""` and not a
    // presence test.
    expect(resolveTemplateBody("renewal_14", variables)).toBeNull();
  });

  it("accepts a numeric variable, and zero is a value rather than a blank", () => {
    // The journey lane's bag is `EmailVariables` (`string | number`), so a
    // number is legitimate. `0` must survive: a falsy check here would refuse a
    // legitimate "0" and turn a sendable message into a silently skipped one.
    const body = resolveTemplateBody("wtia_announcement_en", {
      memberName: "Chan Tai Man",
      headline: 0,
      detailUrl: "https://example.test/news",
    });

    expect(body?.headline).toBe("0");
  });

  it("resolves a full body for every configured template, so no key is unsendable by construction", () => {
    // A template whose parameters cannot all be supplied is a template the
    // registry should never approve. This is the cheap version of that check:
    // every configured key can produce a body at all.
    for (const [key, template] of Object.entries(WHATSAPP_TEMPLATES)) {
      const variables = Object.fromEntries(template.variables.map((name) => [name, `value-${name}`]));
      expect(resolveTemplateBody(key as keyof typeof WHATSAPP_TEMPLATES, variables), key).not.toBeNull();
    }
  });
});
