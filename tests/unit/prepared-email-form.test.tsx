import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {PreparedEmailForm} from "@/components/marketing/prepared-email-form";

const labels = {
  topicLabel: "What is this about?",
  composeAction: "Compose email",
  topics: {portal: "Member portal", membership: "Membership", events: "Events", programmes: "Programmes", partnership: "Partnership", privacy: "Privacy", media: "Media"},
  subjects: {portal: "Portal enquiry", membership: "Membership enquiry", events: "Events enquiry", programmes: "Programmes enquiry", partnership: "Partnership enquiry", privacy: "Privacy enquiry", media: "Media enquiry"},
  bodies: {portal: "Portal body", membership: "Membership body", events: "Events body", programmes: "Programmes body", partnership: "Partnership body", privacy: "Privacy body", media: "Media body"},
} as const;

describe("PreparedEmailForm", () => {
  it("renders no <form> element and composes a mailto link for the initial topic", () => {
    const {container} = render(<PreparedEmailForm labels={labels} initialTopic="membership" />);

    expect(container.querySelector("form")).toBeNull();
    const compose = screen.getByRole("link", {name: labels.composeAction});
    expect(compose.getAttribute("href")).toBe(
      `mailto:contact@hkwtia.org?subject=${encodeURIComponent(labels.subjects.membership)}&body=${encodeURIComponent(labels.bodies.membership)}`,
    );
  });

  it("falls back to 'portal' for an unknown or missing initial topic", () => {
    render(<PreparedEmailForm labels={labels} initialTopic="not-a-real-topic" />);
    const compose = screen.getByRole("link", {name: labels.composeAction});
    expect(compose.getAttribute("href")).toContain(encodeURIComponent(labels.subjects.portal));
  });
});
