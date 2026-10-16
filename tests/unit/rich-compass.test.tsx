import {render, screen} from "@testing-library/react";
import type {AnchorHTMLAttributes} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({href, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));

describe("RichCompass", () => {
  it("renders each item inside the donor 3-column grid, as a <div> whether or not it links anywhere", async () => {
    const {RichCompass} = await import("@/components/wt/rich-compass");
    render(
      <RichCompass
        items={[
          {label: "Since 2001", value: "Our history", href: "/about/history"},
          {label: "Leadership", value: "Chairman's message", href: "/about/chairman"},
          {label: "Founded", value: "2001"},
        ]}
      />,
    );

    const wrapper = document.querySelector(".rich-compass");
    expect(wrapper).toBeInTheDocument();
    const grid = wrapper?.querySelector(".rich-compass-grid");
    expect(grid).toBeInTheDocument();
    expect(grid?.children).toHaveLength(3);
    for (const cell of Array.from(grid?.children ?? [])) expect(cell.tagName).toBe("DIV");

    expect(screen.getByText("Since 2001")).toBeVisible();
    expect(screen.getByRole("link", {name: "Our history"})).toHaveAttribute("href", "/about/history");
    expect(screen.getByRole("link", {name: "Chairman's message"})).toHaveAttribute("href", "/about/chairman");
    expect(screen.getByText("Founded")).toBeVisible();
    expect(screen.getByText("2001")).toBeVisible();
    expect(screen.queryByRole("link", {name: "2001"})).not.toBeInTheDocument();
  });
});
