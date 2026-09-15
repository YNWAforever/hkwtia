# Phase D-3b — Writer UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the D-3a writer engine into the portal — one `WriterAssist` control that generates bilingual copy and fills the fields of the event form, the showcase listing form, and the company page's public copy.

**Architecture:** A single client `WriterAssist` posts a brief to the existing `writerAssistAction` and hands the returned copy to an `onGenerated` callback. Each surface owns the copy state for its own fields, so the member reviews and edits before saving, and nothing is persisted by a generation. A server helper (`writerAssistProps`) decides whether the control appears at all and pre-formats the quota line, so the pages stay thin.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, next-intl v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-phase-d3-ai-writers-design.md` (§4.5–§4.6)

**Depends on:** the D-3a engine (`docs/superpowers/plans/2026-09-14-phase-d3a-writer-engine.md`), whose `runWriterAssist`, `writerOutputSchema`, `aiWriterRunsPerMonth` and `writerAssistAction` this plan consumes. Confirm that branch is merged (or branch this work on top of it) before starting.

## Global Constraints

- Server Components are the default; `'use client'` only where a form already needs it. No token or key ever reaches the client.
- Every user-visible string lives in `messages/en.json` and `messages/zh-HK.json` in parity; `npm run audit:strings` must stay clean.
- Never hand-build a locale prefix; use `localizedPath`.
- A generation persists nothing: the copy goes into form fields the member still saves. The existing `draft → pending_review → published` machine is untouched.
- The control is **not rendered** when agents are disabled, when the plan has no allowance, or when the quota read fails — a dead button is worse than none.
- Conventional commits. Run before hand-off: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`.

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `lib/portal/writer-ui.ts` | Server-only: `writerAssistProps(kind, actor, t)` — decides visibility and pre-formats the quota line. |
| `components/portal/writer-assist.tsx` | The client control: brief, Generate, status, and the `onGenerated` callback. |
| `components/portal/company-forms.tsx` | The company page's client panel: owns the four public-copy values across its two forms. |
| `tests/unit/portal-writer-ui.test.ts`, `tests/unit/portal-writer-assist.test.tsx`, `tests/unit/event-form-writer.test.tsx`, `tests/unit/listing-form-writer.test.tsx`, `tests/unit/company-forms-writer.test.tsx`, `tests/unit/writer-messages.test.ts` | Task tests. |
| `tests/e2e/phase-d3-writer-ui.spec.ts` | Credential-gated acceptance. |

**Modify**

| File | Change |
|---|---|
| `lib/portal/writer-action-core.ts` | Add `writerQuotaFor`; refactor `runWriterAssist` to use it. |
| `messages/en.json`, `messages/zh-HK.json` | `Portal.writer.*`. |
| `components/portal/event-form.tsx` | Controlled descriptions + the assist. |
| `components/portal/showcase-listing-form.tsx` | Becomes a client component; controlled copy fields + the assist. |
| `components/portal/company-profile-form.tsx` | Accepts the copy values for its three fields. |
| `app/[locale]/(member)/portal/events/new/page.tsx`, `.../events/[id]/edit/page.tsx` | Pass the writer props. |
| `app/[locale]/(member)/portal/company/listing/page.tsx` | Pass the writer props. |
| `app/[locale]/(member)/portal/company/page.tsx` | Render `CompanyForms` instead of the inline details form plus `CompanyProfileForm`. |

---

### Task 1: The quota read helper

**Files:**
- Modify: `lib/portal/writer-action-core.ts`
- Test: `tests/unit/portal-writer-ui.test.ts` (create)

**Interfaces:**
- Consumes: `aiWriterRunsPerMonth`, `countWriterRuns`, `startOfHongKongMonth` (engine).
- Produces: `WriterQuota = Readonly<{cap: number; used: number; remaining: number}>`; `writerQuotaFor(actor: Extract<Actor, {kind: "member"}>, dependencies?): Promise<WriterQuota>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/portal-writer-ui.test.ts`:

```ts
import {describe, expect, it, vi} from "vitest";

import {writerQuotaFor, type WriterActionDependencies} from "@/lib/portal/writer-action-core";

const member = {kind: "member", userId: "u1", profileId: "profile-1"} as const;
const now = new Date("2026-09-14T04:00:00Z");

function deps(overrides: Partial<WriterActionDependencies> = {}): WriterActionDependencies {
  return {
    plansFor: vi.fn(async () => ["startup"]),
    countRuns: vi.fn(async () => 5),
    generate: vi.fn(),
    now: () => now,
    ...overrides,
  };
}

describe("writerQuotaFor", () => {
  it("reports cap, used and remaining for the member's best plan", async () => {
    await expect(writerQuotaFor(member, deps())).resolves.toEqual({cap: 20, used: 5, remaining: 15});
  });

  it("does not read the run count when the plan has no allowance", async () => {
    const countRuns = vi.fn(async () => 0);
    await expect(writerQuotaFor(member, deps({plansFor: async () => ["community"], countRuns})))
      .resolves.toEqual({cap: 0, used: 0, remaining: 0});
    expect(countRuns).not.toHaveBeenCalled();
  });

  it("reports an unlimited plan without a finite remaining", async () => {
    const quota = await writerQuotaFor(member, deps({plansFor: async () => ["patron"], countRuns: async () => 5}));
    expect(quota.cap).toBe(Number.POSITIVE_INFINITY);
    expect(quota.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("never reports a negative remaining", async () => {
    await expect(writerQuotaFor(member, deps({countRuns: async () => 25})))
      .resolves.toEqual({cap: 20, used: 25, remaining: 0});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/portal-writer-ui.test.ts`
Expected: FAIL — `writerQuotaFor is not a function`.

- [ ] **Step 3: Implement and refactor**

In `lib/portal/writer-action-core.ts`, add beside `quotaFor`:

```ts
export type WriterQuota = Readonly<{cap: number; used: number; remaining: number}>;

/**
 * The member's writer allowance for the current Hong Kong month.
 *
 * Member-typed rather than actor-checked: every caller already holds a member
 * actor from `requireActor`/`requireMember`, and the one read that needs the
 * `FORBIDDEN` guard belongs to `runWriterAssist`.
 */
export async function writerQuotaFor(
  actor: MemberActor,
  dependencies: WriterActionDependencies = defaultDependencies,
): Promise<WriterQuota> {
  const cap = quotaFor(await dependencies.plansFor(actor));
  const used = cap === 0 ? 0 : await dependencies.countRuns(actor, startOfHongKongMonth(dependencies.now()));
  return {cap, used, remaining: Math.max(0, cap - used)};
}
```

Replace the body of `runWriterAssist` after the brief parse so the quota logic lives in one place:

```ts
  const parsed = writerBriefSchema.safeParse(input);
  if (!parsed.success) return {status: "error", code: "INVALID"};

  let quota: WriterQuota;
  try {
    quota = await writerQuotaFor(actor, dependencies);
  } catch {
    // A transient read failure must not escape the action as a throw; the member
    // would lose the brief they typed to an error boundary.
    return {status: "error", code: "FAILED"};
  }
  if (quota.cap === 0) return {status: "error", code: "NOT_ENTITLED"};
  if (quota.remaining <= 0) return {status: "error", code: "QUOTA_EXCEEDED"};

  try {
    const copy = await dependencies.generate({memberActor: actor, kind: parsed.data.kind, brief: parsed.data.brief});
    return {status: "ok", copy};
  } catch (error) {
    // A missing key or an unconfigured model is not the member's problem, and
    // reads differently from a transient provider failure.
    const unavailable = error instanceof AgentRuntimeError && error.code === "configuration_error";
    return {status: "error", code: unavailable ? "UNAVAILABLE" : "FAILED"};
  }
}
```

Delete the now-unused `quotaFor` call site inside the old body, keeping `quotaFor` itself (used by `writerQuotaFor`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/portal-writer-ui.test.ts tests/unit/portal-writer-action.test.ts && npm run typecheck`
Expected: PASS both. The Task 9 action tests must stay green — the refactor changes where the quota is read, not what it returns.

- [ ] **Step 5: Commit**

```bash
git add lib/portal/writer-action-core.ts tests/unit/portal-writer-ui.test.ts
git commit -m "feat(portal): one quota read for the action and the pages"
```

---

### Task 2: The writer strings

**Files:**
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/writer-messages.test.ts` (create)

**Interfaces:**
- Produces: the `Portal.writer.*` message tree Task 3 reads.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/writer-messages.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";

const KEYS = [
  "writer.label", "writer.briefLabel", "writer.briefPlaceholder", "writer.generate", "writer.generating",
  "writer.quota", "writer.quotaUnlimited",
  "writer.errors.INVALID", "writer.errors.FORBIDDEN", "writer.errors.NOT_ENTITLED",
  "writer.errors.QUOTA_EXCEEDED", "writer.errors.UNAVAILABLE", "writer.errors.FAILED",
] as const;

function resolve(bundle: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

describe("writer messages", () => {
  it.each(KEYS)("resolves Portal.%s in both bundles", (key) => {
    // A missing key renders as the literal key at runtime and no other test
    // would notice, because the pages only pass keys through.
    expect(typeof resolve(en.Portal as Record<string, unknown>, key)).toBe("string");
    expect(typeof resolve(zhHK.Portal as Record<string, unknown>, key)).toBe("string");
  });

  it("keeps the quota line's placeholders in both bundles", () => {
    const english = resolve(en.Portal as Record<string, unknown>, "writer.quota") as string;
    const chinese = resolve(zhHK.Portal as Record<string, unknown>, "writer.quota") as string;
    for (const value of [english, chinese]) {
      expect(value).toContain("{remaining}");
      expect(value).toContain("{cap}");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/writer-messages.test.ts`
Expected: FAIL — the keys resolve to `undefined`.

- [ ] **Step 3: Add the strings**

Inside the existing `"Portal": { … }` object of `messages/en.json`, add (keeping the surrounding commas valid — insert beside an existing key, do not leave a trailing comma):

```json
    "writer": {
      "label": "Write with AI",
      "briefLabel": "What is this about?",
      "briefPlaceholder": "A sentence or two of notes; the assistant writes the English and Chinese drafts.",
      "generate": "Generate",
      "generating": "Generating…",
      "quota": "{remaining} of {cap} generations left this month",
      "quotaUnlimited": "Unlimited generations",
      "errors": {
        "INVALID": "Please add a short brief first.",
        "FORBIDDEN": "You do not have access to this.",
        "NOT_ENTITLED": "AI writing is not included in your plan.",
        "QUOTA_EXCEEDED": "You have used all your generations this month.",
        "UNAVAILABLE": "AI writing is temporarily unavailable.",
        "FAILED": "That did not work. Please try again."
      }
    },
```

Inside the existing `"Portal": { … }` object of `messages/zh-HK.json`, at the identical path:

```json
    "writer": {
      "label": "AI 撰寫",
      "briefLabel": "想寫關於甚麼？",
      "briefPlaceholder": "寫一兩句重點，AI 會為你生成中英文初稿。",
      "generate": "生成",
      "generating": "生成中…",
      "quota": "本月尚餘 {remaining} / {cap} 次生成",
      "quotaUnlimited": "不限次數生成",
      "errors": {
        "INVALID": "請先輸入簡短說明。",
        "FORBIDDEN": "你沒有使用此功能的權限。",
        "NOT_ENTITLED": "你的會籍計劃未包含 AI 撰寫。",
        "QUOTA_EXCEEDED": "你已用完本月的生成次數。",
        "UNAVAILABLE": "AI 撰寫暫時無法使用。",
        "FAILED": "未能生成，請再試一次。"
      }
    },
```

- [ ] **Step 4: Run the test and the audit**

Run: `npx vitest run tests/unit/writer-messages.test.ts && npm run audit:strings`
Expected: PASS, and `Visible-string audit passed`.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/zh-HK.json tests/unit/writer-messages.test.ts
git commit -m "feat(portal): writer copy, in both locales"
```

---

### Task 3: The writer-assist control and the page helper

**Files:**
- Create: `components/portal/writer-assist.tsx`, `lib/portal/writer-ui.ts`
- Test: `tests/unit/portal-writer-assist.test.tsx` (create)

**Interfaces:**
- Consumes: `writerAssistAction`/`WriterActionState` (engine), `writerQuotaFor` (Task 1), the strings (Task 2).
- Produces: `WriterAssistLabels`, `WriterAssistProps`, `WriterAssist`; `writerAssistProps(kind, actor, t, options?)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/portal-writer-assist.test.tsx`:

```tsx
import {fireEvent, render, screen} from "@testing-library/react";
import {useState} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({result: null as unknown}));

vi.mock("@/lib/portal/writer-actions", () => ({
  writerAssistAction: vi.fn(async () => state.result),
}));

import {WriterAssist, type WriterAssistLabels} from "@/components/portal/writer-assist";

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
    expect(await screen.findByTestId("copy")).toHaveTextContent('{"descriptionEn":"En","descriptionZh":"Zh"}');
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/portal-writer-assist.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/portal/writer-assist"`.

- [ ] **Step 3: Write the control**

Create `components/portal/writer-assist.tsx`:

```tsx
"use client";

import {useActionState, useEffect, useRef} from "react";

import {writerAssistAction, type WriterActionState} from "@/lib/portal/writer-actions";
import type {WriterKind} from "@/lib/ai/writers/contracts";

export type WriterAssistLabels = Readonly<{
  label: string; briefLabel: string; briefPlaceholder: string; generate: string; generating: string;
  errors: Readonly<Record<string, string>>;
}>;

export type WriterAssistProps = Readonly<{
  kind: WriterKind;
  labels: WriterAssistLabels;
  quotaLabel: string;
  exhausted: boolean;
}>;

/**
 * The one control every writer surface renders. It posts a brief to the shared
 * action and hands the returned copy to `onGenerated`; the surface decides which
 * of its fields that copy belongs in. A generation persists nothing — the member
 * still saves the form, and publication stays behind the existing review machine.
 */
export function WriterAssist({kind, labels, quotaLabel, exhausted, onGenerated}: WriterAssistProps & {
  onGenerated: (copy: Readonly<Record<string, string>>) => void;
}) {
  const [state, dispatch, pending] = useActionState<WriterActionState | null, FormData>(writerAssistAction, null);
  const applied = useRef<WriterActionState | null>(null);

  // Apply each success exactly once: the action state object is stable across
  // re-renders, so identity is what marks a new result.
  useEffect(() => {
    if (state?.status === "ok" && applied.current !== state) {
      applied.current = state;
      onGenerated(state.copy);
    }
  }, [state, onGenerated]);

  return (
    <details className="rounded-md border border-border bg-muted/30 p-4">
      <summary className="cursor-pointer text-sm font-medium">{labels.label}</summary>
      <form action={dispatch} className="mt-3 space-y-3">
        <input name="kind" type="hidden" value={kind} />
        <label className="block space-y-2 text-sm font-medium">
          <span>{labels.briefLabel}</span>
          <textarea className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2" name="brief" placeholder={labels.briefPlaceholder} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-medium disabled:opacity-50" disabled={pending || exhausted} type="submit">
            {pending ? labels.generating : labels.generate}
          </button>
          <span className="text-sm text-muted-foreground">{quotaLabel}</span>
        </div>
        {state?.status === "error" ? <p className="text-sm text-destructive" role="alert">{labels.errors[state.code] ?? labels.errors.FAILED}</p> : null}
      </form>
    </details>
  );
}
```

- [ ] **Step 4: Write the page helper**

Create `lib/portal/writer-ui.ts`:

```ts
import "server-only";

import type {WriterKind} from "@/lib/ai/writers/contracts";
import {aiEnv} from "@/lib/config/env";
import type {Actor} from "@/lib/membership/lifecycle";
import {writerQuotaFor, type WriterActionDependencies} from "@/lib/portal/writer-action-core";
import type {WriterAssistProps} from "@/components/portal/writer-assist";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type MemberActor = Extract<Actor, {kind: "member"}>;

/**
 * The props a writer surface renders, or `null` to render no control at all.
 *
 * Null for a disabled agent, a plan with no allowance, or an unreachable quota
 * read: a member who cannot generate must not be shown a button that cannot
 * work, and a transient read failure must not make the form look broken.
 */
export async function writerAssistProps(
  kind: WriterKind,
  actor: MemberActor,
  t: Translate,
  options: Readonly<{enabled?: boolean; dependencies?: WriterActionDependencies}> = {},
): Promise<WriterAssistProps | null> {
  if (!(options.enabled ?? aiEnv().agentsEnabled)) return null;

  let quota;
  try {
    quota = await writerQuotaFor(actor, options.dependencies);
  } catch {
    return null;
  }
  if (quota.cap === 0) return null;

  return {
    kind,
    exhausted: quota.remaining <= 0,
    quotaLabel: Number.isFinite(quota.cap)
      ? t("quota", {remaining: quota.remaining, cap: quota.cap})
      : t("quotaUnlimited"),
    labels: {
      label: t("label"), briefLabel: t("briefLabel"), briefPlaceholder: t("briefPlaceholder"),
      generate: t("generate"), generating: t("generating"),
      errors: {
        INVALID: t("errors.INVALID"), FORBIDDEN: t("errors.FORBIDDEN"), NOT_ENTITLED: t("errors.NOT_ENTITLED"),
        QUOTA_EXCEEDED: t("errors.QUOTA_EXCEEDED"), UNAVAILABLE: t("errors.UNAVAILABLE"), FAILED: t("errors.FAILED"),
      },
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/portal-writer-assist.test.tsx && npm run typecheck`
Expected: PASS, and typecheck silent.

- [ ] **Step 6: Commit**

```bash
git add components/portal/writer-assist.tsx lib/portal/writer-ui.ts tests/unit/portal-writer-assist.test.tsx
git commit -m "feat(portal): one writer control, and the rule for showing it"
```

---

### Task 4: The event form

**Files:**
- Modify: `components/portal/event-form.tsx`, `app/[locale]/(member)/portal/events/new/page.tsx`, `app/[locale]/(member)/portal/events/[id]/edit/page.tsx`
- Test: `tests/unit/event-form-writer.test.tsx` (create)

**Interfaces:**
- Consumes: `WriterAssist`, `WriterAssistProps` (Task 3), `writerAssistProps` (Task 3).
- Produces: `EventForm` accepts `writer?: WriterAssistProps | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/event-form-writer.test.tsx`:

```tsx
import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const writer = vi.hoisted(() => ({result: {status: "ok", copy: {descriptionEn: "Generated EN", descriptionZh: "Generated ZH"}}}));
vi.mock("@/lib/portal/writer-actions", () => ({writerAssistAction: vi.fn(async () => writer.result)}));

import {EventForm, type EventFormLabels} from "@/components/portal/event-form";
import type {WriterAssistProps} from "@/components/portal/writer-assist";

const labels = {
  slug: "Slug", titleEn: "Title (EN)", titleZh: "Title (ZH)", descriptionEn: "Description (EN)", descriptionZh: "Description (ZH)",
  startsAt: "Starts", endsAt: "Ends", venue: "Venue", capacity: "Capacity", format: "Format",
  formats: {in_person: "In person", online: "Online", hybrid: "Hybrid"},
  onlineUrl: "Online URL", visibility: "Visibility", visibilities: {public: "Public", members_only: "Members"},
  registrationMode: "Registration", registrationModes: {rsvp: "RSVP", external: "External"}, externalRegistrationUrl: "External URL",
  tags: "Tags", heroMediaId: "Hero", heroHelp: "Help", hero: {choose: "Choose", alt: "Alt", upload: "Upload", uploading: "Uploading", done: "Done", failed: "Failed"},
  saveDraft: "Save draft", submit: "Submit", saving: "Saving",
  errors: {},
} as unknown as EventFormLabels;

const writerProps: WriterAssistProps = {
  kind: "event", quotaLabel: "Unlimited generations", exhausted: false,
  labels: {label: "Write with AI", briefLabel: "What is this about?", briefPlaceholder: "Notes", generate: "Generate", generating: "Generating…", errors: {}},
};

describe("EventForm writer integration", () => {
  it("fills both descriptions from one generation", async () => {
    render(<EventForm action={async () => ({status: "idle"})} canSubmit labels={labels} values={null} writer={writerProps} />);

    fireEvent.click(screen.getByText("Write with AI"));
    fireEvent.change(screen.getByLabelText("What is this about?"), {target: {value: "A workshop"}});
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));

    expect(await screen.findByDisplayValue("Generated EN")).toBeVisible();
    expect(screen.getByDisplayValue("Generated ZH")).toBeVisible();
  });

  it("renders no control when the surface passes none", () => {
    render(<EventForm action={async () => ({status: "idle"})} canSubmit labels={labels} values={null} />);
    expect(screen.queryByText("Write with AI")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/event-form-writer.test.tsx`
Expected: FAIL — the descriptions do not change (they are uncontrolled).

- [ ] **Step 3: Make the descriptions controlled and render the control**

In `components/portal/event-form.tsx`:

Add to the imports:

```tsx
import {WriterAssist, type WriterAssistProps} from "@/components/portal/writer-assist";
```

Add `writer` to the props type:

```tsx
export function EventForm({values, labels, action, canSubmit, notice = null, writer = null}: Readonly<{
  values: MemberEventView | null; labels: EventFormLabels; action: Action; canSubmit: boolean; notice?: string | null; writer?: WriterAssistProps | null;
}>) {
```

Add the copy state beside `heroMediaId`:

```tsx
  const [descriptionEn, setDescriptionEn] = useState(values?.descriptionEn ?? "");
  const [descriptionZh, setDescriptionZh] = useState(values?.descriptionZh ?? "");
```

Replace the two description labels with controlled textareas inside the form:

```tsx
      <label className={`${labelClass} sm:col-span-2`}><span>{labels.descriptionEn}</span><textarea className={textareaClass} name="descriptionEn" onChange={(event) => setDescriptionEn(event.target.value)} required value={descriptionEn} /></label>
      <label className={`${labelClass} sm:col-span-2`}><span>{labels.descriptionZh}</span><textarea className={textareaClass} name="descriptionZh" onChange={(event) => setDescriptionZh(event.target.value)} value={descriptionZh} /></label>
```

Then render the control **outside** the `<form>`, as the last child before the component's closing tag. `WriterAssist` renders its own `<form>` for its Server Action, and a form inside a form is dropped by the HTML parser during SSR — the fields would hydrate against a tree the server never sent:

```tsx
      <div className="mt-4">
        <WriterAssist
          kind="event"
          labels={writer.labels}
          quotaLabel={writer.quotaLabel}
          exhausted={writer.exhausted}
          onGenerated={(copy) => {
            if (copy.descriptionEn) setDescriptionEn(copy.descriptionEn);
            if (copy.descriptionZh) setDescriptionZh(copy.descriptionZh);
          }}
        />
      </div>
    </>
  );
```

The two textareas stay inside the form (they submit with it); only the control moves out.

- [ ] **Step 4: Pass the props from both event pages**

In `app/[locale]/(member)/portal/events/new/page.tsx`, after the `context` guard, add:

```tsx
  const writerT = await getTranslations({locale, namespace: "Portal.writer"});
  const writer = await writerAssistProps("event", actor, writerT);
```

and pass `writer={writer}` to `<EventForm … />`.

In `app/[locale]/(member)/portal/events/[id]/edit/page.tsx`, the same, using the `actor` resolved at the top, and pass `writer={writer}`.

`writerAssistProps` takes a member actor; both pages resolve the actor through `getActor()` and have redirected an anonymous visitor, so narrow with the engine's type by asserting the shape immediately after the redirect (the pages already treat the actor as a member — if `actor.kind !== "member"` the layout has already redirected staff). Add to each page:

```tsx
  if (actor.kind !== "member") redirect(localizedPath(locale, "/admin"));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/event-form-writer.test.tsx tests/unit/portal-writer-assist.test.tsx && npm run typecheck && npm run audit:strings`
Expected: PASS, and typecheck silent.

- [ ] **Step 6: Commit**

```bash
git add components/portal/event-form.tsx "app/[locale]/(member)/portal/events/new/page.tsx" "app/[locale]/(member)/portal/events/[id]/edit/page.tsx" tests/unit/event-form-writer.test.tsx
git commit -m "feat(portal): generate event descriptions from the form"
```

---

### Task 5: The listing form

**Files:**
- Modify: `components/portal/showcase-listing-form.tsx`, `app/[locale]/(member)/portal/company/listing/page.tsx`
- Test: `tests/unit/listing-form-writer.test.tsx` (create)

**Interfaces:**
- Consumes: `WriterAssist`, `WriterAssistProps` (Task 3), `writerAssistProps` (Task 3).
- Produces: `ShowcaseListingForm` becomes a client component and accepts `writer?: WriterAssistProps | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/listing-form-writer.test.tsx`:

```tsx
import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/lib/portal/writer-actions", () => ({
  writerAssistAction: vi.fn(async () => ({status: "ok", copy: {taglineEn: "EN tag", taglineZhHk: "ZH tag", descriptionEn: "EN desc", descriptionZhHk: "ZH desc"}})),
}));

import {ShowcaseListingForm} from "@/components/portal/showcase-listing-form";
import type {WriterAssistProps} from "@/components/portal/writer-assist";

const writerProps: WriterAssistProps = {
  kind: "listing", quotaLabel: "Unlimited generations", exhausted: false,
  labels: {label: "Write with AI", briefLabel: "What is this about?", briefPlaceholder: "Notes", generate: "Generate", generating: "Generating…", errors: {}},
};

const labels = {title: "Listing", slug: "Slug", nameEn: "Name (EN)", nameZhHk: "Name (ZH)", taglineEn: "Tagline (EN)", taglineZhHk: "Tagline (ZH)", descriptionEn: "Description (EN)", descriptionZhHk: "Description (ZH)", category: "Category", useCases: "Use cases", deploymentOptions: "Deployment", supportedLanguages: "Languages", worksWith: "Works with", videoUrl: "Video", caseStudyUrl: "Case study", caseStudySummaryEn: "Summary (EN)", caseStudySummaryZhHk: "Summary (ZH)", logoReference: "Logo", saveDraft: "Save", submit: "Submit"};

describe("ShowcaseListingForm writer integration", () => {
  it("fills the taglines and descriptions from one generation", async () => {
    render(<ShowcaseListingForm value={{}} labels={labels} readOnly={false} writer={writerProps} />);

    fireEvent.click(screen.getByText("Write with AI"));
    fireEvent.change(screen.getByLabelText("What is this about?"), {target: {value: "Our product"}});
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));

    expect(await screen.findByDisplayValue("EN tag")).toBeVisible();
    expect(screen.getByDisplayValue("ZH tag")).toBeVisible();
    expect(screen.getByDisplayValue("EN desc")).toBeVisible();
    expect(screen.getByDisplayValue("ZH desc")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/listing-form-writer.test.tsx`
Expected: FAIL — `writer` is not a prop and the fields do not change.

- [ ] **Step 3: Make the form a client component with controlled copy fields**

In `components/portal/showcase-listing-form.tsx`, add the directive and the imports:

```tsx
"use client";

import {useState} from "react";

import {WriterAssist, type WriterAssistProps} from "@/components/portal/writer-assist";
import type {ListingInput} from "@/lib/showcase/contracts";
```

Add `writer` to the props and the copy state:

```tsx
export function ShowcaseListingForm({
  value, labels, saveAction, submitAction, readOnly, companyId, writer = null,
}: Readonly<{
  value: Partial<ListingInput>; labels: ShowcaseListingFormLabels; saveAction?: Action; submitAction?: Action; readOnly: boolean; companyId?: string; writer?: WriterAssistProps | null;
}>) {
  const [copy, setCopy] = useState<Partial<Record<"taglineEn" | "taglineZhHk" | "descriptionEn" | "descriptionZhHk", string>>>({});
```

Leave the read-only arrays as they are for every field **except** the four copy fields: remove `taglineEn`, `taglineZhHk` from the single-line array and `descriptionEn`, `descriptionZhHk` from the textarea array, and render them explicitly as controlled inputs bound to `copy`, falling back to the stored value:

```tsx
        {(["taglineEn", "taglineZhHk"] as const).map((name) => (
          <label className="space-y-2 text-sm font-medium" key={name}>
            <span>{labels[name]}</span>
            <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" disabled={readOnly} name={name} onChange={(event) => setCopy((current) => ({...current, [name]: event.target.value}))} value={copy[name] ?? text(name)} />
          </label>
        ))}
        {(["descriptionEn", "descriptionZhHk"] as const).map((name) => (
          <label className="space-y-2 text-sm font-medium sm:col-span-2" key={name}>
            <span>{labels[name]}</span>
            <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 disabled:opacity-60" disabled={readOnly} name={name} onChange={(event) => setCopy((current) => ({...current, [name]: event.target.value}))} value={copy[name] ?? text(name)} />
          </label>
        ))}
```

Render the control **after** the `</form>`, inside the section and above nothing else. `WriterAssist` renders its own `<form>` for its Server Action, and a form inside a form is dropped by the HTML parser during SSR:

```tsx
      </form>
      <div className="mt-4">
        <WriterAssist
          kind="listing"
          labels={writer.labels}
          quotaLabel={writer.quotaLabel}
          exhausted={writer.exhausted}
          onGenerated={(generated) => setCopy((current) => ({...current, ...Object.fromEntries(Object.entries(generated).filter(([key]) => ["taglineEn", "taglineZhHk", "descriptionEn", "descriptionZhHk"].includes(key)))}))}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Pass the props from the listing page**

In `app/[locale]/(member)/portal/company/listing/page.tsx`, after `requireActor`, add:

```tsx
  const writerT = await getTranslations({locale, namespace: "Portal.writer"});
  const writer = actor.kind === "member" ? await writerAssistProps("listing", actor, writerT) : null;
```

and pass `writer={writer}` to `<ShowcaseListingForm … />`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/listing-form-writer.test.tsx && npm run typecheck && npm run audit:strings`
Expected: PASS, and typecheck silent.

- [ ] **Step 6: Commit**

```bash
git add components/portal/showcase-listing-form.tsx "app/[locale]/(member)/portal/company/listing/page.tsx" tests/unit/listing-form-writer.test.tsx
git commit -m "feat(portal): generate showcase listing copy from the form"
```

---

### Task 6: The company page's public copy

**Files:**
- Create: `components/portal/company-forms.tsx`
- Modify: `components/portal/company-profile-form.tsx`, `app/[locale]/(member)/portal/company/page.tsx`
- Test: `tests/unit/company-forms-writer.test.tsx` (create)

**Interfaces:**
- Consumes: `WriterAssist`, `WriterAssistProps` (Task 3), `writerAssistProps` (Task 3), `CompanyProfileForm`'s existing props.
- Produces: `CompanyForms`, which renders the details form, the profile form, and one control filling all four public-copy fields.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/company-forms-writer.test.tsx`:

```tsx
import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/lib/portal/writer-actions", () => ({
  writerAssistAction: vi.fn(async () => ({status: "ok", copy: {taglineEn: "EN tag", taglineZhHk: "ZH tag", description: "EN desc", descriptionZhHk: "ZH desc"}})),
}));
vi.mock("@/components/portal/hero-upload", () => ({HeroUpload: () => null}));

import {CompanyForms} from "@/components/portal/company-forms";
import type {WriterAssistProps} from "@/components/portal/writer-assist";

const writerProps: WriterAssistProps = {
  kind: "profile", quotaLabel: "Unlimited generations", exhausted: false,
  labels: {label: "Write with AI", briefLabel: "What is this about?", briefPlaceholder: "Notes", generate: "Generate", generating: "Generating…", errors: {}},
};

const detailLabels = {legalName: "Legal name", displayName: "Display name", website: "Website", industry: "Industry", sizeBand: "Size", description: "Description (EN)", save: "Save", readOnly: "Read only"};
const profileLabels = {fields: {slug: "Slug", taglineEn: "Tagline (EN)", taglineZhHk: "Tagline (ZH)", descriptionZhHk: "Description (ZH)", website: "Website", tags: "Tags", logoMediaId: "Logo"}, logo: {choose: "Choose", alt: "Alt", upload: "Upload", uploading: "Uploading", done: "Done", failed: "Failed"}, status: {hidden: "Hidden", pending_review: "In review", published: "Published", rejected: "Rejected"}, statusLabel: "Status", reviewNotice: "Notice", rejected: null, save: "Save", publish: "Publish", saved: "Saved", submitted: "Submitted", readOnly: "Read only", viewPublic: "View", errors: {}};

describe("CompanyForms writer integration", () => {
  it("fills the English description and both taglines and the Chinese description", async () => {
    render(<CompanyForms
      details={{values: {legalName: "Acme", displayName: "Acme", website: "", industry: "", sizeBand: "", description: ""}, labels: detailLabels, action: async () => {}, canManage: true}}
      profile={{values: {slug: "acme", taglineEn: "", taglineZhHk: "", descriptionZhHk: "", website: "", logoMediaId: "", tags: [], status: "hidden", rejectionReason: null}, labels: profileLabels, action: async () => ({status: "idle"}), locale: "en", readOnly: false, publicHref: null}}
      writer={writerProps}
    />);

    fireEvent.click(screen.getByText("Write with AI"));
    fireEvent.change(screen.getByLabelText("What is this about?"), {target: {value: "Acme"}});
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));

    expect(await screen.findByDisplayValue("EN desc")).toBeVisible();
    expect(screen.getByDisplayValue("EN tag")).toBeVisible();
    expect(screen.getByDisplayValue("ZH tag")).toBeVisible();
    expect(screen.getByDisplayValue("ZH desc")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/company-forms-writer.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/portal/company-forms"`.

- [ ] **Step 3: Make the profile form's copy fields controlled**

In `components/portal/company-profile-form.tsx`, add `useEffect` to the react import:

```tsx
import {useActionState, useEffect, useState} from "react";
```

Add the local state and the re-seed beside the existing `slug`/`logoMediaId` state:

```tsx
  const [taglineEn, setTaglineEn] = useState(values.taglineEn);
  const [taglineZhHk, setTaglineZhHk] = useState(values.taglineZhHk);
  const [descriptionZhHk, setDescriptionZhHk] = useState(values.descriptionZhHk);
  // Re-seed when the parent replaces the values — a generated copy arrives that
  // way. Keyed on the three fields, not on `values`, so typing here does not
  // reset the fields on every render.
  useEffect(() => {
    setTaglineEn(values.taglineEn);
    setTaglineZhHk(values.taglineZhHk);
    setDescriptionZhHk(values.descriptionZhHk);
  }, [values.taglineEn, values.taglineZhHk, values.descriptionZhHk]);
```

Replace the three fields with controlled versions:

```tsx
      <label className={labelClass}>
        <span>{labels.fields.taglineEn}</span>
        <input className={inputClass} disabled={readOnly} maxLength={160} name="taglineEn" onChange={(event) => setTaglineEn(event.target.value)} type="text" value={taglineEn} />
      </label>
      <label className={labelClass}>
        <span>{labels.fields.taglineZhHk}</span>
        <input className={inputClass} disabled={readOnly} maxLength={160} name="taglineZhHk" onChange={(event) => setTaglineZhHk(event.target.value)} type="text" value={taglineZhHk} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        <span>{labels.fields.descriptionZhHk}</span>
        <textarea className={textareaClass} disabled={readOnly} maxLength={2000} name="descriptionZhHk" onChange={(event) => setDescriptionZhHk(event.target.value)} value={descriptionZhHk} />
      </label>
```

- [ ] **Step 4: Write the panel that owns the four values**

Create `components/portal/company-forms.tsx`:

```tsx
"use client";

import {useState} from "react";

import {
  CompanyProfileForm,
  type CompanyProfileFormLabels,
  type CompanyProfileValues,
} from "@/components/portal/company-profile-form";
import {WriterAssist, type WriterAssistProps} from "@/components/portal/writer-assist";
import type {AppLocale} from "@/i18n/routing";
import type {CompanyProfileFormState} from "@/lib/portal/company-profile-actions";

export type CompanyDetailsValues = Readonly<{
  companyId: string; legalName: string; displayName: string; website: string; industry: string; sizeBand: string; description: string;
}>;

export type CompanyDetailsLabels = Readonly<{
  legalName: string; displayName: string; website: string; industry: string; sizeBand: string; description: string; save: string; readOnly: string;
}>;

const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60";
const textareaClass = "min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 disabled:opacity-60";
const labelClass = "space-y-2 text-sm font-medium";

/**
 * The company page's two forms, plus the one writer control that fills both.
 *
 * The four public-copy values live here because they span two forms: the details
 * form writes the English description, the profile form writes the taglines and
 * the Chinese description. One generation fills all four, and neither form's save
 * is touched by it — the member still presses save, and review still governs
 * publication.
 */
export function CompanyForms({details, profile, writer}: Readonly<{
  details: Readonly<{values: CompanyDetailsValues; labels: CompanyDetailsLabels; action: ((formData: FormData) => void | Promise<void>) | undefined; canManage: boolean}>;
  profile: Readonly<{values: CompanyProfileValues; labels: CompanyProfileFormLabels; action: (state: CompanyProfileFormState, formData: FormData) => Promise<CompanyProfileFormState>; locale: AppLocale; readOnly: boolean; publicHref: string | null}>;
  writer: WriterAssistProps | null;
}>) {
  const [copy, setCopy] = useState({
    taglineEn: profile.values.taglineEn,
    taglineZhHk: profile.values.taglineZhHk,
    description: details.values.description,
    descriptionZhHk: profile.values.descriptionZhHk,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <form action={details.action} className="glass-card grid gap-5 p-5 sm:grid-cols-2 sm:p-8">
        <input name="companyId" type="hidden" value={details.values.companyId} />
        <label className={`${labelClass} sm:col-span-2`}>
          <span>{details.labels.legalName}</span>
          <input className={inputClass} defaultValue={details.values.legalName} disabled={!details.canManage} name="legalName" required />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span>{details.labels.displayName}</span>
          <input className={inputClass} defaultValue={details.values.displayName} disabled={!details.canManage} name="displayName" required />
        </label>
        <label className={labelClass}>
          <span>{details.labels.website}</span>
          <input className={inputClass} defaultValue={details.values.website} disabled={!details.canManage} name="website" type="url" />
        </label>
        <label className={labelClass}>
          <span>{details.labels.industry}</span>
          <input className={inputClass} defaultValue={details.values.industry} disabled={!details.canManage} name="industry" />
        </label>
        <label className={labelClass}>
          <span>{details.labels.sizeBand}</span>
          <input className={inputClass} defaultValue={details.values.sizeBand} disabled={!details.canManage} name="sizeBand" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span>{details.labels.description}</span>
          <textarea
            className={textareaClass}
            disabled={!details.canManage}
            name="description"
            onChange={(event) => setCopy((current) => ({...current, description: event.target.value}))}
            value={copy.description}
          />
        </label>
        {details.canManage ? (
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2 sm:justify-self-start" type="submit">{details.labels.save}</button>
        ) : (
          <p className="text-sm text-muted-foreground sm:col-span-2">{details.labels.readOnly}</p>
        )}
      </form>

      {writer ? (
        <WriterAssist
          kind="profile"
          labels={writer.labels}
          quotaLabel={writer.quotaLabel}
          exhausted={writer.exhausted}
          onGenerated={(generated) => setCopy((current) => ({
            taglineEn: generated.taglineEn ?? current.taglineEn,
            taglineZhHk: generated.taglineZhHk ?? current.taglineZhHk,
            description: generated.description ?? current.description,
            descriptionZhHk: generated.descriptionZhHk ?? current.descriptionZhHk,
          }))}
        />
      ) : null}

      <CompanyProfileForm
        action={profile.action}
        labels={profile.labels}
        locale={profile.locale}
        publicHref={profile.publicHref}
        readOnly={profile.readOnly}
        values={{...profile.values, taglineEn: copy.taglineEn, taglineZhHk: copy.taglineZhHk, descriptionZhHk: copy.descriptionZhHk}}
      />
    </div>
  );
}
```

- [ ] **Step 5: Render the panel from the page**

In `app/[locale]/(member)/portal/company/page.tsx`:

- Delete the inline details `<form>` block (the one whose action is `updateCompanyAction`) and the `<section>` that wraps `<CompanyProfileForm … />`, replacing both with a single `<CompanyForms … />`.
- Replace the `CompanyProfileForm` import with `CompanyForms`.
- After the `actor` guard, add the writer props:

```tsx
  const writerT = await getTranslations({locale, namespace: "Portal.writer"});
  const writer = actor.kind === "member" ? await writerAssistProps("profile", actor, writerT) : null;
```

- Render:

```tsx
      <CompanyForms
        details={{
          values: {companyId: company.id, legalName: company.legalName, displayName: company.displayName, website: company.website ?? "", industry: company.industry ?? "", sizeBand: company.sizeBand ?? "", description: company.description ?? ""},
          labels: {legalName: t("fields.legalName"), displayName: t("fields.displayName"), website: t("fields.website"), industry: t("fields.industry"), sizeBand: t("fields.sizeBand"), description: t("fields.description"), save: t("save"), readOnly: t("readOnly")},
          action: canManage ? updateCompanyAction : undefined,
          canManage,
        }}
        profile={{
          values: {slug: profileCompany.slug ?? "", taglineEn: profileCompany.taglineEn ?? "", taglineZhHk: profileCompany.taglineZhHk ?? "", descriptionZhHk: profileCompany.descriptionZhHk ?? "", website: profileCompany.website ?? "", logoMediaId: profileCompany.logoMediaId ?? "", tags: profileCompany.tags, status: profileCompany.publicProfileStatus, rejectionReason: profileCompany.profileRejectionReason},
          labels: { /* the existing CompanyProfileForm labels object, unchanged */ },
          action: saveCompanyProfileAction.bind(null, locale),
          locale,
          readOnly: !profileCompany.canManage,
          publicHref: profileCompany.publicProfileStatus === "published" && profileCompany.slug ? localizedPath(locale, `/members/${profileCompany.slug}`) : null,
        }}
        writer={writer}
      />
```

The `CompanyProfileForm` labels object moves to the panel's `profile.labels` unchanged; the section `<h2>{tProfile("title")}</h2>` and its description paragraph that preceded the form move above `<CompanyForms … />` in the page, since the panel's details form now comes first.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/company-forms-writer.test.tsx tests/unit/wt-pages/about.test.tsx && npm run typecheck && npm run audit:strings`
Expected: PASS, and typecheck silent.

- [ ] **Step 7: Commit**

```bash
git add components/portal/company-forms.tsx components/portal/company-profile-form.tsx "app/[locale]/(member)/portal/company/page.tsx" tests/unit/company-forms-writer.test.tsx
git commit -m "feat(portal): generate the company page's public copy in one pass"
```

---

### Task 7: The gated acceptance walk and the full gate

**Files:**
- Create: `tests/e2e/phase-d3-writer-ui.spec.ts`

**Interfaces:**
- Consumes: the three surfaces (Tasks 4–6).

- [ ] **Step 1: Write the spec**

Create `tests/e2e/phase-d3-writer-ui.spec.ts`, mirroring `tests/e2e/phase-b2-member-directory.spec.ts`: sign in through `signInForM2`, read copy from the bundles, and skip when the isolated M2 environment is not configured. It also skips when the writers are not enabled, because with `AGENTS_ENABLED` off the control is deliberately absent.

```ts
import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = missingM2LiveEnvironment();
const writersEnabled = process.env.AGENTS_ENABLED === "true";

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {
    Portal: {writer: {label: string; generate: string}};
  };

/**
 * Phase D-3 exit: a member generates copy from the portal and it lands in the
 * form, unfiled until they save. This needs a real model, so it skips unless the
 * isolated M2 environment AND a live agent are configured; the owner acceptance
 * step in the plan is what proves the model itself.
 */
test("a member generates event copy into the form", async ({page}) => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);
  test.skip(!writersEnabled, "Requires AGENTS_ENABLED=true");

  const copy = bundle("en");
  await signInForM2(page, "member");
  await page.goto("/portal/events/new");

  await page.getByText(copy.Portal.writer.label).click();
  await page.getByLabel(copy.Portal.writer.label).fill("A members-only workshop on edge AI");
  await page.getByRole("button", {name: copy.Portal.writer.generate}).click();

  await expect(page.locator("textarea[name=descriptionEn]")).not.toHaveValue("");
  await expect(page.locator("textarea[name=descriptionZh]")).not.toHaveValue("");
});

test("the same member can generate showcase listing copy", async ({page}) => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);
  test.skip(!writersEnabled, "Requires AGENTS_ENABLED=true");

  await signInForM2(page, "member");
  await page.goto("/portal/company/listing");

  await expect(page.getByText(bundle("en").Portal.writer.label)).toBeVisible();
});
```

If a selector does not match a configured environment, fix the selector in the test — never the product — and keep the two assertions that carry the gate: the control appears for an entitled member, and generating puts non-empty text into both language fields.

- [ ] **Step 2: Run the full gate**

Run: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/phase-d3-writer-ui.spec.ts
git commit -m "test(e2e): a member generates portal copy with no second login"
```

---

## Verification checklist

Against the spec's §4.5 and §7, the UI half:

| # | Done when | Task |
|---|---|---|
| 1 | The control appears only for an enabled agent and an entitled plan, and never when the quota read fails | 1, 3 |
| 2 | One generation fills both languages on the event, listing and company surfaces | 4, 5, 6 |
| 3 | Nothing is persisted by a generation; the member still saves, still reviewed | 4, 5, 6 |
| 4 | A quota at the cap disables the control with a message naming the cap | 2, 3 |
| 5 | Both bundles are in parity; the five gate commands are green | 2, 7 |

## Open item carried from D-3a

The `/membership` benefit copy does not yet mention the AI writer allowance, so the entitlement is invisible to prospects. Decide whether that belongs to this plan's Task 2 (add a `Membership.tierBenefits` line per plan) or a separate change; it is not required by the D-3 definition of done.
