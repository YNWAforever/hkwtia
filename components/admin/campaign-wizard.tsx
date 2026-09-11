import {
  nextWizardStep,
  previousWizardStep,
  resolveWizardStep,
  variableParamName,
  type CampaignWizardState,
  type CampaignWizardStep,
} from "@/lib/admin/campaign-wizard";
import type {CampaignEligibilitySummary} from "@/lib/admin/campaigns";

/**
 * Programme C-5, part 2. The campaign wizard as staff drive it.
 *
 * A Server Component wrapping ONE `<form method="get">`, like
 * `components/admin/segment-builder.tsx`: the answers live in the query string,
 * so a step is a render and not a state transition, "Back" is a link the browser
 * already knows how to make, and a half-built campaign survives a refresh
 * without anything being written. The repo treats its 40 `'use client'` files as
 * a budget, and a six-step form needs no browser state to spend from it.
 *
 * The two submit buttons carry `name="step"` with different values, which is
 * what moves the wizard: a GET form submits the button that was pressed, so
 * Next and Back are one form rather than two.
 *
 * Only the LAST step posts. `createAction` is a Server Action, and the draft row
 * it writes is the first thing this screen puts in the database.
 */
export type CampaignWizardOption = Readonly<{value: string; label: string}>;

export type CampaignEligibilityRow = Readonly<{reason: string; label: string; count: number}>;

export type CampaignWizardLabels = Readonly<{
  steps: Readonly<Record<CampaignWizardStep, string>>;
  channel: Readonly<{email: string; whatsapp: string}>;
  fields: Readonly<{name: string; template: string; segment: string}>;
  variables: Readonly<{legend: string; hint: string}>;
  actions: Readonly<{createDraft: string; next: string; back: string; goToStep: string}>;
  templateUnapproved: string;
  noSegments: string;
  recipients: string;
}>;

type Props = Readonly<{
  state: CampaignWizardState;
  steps: readonly CampaignWizardStep[];
  templateVariables: readonly string[];
  templateOptions: readonly CampaignWizardOption[];
  segmentOptions: readonly CampaignWizardOption[];
  eligibility: readonly CampaignEligibilityRow[] | null;
  summary: CampaignEligibilitySummary | null;
  blocking: CampaignWizardStep | null;
  /**
   * The sentence that names `blocking`, resolved by the page because only the
   * page holds the translator. It used to be `labels.variables.missing` for
   * every blocking step, which told an admin whose segment was unsaved that
   * template fields were missing.
   */
  blockedNotice: string | null;
  formPath: string;
  labels: CampaignWizardLabels;
  createAction: (formData: FormData) => void | Promise<void>;
}>;

/**
 * Every answer the wizard holds, as form fields. The step being edited owns its
 * own parameters and must not also emit them as hidden inputs — a duplicate
 * name submits twice and `URLSearchParams.get` keeps the first, which would
 * make the visible control inert.
 */
function stateEntries(state: CampaignWizardState): readonly (readonly [string, string])[] {
  return [
    ["campaignDraft", state.draftId],
    ["name", state.name],
    ["channel", state.channel],
    ["template", state.template ?? ""],
    ["templateKey", state.templateKey ?? ""],
    ["segmentId", state.segmentId ?? ""],
    ...Object.entries(state.variables).map(([variable, value]) => [variableParamName(variable), value] as const),
  ];
}

function ownedParameters(step: CampaignWizardStep, templateVariables: readonly string[]): readonly string[] {
  switch (step) {
    case "name": return ["name"];
    case "channel": return ["channel"];
    case "template": return ["template", "templateKey"];
    case "variables": return templateVariables.map(variableParamName);
    case "segment": return ["segmentId"];
    default: return [];
  }
}

function HiddenState({state, omit}: Readonly<{state: CampaignWizardState; omit: readonly string[]}>) {
  return (
    <>
      {stateEntries(state)
        .filter(([name]) => !omit.includes(name))
        .map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
    </>
  );
}

const fieldClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2";

export function CampaignWizard({
  state, steps, templateVariables, templateOptions, segmentOptions,
  eligibility, summary, blocking, blockedNotice, formPath, labels, createAction,
}: Props) {
  // Through the helpers, not a second inline copy of them: the first version of
  // this component reimplemented all three, so the unit test that pinned
  // `nextWizardStep` stayed green while the live Next button skipped a step.
  const current = resolveWizardStep(state.step, steps);
  const index = Math.max(steps.indexOf(current), 0);
  const back = previousWizardStep(current, steps);
  const forward = nextWizardStep(current, steps);
  const omit = ownedParameters(current, templateVariables);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {steps.map((step, position) => (
          <li className={step === current ? "font-medium text-foreground" : undefined} key={step}>
            {position + 1}. {labels.steps[step]}
          </li>
        ))}
      </ol>

      <form action={formPath} className="space-y-4" method="get">
        <HiddenState omit={omit} state={state} />

        {current === "name" ? (
          <label className="grid max-w-md gap-1 text-sm">
            <span>{labels.fields.name}</span>
            <input className={fieldClass} defaultValue={state.name} maxLength={140} name="name" required type="text" />
          </label>
        ) : null}

        {current === "channel" ? (
          <label className="grid max-w-md gap-1 text-sm">
            <span>{labels.steps.channel}</span>
            <select className={fieldClass} defaultValue={state.channel} name="channel">
              <option value="email">{labels.channel.email}</option>
              <option value="whatsapp">{labels.channel.whatsapp}</option>
            </select>
          </label>
        ) : null}

        {current === "template" ? (
          <div className="space-y-3">
            {/* An empty list here means the registry has approved nothing for
                this channel, which is exactly the state 0034 seeds (S-14). The
                message names the screen that fixes it rather than leaving a
                select with no options. */}
            {templateOptions.length === 0 ? <p className="text-sm text-muted-foreground">{labels.templateUnapproved}</p> : (
              <label className="grid max-w-md gap-1 text-sm">
                <span>{labels.fields.template}</span>
                <select
                  className={fieldClass}
                  defaultValue={(state.channel === "whatsapp" ? state.templateKey : state.template) ?? ""}
                  name={state.channel === "whatsapp" ? "templateKey" : "template"}
                  required
                >
                  {templateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
          </div>
        ) : null}

        {current === "variables" ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{labels.variables.legend}</legend>
            <p className="text-sm text-muted-foreground">{labels.variables.hint}</p>
            {templateVariables.map((variable) => (
              <label className="grid max-w-md gap-1 text-sm" key={variable}>
                <span className="font-mono text-xs">{variable}</span>
                <input
                  className={fieldClass}
                  defaultValue={state.variables[variable] ?? ""}
                  maxLength={1000}
                  name={variableParamName(variable)}
                  required
                  type="text"
                />
              </label>
            ))}
          </fieldset>
        ) : null}

        {current === "segment" ? (
          <div className="space-y-3">
            {segmentOptions.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noSegments}</p> : (
              <label className="grid max-w-md gap-1 text-sm">
                <span>{labels.fields.segment}</span>
                <select className={fieldClass} defaultValue={state.segmentId ?? ""} name="segmentId" required>
                  {segmentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
          </div>
        ) : null}

        {current === "preview" ? (
          <div className="space-y-3">
            {/* The counts, per category, INCLUDING `missing_variable`: a
                recipient whose template parameter will not resolve is visible
                here, before the blast, rather than as one permanent failure and
                one staff task after it. */}
            {blockedNotice === null ? null : <p className="text-sm text-destructive">{blockedNotice}</p>}
            {eligibility === null ? null : (
              <dl className="max-w-md divide-y divide-border rounded-md border border-border">
                {eligibility.map((row) => (
                  <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm" key={row.reason}>
                    <dt>{row.label}</dt>
                    <dd className="font-mono">{row.count}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm font-medium">
                  <dt>{labels.recipients}</dt>
                  <dd className="font-mono">{(summary?.eligible ?? 0) + (summary?.blocked ?? 0)}</dd>
                </div>
              </dl>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {index > 0 ? (
            <button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm" name="step" type="submit" value={back}>
              {labels.actions.back}
            </button>
          ) : null}
          {current === "preview" ? null : (
            <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" name="step" type="submit" value={forward}>
              {labels.actions.next}
            </button>
          )}
          {/* The way out of a blocked preview. Without it the only exit is Back,
              pressed once per step between here and the unanswered one, and a
              reader who arrived by a shared link has no way to know how many. */}
          {current === "preview" && blocking !== null ? (
            <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" name="step" type="submit" value={blocking}>
              {labels.actions.goToStep}
            </button>
          ) : null}
        </div>
      </form>

      {/* A sibling, never a child: nested forms are illegal, and the GET form
          above must not carry the action that writes. */}
      {current === "preview" && blocking === null ? (
        <form action={createAction}>
          <HiddenState omit={[]} state={state} />
          <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">
            {labels.actions.createDraft}
          </button>
        </form>
      ) : null}
    </div>
  );
}
