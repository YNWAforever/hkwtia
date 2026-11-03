import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

import {JoinNextSteps} from "@/components/join/next-steps";
import {OnboardingChecklist} from "@/components/portal/onboarding-checklist";
import type {OnboardingChecklistItem} from "@/lib/portal/onboarding-checklist";

vi.mock("next/link", () => ({
  default: ({children, href, prefetch}: {children: ReactNode; href: string; prefetch?: boolean}) => (
    <a href={href} data-prefetch={String(prefetch ?? "auto")}>{children}</a>
  ),
}));

const checklistLabels = {
  title: "Onboarding checklist",
  lead: "Finish these.",
  kitsTitle: "Welcome Kit and Association Kit",
  kitsLead: "From the Secretariat.",
  done: "Done",
  todo: "To do",
  items: {
    profile: "Complete your profile",
    welcomeKit: "Checklist welcome kit",
    associationKit: "Checklist association kit",
    whatsapp: "Join WhatsApp",
    firstEvent: "RSVP to your first event",
    registration: "Add your Business Registration later",
  },
  welcomeKit: "Welcome kit file",
  associationKit: "Association kit file",
  whatsappCommunity: "Open the WhatsApp community",
};

const nextStepLabels = {
  title: "What to do next",
  lead: "Your membership is active.",
  noPayment: "No payment has been taken yet.",
  welcomeKit: "Download the Welcome Kit",
  associationKit: "Download the Association Kit",
  login: "Member login",
  whatsapp: "WhatsApp opt-in on your profile",
  whatsappCommunity: "WhatsApp community",
  events: "Upcoming events",
};

const publishedKits = {
  welcomeKit: "https://drive.google.com/file/d/welcome",
  associationKit: "https://example.com/wtia/association-kit",
  whatsappCommunity: "https://chat.whatsapp.com/invite",
} as const;

const items: readonly OnboardingChecklistItem[] = [
  {id: "profile", done: true, href: "/portal/profile", external: false},
  {id: "welcomeKit", done: false, href: "https://example.com/wtia/welcome-kit", external: true},
  {id: "associationKit", done: false, href: "https://drive.google.com/file/d/association", external: true},
  {id: "whatsapp", done: false, href: "/portal/profile", external: false},
  {id: "firstEvent", done: false, href: "/events", external: false},
];

describe("membership kit links", () => {
  it("hides the portal kit section and any placeholder checklist row", () => {
    const {container} = render(
      <OnboardingChecklist locale="en" items={items} labels={checklistLabels} />,
    );
    expect(screen.getByRole("link", {name: "Complete your profile"})).toHaveAttribute("href", "/portal/profile");
    expect(screen.getByRole("link", {name: "Checklist association kit"})).toHaveAttribute("href", "https://drive.google.com/file/d/association");
    expect(screen.getByRole("link", {name: "Checklist association kit"})).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("link", {name: "Checklist welcome kit"})).toBeNull();
    expect(screen.queryByRole("heading", {name: "Welcome Kit and Association Kit"})).toBeNull();
    expect(screen.queryByText("Welcome kit file")).toBeNull();
    expect(container.innerHTML).not.toContain("example.com");
  });

  it("shows only published kit files in the portal kit section", () => {
    render(
      <OnboardingChecklist locale="en" items={items} labels={checklistLabels} kitLinks={publishedKits} />,
    );
    expect(screen.getByRole("heading", {name: "Welcome Kit and Association Kit"})).toBeTruthy();
    expect(screen.getByRole("link", {name: "Welcome kit file"})).toHaveAttribute("href", "https://drive.google.com/file/d/welcome");
    expect(screen.getByRole("link", {name: "Open the WhatsApp community"})).toHaveAttribute("href", "https://chat.whatsapp.com/invite");
    expect(screen.queryByRole("link", {name: "Association kit file"})).toBeNull();
    expect(document.body.innerHTML).not.toContain("example.com");
  });

  it("hides join-confirmation kit links while login, WhatsApp opt-in, and events stay", () => {
    const {container} = render(<JoinNextSteps locale="zh-HK" variant="individual" labels={nextStepLabels} />);
    expect(screen.getByRole("link", {name: "Member login"})).toHaveAttribute("href", "/zh/member-login");
    expect(screen.getByRole("link", {name: "WhatsApp opt-in on your profile"})).toHaveAttribute("href", "/zh/portal/profile");
    expect(screen.getByRole("link", {name: "Upcoming events"})).toHaveAttribute("href", "/zh/events");
    expect(screen.queryByRole("link", {name: "Download the Welcome Kit"})).toBeNull();
    expect(screen.queryByRole("link", {name: "Download the Association Kit"})).toBeNull();
    expect(screen.queryByRole("link", {name: "WhatsApp community"})).toBeNull();
    expect(container.innerHTML).not.toContain("example.com");
  });

  it("renders a published join kit link and drops an example.com one", () => {
    render(
      <JoinNextSteps locale="en" variant="organisation" labels={nextStepLabels} kitLinks={publishedKits} />,
    );
    expect(screen.getByText("No payment has been taken yet.")).toBeTruthy();
    expect(screen.getByRole("link", {name: "Download the Welcome Kit"})).toHaveAttribute("href", "https://drive.google.com/file/d/welcome");
    expect(screen.getByRole("link", {name: "Download the Welcome Kit"})).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", {name: "WhatsApp community"})).toHaveAttribute("href", "https://chat.whatsapp.com/invite");
    expect(screen.queryByRole("link", {name: "Download the Association Kit"})).toBeNull();
    expect(document.body.innerHTML).not.toContain("example.com");
  });
});
