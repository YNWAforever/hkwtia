import {describe, expect, it, vi} from "vitest";

const translationState = vi.hoisted(() => ({messages: {} as Record<string, Record<string, string>>}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) => (key: string) => {
    const value = translationState.messages[namespace]?.[key];
    if (typeof value !== "string") throw new Error(`Missing test message: ${namespace}.${key}`);
    return value;
  }),
}));

describe("otherAboutRoutes", () => {
  it("excludes the current page and returns the other three, in a stable order", async () => {
    const {otherAboutRoutes} = await import("@/lib/about/related-routes");
    expect(otherAboutRoutes("about").map((route) => route.key)).toEqual(["history", "chairman", "committees"]);
    expect(otherAboutRoutes("history").map((route) => route.key)).toEqual(["about", "chairman", "committees"]);
    expect(otherAboutRoutes("chairman").map((route) => route.key)).toEqual(["about", "history", "committees"]);
    expect(otherAboutRoutes("committees").map((route) => route.key)).toEqual(["about", "history", "chairman"]);
  });
});

describe("buildOtherAboutRoutes", () => {
  it("reads each other route's real eyebrow/title/summary (or History's intro) from its own namespace", async () => {
    translationState.messages = {
      About: {
        eyebrow: "About WTIA",
        title: "A connected voice for wireless technology.",
        summary: "WTIA convenes members, partners and public stakeholders to advance Hong Kong's technology ecosystem.",
      },
      History: {
        eyebrow: "Since 2001",
        title: "Our history",
        intro: "Milestones from twenty-five years of building Hong Kong's wireless and technology industry.",
      },
      Chairman: {
        eyebrow: "Leadership",
        title: "Chairman's message",
        summary: "Working together to keep Hong Kong connected to emerging technology opportunities.",
      },
      Committees: {
        eyebrow: "Governance",
        title: "Committees that turn participation into action.",
        summary: "Member-led committees provide oversight and focused expertise across WTIA priorities.",
      },
    };
    const {buildOtherAboutRoutes} = await import("@/lib/about/related-routes");

    expect(await buildOtherAboutRoutes("en", "history")).toEqual([
      {href: "/about", label: "About WTIA", title: "A connected voice for wireless technology.", description: "WTIA convenes members, partners and public stakeholders to advance Hong Kong's technology ecosystem."},
      {href: "/about/chairman", label: "Leadership", title: "Chairman's message", description: "Working together to keep Hong Kong connected to emerging technology opportunities."},
      {href: "/about/committees", label: "Governance", title: "Committees that turn participation into action.", description: "Member-led committees provide oversight and focused expertise across WTIA priorities."},
    ]);
  });
});
