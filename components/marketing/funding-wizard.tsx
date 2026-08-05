"use client";

import type {FundingLocale} from "@/config/funding-schemes";
import type {FundingAnswers, FundingQuestionKey} from "@/lib/launchpad/funding";

type QuestionLabels = Readonly<{
  label: string;
  options: Readonly<Record<string, string>>;
}>;

export type FundingWizardLabels = Readonly<{
  formLabel: string;
  instructions: string;
  submit: string;
  questions: Readonly<Record<FundingQuestionKey, QuestionLabels>>;
}>;

export function FundingWizard({
  locale,
  answers,
  labels,
}: Readonly<{
  locale: FundingLocale;
  answers: FundingAnswers | null;
  labels: FundingWizardLabels;
}>) {
  const action = locale === "zh-HK" ? "/zh/launchpad" : "/launchpad";
  const keys: readonly FundingQuestionKey[] = ["sector", "stage", "market", "employees", "revenue"];
  return <form action={action} aria-label={labels.formLabel} className="glass-card space-y-6 p-6" method="get">
    <p className="text-sm text-muted-foreground" role="status">{labels.instructions}</p>
    <div className="grid gap-5 sm:grid-cols-2">
      {keys.map((key) => <div key={key} className="space-y-2">
        <label className="font-medium" htmlFor={`funding-${key}`}>{labels.questions[key].label}</label>
        <select className="w-full rounded-md border bg-background px-3 py-2" defaultValue={answers?.[key] ?? ""} id={`funding-${key}`} name={key} required>
          <option value="">{labels.instructions}</option>
          {Object.entries(labels.questions[key].options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>)}
    </div>
    <button className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground" type="submit">{labels.submit}</button>
  </form>;
}

export type FundingResultsLabels = Readonly<{
  heading: string;
  eligible: string;
  ineligible: string;
  source: string;
  asOf: string;
}>;

export function FundingResults({
  labels,
  results,
}: Readonly<{
  labels: FundingResultsLabels;
  results: ReadonlyArray<Readonly<{id: string; name: string; summary: string; sourceUrl: string; potentiallyEligible: boolean; disclaimer: string; asOf: string}>>;
}>) {
  return <section aria-labelledby="funding-results-heading" className="space-y-5">
    <h3 className="font-serif text-2xl font-semibold" id="funding-results-heading">{labels.heading}</h3>
    <div className="grid gap-4 lg:grid-cols-2">
      {results.map((result) => <article className="rounded-lg border p-5" key={result.id}>
        <p className="font-medium" role="status">{result.potentiallyEligible ? labels.eligible : labels.ineligible}</p>
        <h4 className="mt-2 text-lg font-semibold">{result.name}</h4>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.summary}</p>
        <p className="mt-4 text-sm text-muted-foreground">{labels.asOf} {result.asOf}</p>
        <p className="mt-2 text-sm text-muted-foreground">{result.disclaimer}</p>
        <a className="mt-4 inline-flex font-medium underline" href={result.sourceUrl} rel="noreferrer" target="_blank">{labels.source}</a>
      </article>)}
    </div>
  </section>;
}
