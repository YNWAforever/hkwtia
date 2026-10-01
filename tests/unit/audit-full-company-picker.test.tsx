import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CompanyPicker } from "@/components/admin/company-picker";
const option = {
  id: "18000000-0000-4000-8000-000000000041",
  name: "Synthetic private company",
};
const labels = {
  company: "Company name",
  empty: "No companies",
  error: "Could not read companies",
  choose: "Choose a registered company or clear the search",
  searching: "Searching",
};
it("selects a private registered company by keyboard and submits its ID", async () => {
  const search = vi.fn(async () => ({
    status: "success" as const,
    items: [option],
  }));
  render(
    <form>
      <CompanyPicker value={null} search={search} labels={labels} />
    </form>,
  );
  const input = screen.getByRole("combobox", { name: labels.company });
  fireEvent.change(input, { target: { value: "Synthetic" } });
  await screen.findByRole("option", { name: option.name });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveValue(option.name);
  expect(document.querySelector('input[name="companyId"]')).toHaveValue(
    option.id,
  );
  expect((input as HTMLInputElement).validationMessage).toBe("");
});
it("blocks an unselected name from silently widening a company filter", () => {
  render(
    <form>
      <CompanyPicker value={option.id} options={[option]} labels={labels} />
    </form>,
  );
  const input = screen.getByRole("combobox", { name: labels.company });
  fireEvent.change(input, { target: { value: "Unregistered" } });
  expect(document.querySelector('input[name="companyId"]')).toHaveValue("");
  expect((input as HTMLInputElement).validationMessage).toBe(labels.choose);
});
it("ignores an older search response and separates failure from zero results", async () => {
  let resolveOld!: (value: {
    status: "success";
    items: (typeof option)[];
  }) => void;
  const search = vi
    .fn()
    .mockImplementationOnce(
      () => new Promise((resolve) => (resolveOld = resolve)),
    )
    .mockResolvedValueOnce({ status: "error" });
  render(<CompanyPicker value={null} search={search} labels={labels} />);
  const input = screen.getByRole("combobox", { name: labels.company });
  fireEvent.change(input, { target: { value: "Old" } });
  await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "New" } });
  await screen.findByRole("status");
  resolveOld({ status: "success", items: [option] });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(labels.error),
  );
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
});
