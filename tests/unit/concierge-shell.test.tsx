import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

const {pathnameState} = vi.hoisted(() => ({pathnameState: {current: "/"}}));

// The widget reads the route during render, so the section has to be steerable between
// renders of the same mounted tree -- a mutable ref behind the mock, not a value captured at
// module load. `next/navigation` rather than `@/i18n/navigation`: the widget's own suite
// (tests/unit/concierge-widget.test.tsx, which must stay untouched) mounts it with no locale
// context, and next-intl's hook needs one.
vi.mock("next/navigation", () => ({usePathname: () => pathnameState.current}));

import {ConciergeWidget} from "@/components/ai/concierge-widget";
import {localizeConcierge} from "@/lib/ai/concierge-labels";
import {localizeConciergePrompts} from "@/lib/ai/concierge-prompts";

const bundle = JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")) as {
  Concierge: Record<string, unknown> & {prompts: Record<string, unknown>};
};
const labels = localizeConcierge((key) => String(bundle.Concierge[key]));
const prompts = localizeConciergePrompts((key) => bundle.Concierge.prompts[key.split(".")[1]!]);
const transparency = String(bundle.Concierge.transparency);

function sseResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), {status: 200, headers: {"content-type": "text/event-stream; charset=utf-8"}});
}

afterEach(() => {
  vi.unstubAllGlobals();
  pathnameState.current = "/";
});

describe("Concierge shell", () => {
  it("wears the donor trigger with the W+ badge and the WiseTech label", () => {
    render(<ConciergeWidget locale="en" labels={labels} prompts={prompts} transparencyLabel={transparency} />);
    const launcher = screen.getByRole("button", {name: "Ask WiseTech"});
    expect(launcher).toHaveClass("concierge-trigger", "touch-manipulation");
    expect(within(launcher).getByText("W+")).toHaveAttribute("aria-hidden", "true");
  });

  it("offers the section's prompts, fills the composer and never sends by itself", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    pathnameState.current = "/";
    render(<ConciergeWidget locale="en" labels={labels} prompts={prompts} transparencyLabel={transparency} />);
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
    pathnameState.current = "/zh/events";
    render(<ConciergeWidget locale="zh-HK" labels={labels} prompts={prompts} transparencyLabel={transparency} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    expect(screen.getByRole("button", {name: "Which event is relevant to retail?"})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "How can WiseTech help my organisation?"})).toBeNull();
  });

  it("follows a soft navigation without remounting", () => {
    // The widget lives in app/[locale]/(public)/layout.tsx, which survives every in-app link
    // click, so a section resolved once at mount would serve the first route's prompts for the
    // rest of the session. Re-rendering the same tree is exactly what a soft navigation does.
    pathnameState.current = "/";
    // A fresh element each time, never one hoisted into a const: React bails out of
    // re-rendering a subtree whose element is referentially identical to the last one, so
    // rerender(sameElement) would assert nothing about how the widget reads the route.
    const widget = () => (
      <ConciergeWidget locale="en" labels={labels} prompts={prompts} transparencyLabel={transparency} />
    );
    const view = render(widget());
    const launcher = screen.getByRole("button", {name: "Ask WiseTech"});
    fireEvent.click(launcher);
    expect(screen.getByRole("button", {name: "How can WiseTech help my organisation?"})).toBeInTheDocument();

    pathnameState.current = "/events";
    view.rerender(widget());

    expect(launcher).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Which event is relevant to retail?"})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "How can WiseTech help my organisation?"})).toBeNull();
  });

  it("stops offering openers once the transcript has a message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      "event: done\ndata: {}\n\n",
    ])));
    pathnameState.current = "/";
    render(<ConciergeWidget locale="en" labels={labels} prompts={prompts} transparencyLabel={transparency} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    fireEvent.click(screen.getByRole("button", {name: "How can WiseTech help my organisation?"}));
    fireEvent.click(screen.getByRole("button", {name: labels.send}));

    await waitFor(() =>
      expect(screen.queryByRole("button", {name: "How can WiseTech help my organisation?"})).toBeNull());
    expect(screen.queryByRole("button", {name: "Show the AI+ industry pathways"})).toBeNull();
    expect(screen.queryByText(labels.empty)).toBeNull();
  });

  it("links the transparency page with a locale-correct href and hides it when unlabelled", () => {
    pathnameState.current = "/";
    const view = render(<ConciergeWidget locale="zh-HK" labels={labels} prompts={prompts} transparencyLabel={transparency} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    expect(screen.getByRole("link", {name: transparency}))
      .toHaveAttribute("href", "/zh/ai-transparency");
    view.unmount();

    render(<ConciergeWidget locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    expect(screen.queryByRole("link", {name: transparency})).toBeNull();
    expect(screen.queryByRole("button", {name: "How can WiseTech help my organisation?"})).toBeNull();
  });
});
