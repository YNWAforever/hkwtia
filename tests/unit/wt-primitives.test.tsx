import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {Button} from "@/components/ui/button";
import {ActionLink} from "@/components/wt/action-link";
import {Arrow} from "@/components/wt/arrow";
import {CardGrid} from "@/components/wt/card-grid";
import {CardIndex} from "@/components/wt/card-index";
import {ClosingBand} from "@/components/wt/closing-band";
import {Eyebrow} from "@/components/wt/eyebrow";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {InterestBand} from "@/components/wt/interest-band";
import {PageHero} from "@/components/wt/page-hero";
import {PageUpdated} from "@/components/wt/page-updated";
import {Section} from "@/components/wt/section";
import {SectionHeading} from "@/components/wt/section-heading";
import {Shell} from "@/components/wt/shell";
import {StatusLabel} from "@/components/wt/status-label";
import {StepGrid} from "@/components/wt/step-grid";

vi.mock("next/image", () => ({
  default: ({fill: _fill, priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {fill?: boolean; priority?: boolean}) =>
    <img {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));

describe("wt primitives", () => {
  it("Arrow is decorative", () => {
    const {container} = render(<Arrow />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.textContent).toBe("↗");
  });

  it("Eyebrow, StatusLabel and CardIndex carry the donor classes", () => {
    render(<><Eyebrow light>Open now</Eyebrow><StatusLabel as="p">Current availability</StatusLabel><CardIndex index={3} /></>);
    expect(screen.getByText("Open now")).toHaveClass("eyebrow", "light");
    expect(screen.getByText("Current availability").tagName).toBe("P");
    expect(screen.getByText("Current availability")).toHaveClass("status-label");
    expect(screen.getByText("03")).toHaveClass("card-index");
  });

  it("Shell and Section compose the donor layout classes and tones", () => {
    const {container} = render(
      <Section tone="ink" id="open-now" labelledBy="open-now-title" shellClassName="extra"><p>body</p></Section>,
    );
    const section = container.querySelector("section");
    expect(section).toHaveClass("section", "opportunity-section");
    expect(section).toHaveAttribute("id", "open-now");
    expect(section).toHaveAttribute("aria-labelledby", "open-now-title");
    expect(section?.firstElementChild).toHaveClass("shell", "extra");
    const bright = render(<Section tone="bright"><p>b</p></Section>);
    expect(bright.container.querySelector("section")).toHaveClass("section", "inner-section", "inner-section-tint");
    const shell = render(<Shell className="grid">x</Shell>);
    expect(shell.container.firstElementChild).toHaveClass("shell", "grid");
  });

  it("SectionHeading renders the stacked, split and inner grammars", () => {
    const stacked = render(<SectionHeading eyebrow="Demand" title="Connections" id="s1" />);
    expect(stacked.container.firstElementChild).toHaveClass("section-heading");
    expect(stacked.container.querySelector("h2#s1")).toHaveTextContent("Connections");
    const split = render(<SectionHeading layout="split" inverse eyebrow="Open now" title="What can you join?" lead="Only confirmed" />);
    const splitRoot = split.container.firstElementChild;
    expect(splitRoot).toHaveClass("section-heading", "split-heading", "inverse");
    expect(splitRoot?.firstElementChild?.tagName).toBe("DIV");
    expect(split.getByText("Open now")).toHaveClass("eyebrow", "light");
    expect(splitRoot?.lastElementChild).toHaveTextContent("Only confirmed");
    const inner = render(<SectionHeading layout="inner" eyebrow="Content hub" title="Knowledge" lead="Put to work" />);
    expect(inner.container.firstElementChild).toHaveClass("inner-section-heading");
    expect(inner.container.firstElementChild?.lastElementChild?.tagName).toBe("P");
  });

  it("ActionLink renders the donor link tones with a decorative arrow", () => {
    render(<><ActionLink href="/events">Find an event</ActionLink><ActionLink href="/membership" tone="text-link-light">Compare</ActionLink></>);
    expect(screen.getByRole("link", {name: "Find an event"})).toHaveClass("button");
    expect(screen.getByRole("link", {name: "Compare"})).toHaveClass("text-link", "light-link");
  });

  it("HonestEmpty is a polite status region with a decorative pulse ring and an action slot", () => {
    render(
      <HonestEmpty label="Current availability" title="No activities are currently open." copy="Only confirmed activities appear here." actions={<a href="mailto:contact@hkwtia.org">Updates</a>} />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("honest-empty");
    expect(status.querySelector(".pulse-ring")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Current availability")).toHaveClass("status-label");
    expect(screen.getByRole("heading", {level: 3})).toHaveTextContent("No activities are currently open.");
    expect(status.querySelector(".open-now-actions a")).toHaveAttribute("href", "mailto:contact@hkwtia.org");
  });

  it("HonestEmpty tones map to the donor classes", () => {
    const light = render(<HonestEmpty tone="light" label="l" title="t" copy="c" headingLevel={2} />);
    expect(light.container.firstElementChild).toHaveClass("honest-empty", "light-empty");
    expect(light.getByRole("heading", {level: 2})).toHaveTextContent("t");
    const inner = render(<HonestEmpty tone="inner" label="l" title="t" copy="c" />);
    expect(inner.container.firstElementChild).toHaveClass("inner-honest");
    expect(inner.container.firstElementChild).toHaveAttribute("role", "status");
  });

  it("PageHero renders the donor structure over an own-origin figure", () => {
    render(
      <PageHero
        variant="inner"
        eyebrow="Events"
        title="Find an activity"
        lead="Lead copy"
        artMark="W+"
        image={{src: "/images/projects-hero.jpg", alt: "Community", caption: "WTIA archive"}}
        actions={{primary: {href: "/events", label: "Find an event"}, secondary: {href: "/membership", label: "Compare"}}}
        breadcrumb={{homeHref: "/", homeLabel: "Home", current: "Events"}}
      />,
    );
    const section = document.querySelector("section");
    expect(section).toHaveClass("page-hero", "inner-page-hero");
    expect(screen.getByRole("heading", {level: 1})).toHaveTextContent("Find an activity");
    expect(screen.getByText("Events", {selector: "p"})).toHaveClass("eyebrow", "light");
    expect(screen.getByRole("img", {name: "Community"})).toHaveAttribute("src", "/images/projects-hero.jpg");
    expect(screen.getByText("WTIA archive").tagName).toBe("FIGCAPTION");
    expect(screen.getByRole("link", {name: "Find an event"})).toHaveClass("button", "button-light");
    expect(screen.getByRole("link", {name: "Compare"})).toHaveClass("text-link", "light-link");
    expect(screen.getByRole("link", {name: "Home"})).toHaveAttribute("href", "/");
    expect(document.querySelector(".breadcrumb b")).toHaveTextContent("Events");
    expect(document.querySelector(".page-hero-art")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".page-hero-art span")).toHaveTextContent("W+");
  });

  it("PageHero omits the figure and art when not supplied and rejects images that are not own-origin", () => {
    const plain = render(<PageHero eyebrow="About" title="Who we are" lead="Lead" />);
    expect(plain.container.querySelector("figure")).toBeNull();
    expect(plain.container.querySelector(".page-hero-art")).toBeNull();
    expect(plain.container.querySelector("section")).not.toHaveClass("inner-page-hero");
    expect(() => render(<PageHero eyebrow="e" title="t" lead="l" image={{src: "https://example.com/hero.jpg", alt: ""}} />)).toThrow("OWN_ORIGIN_IMAGE_REQUIRED");
  });

  it("ClosingBand styles the first action as a light button and the rest as light text links", () => {
    render(<ClosingBand id="host" eyebrow="Take the next step" title="Host an activity" copy="Copy" actions={[{href: "/contact", label: "Talk to us"}, {href: "/events", label: "See events"}]} />);
    const section = document.querySelector("section#host");
    expect(section).toHaveClass("inner-closing");
    expect(section?.firstElementChild).toHaveClass("shell", "inner-closing-grid");
    expect(screen.getByRole("link", {name: "Talk to us"})).toHaveClass("button", "button-light");
    expect(screen.getByRole("link", {name: "See events"})).toHaveClass("text-link", "light-link");
    expect(screen.getByText("Take the next step")).toHaveClass("eyebrow", "light");
  });

  it("InterestBand places the copy block and the action slot inside the grid shell", () => {
    render(<InterestBand id="interest" eyebrow="WiseTech Insights" title="Get updates" copy="Join the list" action={<a className="button button-light" href="mailto:contact@hkwtia.org">Join</a>} />);
    const section = document.querySelector("section#interest");
    expect(section).toHaveClass("event-interest");
    expect(section?.firstElementChild).toHaveClass("shell", "event-interest-grid");
    expect(screen.getByRole("heading", {level: 2})).toHaveTextContent("Get updates");
    expect(screen.getByRole("link", {name: "Join"})).toHaveAttribute("href", "mailto:contact@hkwtia.org");
  });

  it("StepGrid numbers the steps from 01", () => {
    render(<StepGrid steps={[{title: "Prepare", copy: "a"}, {title: "Send", copy: "b"}]} />);
    const grid = document.querySelector(".intro-process");
    expect(grid?.querySelectorAll("article")).toHaveLength(2);
    expect(grid?.querySelector("article span")).toHaveTextContent("01");
    expect(screen.getByRole("heading", {level: 3, name: "Send"})).toBeInTheDocument();
  });

  it("CardGrid renders linked items as service links and static items as articles", () => {
    render(<CardGrid variant="service" items={[{title: "Market entry", copy: "a", href: "/launchpad"}, {title: "Soft landing", copy: "b", marker: "★"}]} />);
    const grid = document.querySelector(".service-grid");
    expect(grid?.querySelector("a.service-link")).toHaveAttribute("href", "/launchpad");
    expect(grid?.querySelector("article span")).toHaveTextContent("★");
    const badge = render(<CardGrid variant="badge" items={[{title: "Verified", copy: "c"}]} />);
    expect(badge.container.querySelector(".badge-grid article span")).toHaveTextContent("01");
  });

  it("PageUpdated exposes a machine-readable time and an optional note", () => {
    render(<PageUpdated label="Page updated" dateTime="2026-09-02" formattedDate="2 September 2026" note="Reviewed by staff" />);
    const section = document.querySelector("section.page-updated");
    expect(section?.firstElementChild).toHaveClass("shell");
    expect(screen.getByText("Page updated").tagName).toBe("SPAN");
    expect(document.querySelector("time")).toHaveAttribute("dateTime", "2026-09-02");
    expect(document.querySelector("time")).toHaveTextContent("2 September 2026");
    expect(screen.getByText(/Reviewed by staff/)).toBeInTheDocument();
  });

  it("Button exposes the donor variants", () => {
    render(<><Button variant="wtDark" size="wt">Dark</Button><Button variant="wtText" size="wt">Text</Button><Button variant="wtLight" size="wt">Light</Button></>);
    expect(screen.getByRole("button", {name: "Dark"})).toHaveClass("button", "button-dark");
    expect(screen.getByRole("button", {name: "Light"})).toHaveClass("button", "button-light");
    expect(screen.getByRole("button", {name: "Text"})).toHaveClass("text-link");
    expect(screen.getByRole("button", {name: "Text"})).not.toHaveClass("h-10");
  });
});
