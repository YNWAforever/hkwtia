import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it} from "vitest";

import {PortalTagPicker} from "@/components/portal/forms/tag-picker";

const options = Array.from({length: 12}, (_, i) => ({value: `tag-${i + 1}`, label: `Tag ${i + 1}`}));
const counterLabel = (count: number, max: number) => `${count} / ${max} selected`;

function picker(initial: readonly string[], readOnly = false) {
  return render(
    <form data-testid="form">
      <PortalTagPicker name="tags" legend="Tags" options={options} initial={initial} max={8} readOnly={readOnly} counterLabel={counterLabel} />
    </form>,
  );
}

const boxes = () => screen.getAllByRole("checkbox") as HTMLInputElement[];
const submitted = () => new FormData(screen.getByTestId("form") as HTMLFormElement).getAll("tags");

afterEach(cleanup);

describe("PortalTagPicker", () => {
  it("shows the live count and leaves every box enabled under the limit", () => {
    picker(["tag-1", "tag-2", "tag-3"]);
    expect(screen.getByText("3 / 8 selected").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("group", {name: "Tags"})).toBeTruthy();
    expect(boxes().every((box) => !box.disabled)).toBe(true);
  });

  it("disables every unchecked box at the limit and re-enables them when one is unchecked", () => {
    picker(["tag-1", "tag-2", "tag-3"]);
    for (const n of [4, 5, 6, 7, 8]) fireEvent.click(screen.getByLabelText(`Tag ${n}`));
    expect(screen.getByText("8 / 8 selected")).toBeTruthy();
    expect(boxes().filter((box) => !box.checked).every((box) => box.disabled)).toBe(true);
    expect(boxes().filter((box) => box.checked).every((box) => !box.disabled)).toBe(true);
    fireEvent.click(screen.getByLabelText("Tag 8"));
    expect(screen.getByText("7 / 8 selected")).toBeTruthy();
    expect(boxes().every((box) => !box.disabled)).toBe(true);
  });

  it("keeps legacy selections beyond the limit checked, enabled and submitted", () => {
    const legacy = options.slice(0, 10).map((option) => option.value);
    picker(legacy);
    expect(boxes().filter((box) => box.checked)).toHaveLength(10);
    expect(boxes().filter((box) => box.checked).every((box) => !box.disabled)).toBe(true);
    expect(boxes().filter((box) => !box.checked).every((box) => box.disabled)).toBe(true);
    expect(screen.getByText("10 / 8 selected")).toBeTruthy();
    expect(submitted()).toEqual(legacy);
  });

  it("disables every box when read-only", () => {
    picker(["tag-1"], true);
    expect(boxes().every((box) => box.disabled)).toBe(true);
  });
});
