import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

import {BenefitCards} from "@/components/portal/dashboard/benefit-cards";
import {MembershipGlance} from "@/components/portal/dashboard/membership-glance";
import {NextStep} from "@/components/portal/dashboard/next-step";
import {WelcomeBand} from "@/components/portal/dashboard/welcome-band";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

const glanceLabels = {title: "Membership at a glance", plan: "Plan", renews: "Renews on", ends: "Ends on", seats: "Seats", manageSeats: "Manage seats"};

describe("MembershipGlance", () => {
  it("omits the date term when there is no period end", () => {
    render(<MembershipGlance locale="en" planLabel="Startup" periodEnd={null} endsAtPeriodEnd={false} seatsValue="3 seats" labels={glanceLabels} />);
    expect(screen.getByText("Startup")).toBeTruthy();
    expect(screen.getByText("3 seats")).toBeTruthy();
    expect(screen.queryByText("Renews on")).toBeNull();
    expect(screen.queryByText("Ends on")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Invalid Date/);
  });

  it("shows the ends label and a long-form Hong Kong date when ending at period end", () => {
    render(<MembershipGlance locale="en" planLabel="Startup" periodEnd={new Date("2026-12-31T20:00:00Z")} endsAtPeriodEnd seatsValue="3 seats" labels={glanceLabels} />);
    expect(screen.getByText("Ends on")).toBeTruthy();
    expect(screen.queryByText("Renews on")).toBeNull();
    // 20:00Z on 31 Dec is already 1 Jan in Hong Kong.
    expect(screen.getByText("January 1, 2027")).toBeTruthy();
  });

  it("renders a zero seat count and links the seats row to seat management", () => {
    render(<MembershipGlance locale="en" planLabel="Community" periodEnd={new Date("2026-12-01T00:00:00Z")} endsAtPeriodEnd={false} seatsValue="0 seats" labels={glanceLabels} />);
    expect(screen.getByText("0 seats")).toBeTruthy();
    expect(screen.getByText("Renews on")).toBeTruthy();
    expect(screen.getByRole("link", {name: /Manage seats/}).getAttribute("href")).toBe("/portal/company/seats");
  });
});

describe("WelcomeBand", () => {
  it("renders no company element without a company name", () => {
    const {container} = render(<WelcomeBand greeting="Welcome back, Ada." planLabel="Startup" statusLabel="Active" />);
    expect(screen.getByRole("heading", {level: 1}).textContent).toBe("Welcome back, Ada.");
    expect(container.querySelector(".portal-welcome-company")).toBeNull();
  });

  it("renders the company name when present", () => {
    const {container} = render(<WelcomeBand greeting="Hi" companyName="Acme Ltd" planLabel="Startup" statusLabel="Active" />);
    expect(container.querySelector(".portal-welcome-company")?.textContent).toBe("Acme Ltd");
  });
});

describe("NextStep", () => {
  it("renders no link without an action", () => {
    render(<NextStep label="Your next step" title="Under review" body="We will contact you." />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("renders a labelled two-step list and one link", () => {
    const {container} = render(
      <NextStep
        label="Your next step"
        title="Add your company details"
        body="Used for seats."
        action={{href: "/portal/company", label: "Open company"}}
        progress={{summary: "1 of 2 steps done", steps: [{label: "Profile", done: true}, {label: "Company", done: false}]}}
      />,
    );
    const list = screen.getByRole("list", {name: "1 of 2 steps done"});
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].className).toContain("done");
    expect(items[1].className).not.toContain("done");
    expect(container.querySelector("ol.portal-steps")).toBe(list);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/portal/company");
  });
});

describe("BenefitCards", () => {
  it("links each benefit", () => {
    render(
      <BenefitCards
        title="Your benefits"
        actionLabel="Open"
        items={[
          {href: "/portal/events", title: "Events", copy: "a"},
          {href: "/portal/directory", title: "Directory", copy: "b"},
          {href: "/portal/tools", title: "Tools", copy: "c"},
        ]}
      />,
    );
    expect(screen.getByRole("heading", {name: "Your benefits"})).toBeTruthy();
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/portal/events", "/portal/directory", "/portal/tools"]);
  });
});
