import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {InternalActionFeedback} from "@/components/internal-shell/action-feedback";
import {InternalEmptyState} from "@/components/internal-shell/empty-state";
import {InternalPageHeader} from "@/components/internal-shell/page-header";
import {InternalSection} from "@/components/internal-shell/section";
import {InternalStatusBadge} from "@/components/internal-shell/status-badge";
import {InternalTableFrame} from "@/components/internal-shell/table-frame";

describe("internal shell primitives", () => {
  it("InternalPageHeader renders a real h1 and optional description", () => {
    render(<InternalPageHeader title="Dashboard" description="Overview" />);
    expect(screen.getByRole("heading", {level: 1, name: "Dashboard"})).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("InternalPageHeader renders an optional eyebrow above the heading", () => {
    render(<InternalPageHeader eyebrow="Operations" title="Dashboard" description="Overview" />);
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByRole("heading", {level: 1, name: "Dashboard"})).toBeInTheDocument();
  });

  it("InternalPageHeader omits the eyebrow and description paragraphs when neither is given", () => {
    const {container} = render(<InternalPageHeader title="Dashboard" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("InternalSection renders a real h2 heading and its children", () => {
    render(<InternalSection title="Profile"><p>Body</p></InternalSection>);
    expect(screen.getByRole("heading", {level: 2, name: "Profile"})).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("InternalStatusBadge never relies on color alone: it always renders a visible text label", () => {
    render(<InternalStatusBadge tone="warning" label="Past due" />);
    expect(screen.getByText("Past due")).toBeInTheDocument();
  });

  it("InternalTableFrame scrolls its own overflow rather than the document", () => {
    render(<InternalTableFrame><table><tbody><tr><td>Row</td></tr></tbody></table></InternalTableFrame>);
    const frame = screen.getByText("Row").closest("[data-internal-table-frame]");
    expect(frame).toHaveClass("overflow-x-auto");
  });

  it("InternalEmptyState renders an honest, non-fabricated message", () => {
    render(<InternalEmptyState title="No documents yet" description="Approved resources will appear here." />);
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByText("Approved resources will appear here.")).toBeInTheDocument();
  });

  it("InternalActionFeedback uses live/alert semantics without color-only meaning", () => {
    render(<InternalActionFeedback tone="error" message="Something went wrong" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
  });

  it("InternalActionFeedback uses role=status for success tone, not alert", () => {
    render(<InternalActionFeedback tone="success" message="Changes saved" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Changes saved");
  });
});
