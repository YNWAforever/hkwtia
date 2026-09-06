import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {InternalAppShell} from "@/components/internal-shell/app-shell";

describe("InternalAppShell", () => {
  it("renders a skip link targeting the sole main#main-content landmark", () => {
    render(
      <InternalAppShell navigation={<nav>Nav</nav>} skipLabel="Skip to content">
        <p>Body</p>
      </InternalAppShell>,
    );

    const skipLink = screen.getByRole("link", {name: "Skip to content"});
    expect(skipLink).toHaveAttribute("href", "#main-content");
    const mains = screen.getAllByRole("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute("id", "main-content");
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Nav")).toBeInTheDocument();
  });

  it("does not overflow the document at 375px (no horizontal scroll contract via a bounded container class)", () => {
    render(
      <InternalAppShell navigation={<nav>Nav</nav>} skipLabel="Skip to content">
        <p>Body</p>
      </InternalAppShell>,
    );
    const main = screen.getByRole("main");
    expect(main.className).toMatch(/max-w-|w-full/);
  });
});
