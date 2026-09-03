import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {ConciergeWidget} from "@/components/ai/concierge-widget";
import {localizeConcierge} from "@/lib/ai/concierge-labels";
import {localizeConciergePrompts} from "@/lib/ai/concierge-prompts";

const bundle = JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")) as {
  Concierge: Record<string, unknown> & {prompts: Record<string, unknown>};
};
const labels = localizeConcierge((key) => String(bundle.Concierge[key]));
const prompts = localizeConciergePrompts((key) => bundle.Concierge.prompts[key.split(".")[1]!]);

afterEach(() => vi.unstubAllGlobals());

describe("Concierge shell", () => {
  it("wears the donor trigger with the W+ badge and the WiseTech label", () => {
    render(<ConciergeWidget locale="en" labels={labels} prompts={prompts} transparencyLabel={String(bundle.Concierge.transparency)} />);
    const launcher = screen.getByRole("button", {name: "Ask WiseTech"});
    expect(launcher).toHaveClass("concierge-trigger", "touch-manipulation");
    expect(within(launcher).getByText("W+")).toHaveAttribute("aria-hidden", "true");
  });

  it("offers the section's prompts, fills the composer and never sends by itself", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    window.history.replaceState(null, "", "/");
    render(<ConciergeWidget locale="en" labels={labels} prompts={prompts} transparencyLabel={String(bundle.Concierge.transparency)} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));

    const first = screen.getByRole("button", {name: "How can WiseTech help my organisation?"});
    expect(screen.getByRole("button", {name: "Show the AI+ industry pathways"})).toBeInTheDocument();
    fireEvent.click(first);

    const composer = screen.getByRole("textbox", {name: labels.messageLabel});
    expect(composer).toHaveValue("How can WiseTech help my organisation?");
    expect(composer).toHaveFocus();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("picks the prompt set from the current section, locale prefix included", () => {
    window.history.replaceState(null, "", "/zh/events");
    render(<ConciergeWidget locale="zh-HK" labels={labels} prompts={prompts} transparencyLabel={String(bundle.Concierge.transparency)} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    expect(screen.getByRole("button", {name: "Which event is relevant to retail?"})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "How can WiseTech help my organisation?"})).toBeNull();
  });

  it("links the transparency page with a locale-correct href and hides it when unlabelled", () => {
    window.history.replaceState(null, "", "/");
    const view = render(<ConciergeWidget locale="zh-HK" labels={labels} prompts={prompts} transparencyLabel={String(bundle.Concierge.transparency)} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    expect(screen.getByRole("link", {name: String(bundle.Concierge.transparency)}))
      .toHaveAttribute("href", "/zh/ai-transparency");
    view.unmount();

    render(<ConciergeWidget locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    expect(screen.queryByRole("link", {name: String(bundle.Concierge.transparency)})).toBeNull();
    expect(screen.queryByRole("button", {name: "How can WiseTech help my organisation?"})).toBeNull();
  });
});
