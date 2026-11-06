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

const APPROVED_CORPORATE_BENEFITS = {
  en: [
    "Free participation in networking events with industry experts and professionals",
    "Exclusive networking and business-matching events with C-suite / director-level professionals in wireless & mobile industries",
    "Marketing your in-house events on WTIA social networks",
    "Speaking opportunities in WTIA-organised events and career fairs at higher education institutions",
    "Free posting of job ads and career talks on WTIA website and social networks",
    "Priority invitations to flagship events (e.g. Hong Kong ICT Awards, Tech To Connect)",
  ],
  "zh-HK": [
    "免費參加與業界專家及專業人士的交流活動",
    "與無線及流動通訊業高級管理層／總監級人士的專屬交流及商業配對活動",
    "於 WTIA 社交平台宣傳公司活動",
    "WTIA 活動及大專院校職業博覽的演講機會",
    "免費於 WTIA 網站及社交平台刊登招聘廣告及職業講座",
    "旗艦活動優先邀請（例如香港資訊及通訊科技獎、Tech To Connect）",
  ],
} as const;

const APPROVED_PLATINUM_BENEFITS = {
  en: [
    "Everything in Corporate",
    "Opportunities to join Sub-Committee or Advisory Board",
    "Eligible to vote at WTIA AGM / EGM (General Meetings)",
    "Your first representative is eligible for election to the Executive Committee",
    "Option of a Bespoke Partnership Contract (customised partnership & membership agreement)",
  ],
  "zh-HK": [
    "包括企業會員全部權益",
    "有機會加入小組委員會或顧問委員會",
    "可於 WTIA 週年大會（AGM）／特別大會（EGM）投票",
    "第一代表有權被選為執行委員會成員",
    "可選擇度身訂造的合作及會籍協議（Bespoke Partnership Contract）",
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
  const items = (code: string) => [...(root.querySelector(`#${code}`)?.querySelectorAll("li") ?? [])].map((item) => item.textContent);
  expect(items("corporate")).toEqual(["one", "two", "three"]);
  expect(root.querySelector("#startup ul")).toBeNull();
  expect(root.querySelector("#patron ul")).toBeNull();
  expect(root.querySelector("#community ul")).toBeNull();
});

it.each(["en", "zh-HK"] as const)("renders the approved %s lines: individual 3, corporate 6, platinum 5", (locale) => {
  const individual = APPROVED_INDIVIDUAL_BENEFITS[locale];
  const corporate = APPROVED_CORPORATE_BENEFITS[locale];
  const platinum = APPROVED_PLATINUM_BENEFITS[locale];
  const html = renderToStaticMarkup(<PlanGrid tiers={[
    tier("community", ["Directory card on /members"]),
    tier("individual", individual),
    tier("corporate", corporate),
    tier("platinum", platinum),
  ]} sme={{label: "Help", title: "Assistant", copy: "Choose", action: "Contact", href: "/contact"}} />);
  const root = document.createElement("div"); root.innerHTML = html;
  const items = (code: string) => [...(root.querySelector(`#${code}`)?.querySelectorAll("li") ?? [])].map((item) => item.textContent);
  expect(individual).toHaveLength(3);
  expect(corporate).toHaveLength(6);
  expect(platinum).toHaveLength(5);
  expect(items("individual")).toEqual([...individual]);
  expect(items("corporate")).toEqual([...corporate]);
  expect(items("platinum")).toEqual([...platinum]);
  expect(root.querySelectorAll("#individual ul")).toHaveLength(1);
  expect(root.querySelectorAll("#corporate ul")).toHaveLength(1);
  expect(root.querySelectorAll("#platinum ul")).toHaveLength(1);
  expect(root.querySelector("#community ul")).toBeNull();
  expect(html).not.toContain("Directory card on /members");
  expect(html).not.toContain("Featured member profile and logo wall");
  expect(html).not.toContain("3 showcase listings");
});
