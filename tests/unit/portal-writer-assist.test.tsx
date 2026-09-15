import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {useState} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({result: null as unknown}));

vi.mock("@/lib/portal/writer-actions", () => ({
  writerAssistAction: vi.fn(async () => state.result),
}));

import {WriterAssist, type WriterAssistLabels} from "@/components/portal/writer-assist";
import {writerAssistProps} from "@/lib/portal/writer-ui";
import type {WriterActionDependencies} from "@/lib/portal/writer-action-core";

const labels: WriterAssistLabels = {
  label: "Write with AI", briefLabel: "What is this about?", briefPlaceholder: "Notes",
  generate: "Generate", generating: "Generating…",
  errors: {INVALID: "Invalid", FORBIDDEN: "Forbidden", NOT_ENTITLED: "Not entitled", QUOTA_EXCEEDED: "Quota", UNAVAILABLE: "Unavailable", FAILED: "Failed"},
};

function Host() {
  const [copy, setCopy] = useState<Record<string, string> | null>(null);
  return (
    <>
      <WriterAssist kind="event" labels={labels} quotaLabel="Unlimited generations" exhausted={false} onGenerated={setCopy} />
      <output data-testid="copy">{copy ? JSON.stringify(copy) : "none"}</output>
    </>
  );
}

function CountingHost({onGenerated}: {onGenerated: (copy: Readonly<Record<string, string>>) => void}) {
  const [, setTick] = useState(0);
  return (
    <>
      <WriterAssist kind="event" labels={labels} quotaLabel="Unlimited generations" exhausted={false} onGenerated={(copy) => onGenerated(copy)} />
      <button onClick={() => setTick((n) => n + 1)} type="button">rerender</button>
    </>
  );
}

describe("WriterAssist", () => {
  beforeEach(() => {
    state.result = {status: "ok", copy: {descriptionEn: "En", descriptionZh: "Zh"}};
  });

  // The control is a collapsed disclosure; open it before touching its contents.
  const open = () => fireEvent.click(screen.getByText("Write with AI"));

  it("offers a brief, a Generate button and the quota line once opened", () => {
    render(<Host />);
    open();
    expect(screen.getByRole("button", {name: "Generate"})).toBeVisible();
    expect(screen.getByLabelText("What is this about?")).toBeVisible();
    expect(screen.getByText("Unlimited generations")).toBeVisible();
  });

  it("hands the generated copy to onGenerated", async () => {
    render(<Host />);
    open();
    fireEvent.change(screen.getByLabelText("What is this about?"), {target: {value: "A new workshop"}});
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));
    await waitFor(() => expect(screen.getByTestId("copy")).toHaveTextContent('{"descriptionEn":"En","descriptionZh":"Zh"}'));
  });

  it("renders the error code's message, not the code", async () => {
    state.result = {status: "error", code: "QUOTA_EXCEEDED"};
    render(<Host />);
    open();
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Quota");
  });

  it("disables Generate when the quota is exhausted", () => {
    render(<WriterAssist kind="event" labels={labels} quotaLabel="0 of 20 generations left this month" exhausted onGenerated={() => {}} />);
    open();
    expect(screen.getByRole("button", {name: "Generate"})).toBeDisabled();
  });

  it("applies onGenerated once when the host re-renders without a new result", async () => {
    const onGenerated = vi.fn();
    render(<CountingHost onGenerated={onGenerated} />);
    open();
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", {name: "rerender"}));
    fireEvent.click(screen.getByRole("button", {name: "rerender"}));
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });

  it("applies onGenerated again for a second generation", async () => {
    const onGenerated = vi.fn();
    render(<CountingHost onGenerated={onGenerated} />);
    open();
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    state.result = {status: "ok", copy: {descriptionEn: "En2", descriptionZh: "Zh2"}};
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(2));
    expect(onGenerated).toHaveBeenLastCalledWith({descriptionEn: "En2", descriptionZh: "Zh2"});
  });
});

const member = {kind: "member", userId: "u1", profileId: "profile-1"} as const;
const now = new Date("2026-09-14T04:00:00Z");

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${values.remaining}/${values.cap}` : key;

function deps(overrides: Partial<WriterActionDependencies> = {}): WriterActionDependencies {
  return {
    plansFor: vi.fn(async () => ["startup"] as const),
    countRuns: vi.fn(async () => 5),
    generate: vi.fn(),
    now: () => now,
    ...overrides,
  };
}

const withOpenai = {openai: true, anthropic: false} as const;

describe("writerAssistProps", () => {
  it("renders no control when the agent is disabled", async () => {
    await expect(writerAssistProps("event", member, t, {enabled: false, credentials: withOpenai, dependencies: deps()})).resolves.toBeNull();
  });

  it("renders no control when neither provider key is configured", async () => {
    await expect(writerAssistProps("event", member, t, {enabled: true, credentials: {openai: false, anthropic: false}, dependencies: deps()})).resolves.toBeNull();
  });

  it("offers the control when only one provider key is configured", async () => {
    const props = await writerAssistProps("event", member, t, {enabled: true, credentials: {openai: false, anthropic: true}, dependencies: deps()});
    expect(props).not.toBeNull();
  });

  it("renders no control when the plan has no allowance", async () => {
    await expect(writerAssistProps("event", member, t, {enabled: true, credentials: withOpenai, dependencies: deps({plansFor: async () => ["community"]})})).resolves.toBeNull();
  });

  it("renders no control when the quota read fails", async () => {
    const failing = deps({plansFor: async () => { throw new Error("membership read failed"); }});
    await expect(writerAssistProps("event", member, t, {enabled: true, credentials: withOpenai, dependencies: failing})).resolves.toBeNull();
  });

  it("offers the control with a formatted remaining quota", async () => {
    const props = await writerAssistProps("event", member, t, {enabled: true, credentials: withOpenai, dependencies: deps()});
    expect(props).toMatchObject({
      kind: "event",
      exhausted: false,
      quotaLabel: "quota:15/20",
      labels: {label: "label", generate: "generate", errors: {INVALID: "errors.INVALID", FAILED: "errors.FAILED"}},
    });
  });

  it("marks the control exhausted when nothing remains", async () => {
    const props = await writerAssistProps("event", member, t, {enabled: true, credentials: withOpenai, dependencies: deps({countRuns: async () => 25})});
    expect(props).toMatchObject({exhausted: true, quotaLabel: "quota:0/20"});
  });

  it("labels an unlimited plan without a cap", async () => {
    const props = await writerAssistProps("event", member, t, {enabled: true, credentials: withOpenai, dependencies: deps({plansFor: async () => ["patron"]})});
    expect(props).toMatchObject({exhausted: false, quotaLabel: "quotaUnlimited"});
  });
});
