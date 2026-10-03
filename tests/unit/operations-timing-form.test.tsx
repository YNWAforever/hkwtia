import {readFileSync} from "node:fs";
import {act, fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
const save = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/lib/admin/operations-metrics-actions", () => ({recordOperationObservationAction: save}));
import {OperationsTimingForm, type OperationsTimingLabels} from "@/components/admin/operations-timing-form";
const labels = JSON.parse(readFileSync("messages/en.json", "utf8")).OperationsTiming as OperationsTimingLabels;
describe("timing receipt completion state", () => {
  it("does not report the previous save as success while the next submission is pending", async () => {
    let finish!: (value: {status: "saved"}) => void;
    save.mockResolvedValueOnce({status: "saved"}).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    render(<OperationsTimingForm labels={labels}/>);
    fireEvent.change(screen.getByLabelText(labels.startedAt), {target: {value: "2026-10-03T01:00"}});
    fireEvent.change(screen.getByLabelText(labels.endedAt), {target: {value: "2026-10-03T01:10"}});
    const form = screen.getByRole("form", {name: labels.formLabel, hidden: true});
    fireEvent.submit(form);
    expect(await screen.findByText(labels.saved)).toBeInTheDocument();
    try {
      fireEvent.submit(form);
      expect(save).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(labels.saved)).not.toBeInTheDocument();
    } finally {await act(async () => finish({status: "saved"}));}
    expect(screen.getByText(labels.saved)).toBeInTheDocument();
    expect(save.mock.calls[0][0].observationId).toBe(save.mock.calls[1][0].observationId);
  });
});
