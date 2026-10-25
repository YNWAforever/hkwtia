import {renderToStaticMarkup} from "react-dom/server";
import {expect, it, vi} from "vitest";
import type {ReactNode} from "react";
vi.mock("@/i18n/navigation", () => ({Link: ({children, href}: {children: ReactNode; href: string}) => <a href={href}>{children}</a>}));
import {PlanGrid} from "@/components/marketing/plan-grid";
it("keeps the unnumbered assistant outside the four-plan comparison", () => {
  const html = renderToStaticMarkup(<PlanGrid tiers={["community", "startup", "corporate", "patron"].map(code => ({code, name: code, description: "For members", priceLines: ["fee"], benefits: ["one", "two", "three"], action: "Join", href: `/join?plan=${code}`}))} sme={{label: "Help", title: "Assistant", copy: "Choose", action: "Contact", href: "/contact"}} />);
  const root = document.createElement("div"); root.innerHTML = html;
  expect(root.querySelectorAll(".plan-grid article")).toHaveLength(4);
  expect(root.querySelector(".plan-grid")?.textContent).not.toContain("Assistant");
  expect(root.querySelector(".membership-plan-assistant .card-index")).toBeNull();
  expect(root.querySelector(".membership-plan-assistant")?.textContent).toContain("Assistant");
});
