import {renderToStaticMarkup} from "react-dom/server";
import {expect, it, vi} from "vitest";
import type {ReactNode} from "react";
vi.mock("@/i18n/navigation", () => ({Link: ({children, href}: {children: ReactNode; href: string}) => <a href={href}>{children}</a>}));
import {PlanGrid, type PlanGridTier} from "@/components/marketing/plan-grid";

const APPROVED_INDIVIDUAL_BENEFITS = {
  en: [
    "Free participation in networking events with industry experts and professionals",
    "Exclusive networking and business-matching events with C-suite or director-level professionals in the wireless and mobile industries",
    "WTIA event invitations and industry updates by email",
  ],
  "zh-HK": [
    "免費參加業界交流活動，與業界專家及專業人士建立聯繫",
    "專屬交流及商業配對活動，接觸無線及流動通訊業界的高級管理層／總監級專業人士",
    "透過電郵接收 WTIA 活動邀請及業界資訊",
  ],
} as const;

function tier(code: string, benefits: readonly string[]): PlanGridTier {
  return {code, name: code, description: "For members", priceLines: ["fee"], benefits, action: "Join", href: `/join?plan=${code}`};
}

it("keeps the unnumbered assistant outside the four-plan comparison", () => {
  const html = renderToStaticMarkup(<PlanGrid tiers={["community", "startup", "corporate", "patron"].map(code => tier(code, ["one", "two", "three"]))} sme={{label: "Help", title: "Assistant", copy: "Choose", action: "Contact", href: "/contact"}} />);
  const root = document.createElement("div"); root.innerHTML = html;
  expect(root.querySelectorAll(".plan-grid article")).toHaveLength(4);
  expect(root.querySelector(".plan-grid")?.textContent).not.toContain("Assistant");
  expect(root.querySelector(".membership-plan-assistant .card-index")).toBeNull();
  expect(root.querySelector(".membership-plan-assistant")?.textContent).toContain("Assistant");
  expect(html).not.toContain("one");
  expect(html).not.toContain("<ul");
});

it.each(["en", "zh-HK"] as const)("renders exactly the approved %s lines on the individual card and none on corporate or platinum", (locale) => {
  const lines = APPROVED_INDIVIDUAL_BENEFITS[locale];
  const html = renderToStaticMarkup(<PlanGrid tiers={[
    tier("community", ["Directory card on /members"]),
    tier("individual", lines),
    tier("corporate", ["Featured member profile and logo wall", "3 showcase listings"]),
    tier("platinum", ["Everything in Corporate"]),
  ]} sme={{label: "Help", title: "Assistant", copy: "Choose", action: "Contact", href: "/contact"}} />);
  const root = document.createElement("div"); root.innerHTML = html;
  const items = (code: string) => [...(root.querySelector(`#${code}`)?.querySelectorAll("li") ?? [])].map((item) => item.textContent);
  expect(items("individual")).toEqual([...lines]);
  expect(root.querySelectorAll("#individual ul")).toHaveLength(1);
  expect(root.querySelector("#corporate ul")).toBeNull();
  expect(root.querySelector("#platinum ul")).toBeNull();
  expect(root.querySelector("#community ul")).toBeNull();
  expect(html).not.toContain("Featured member profile and logo wall");
  expect(html).not.toContain("3 showcase listings");
  expect(html).not.toContain("Everything in Corporate");
  expect(html).not.toContain("Directory card on /members");
});
