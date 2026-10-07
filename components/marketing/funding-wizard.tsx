"use client";

import {Arrow} from "@/components/wt/arrow";
import type {FundingLocale} from "@/config/funding-schemes";
import type {FundingAnswers, FundingQuestionKey} from "@/lib/launchpad/funding";

type QuestionLabels = Readonly<{
  label: string;
  options: Readonly<Record<string, string>>;
}>;

export type FundingWizardLabels = Readonly<{
  formLabel: string;
  instructions: string;
  /** The empty option. The full instruction sentence was cut off inside a phone-width select. */
  placeholder: string;
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
  // The site's filter-form grammar (.event-filter-panel / -grid / .directory-actions, as on
  // /events): this was the one form still in generic Tailwind -- 16px blue labels, glass card,
  // a square-cornered primary button.
  return <form action={action} aria-label={labels.formLabel} className="event-filter-panel funding-form" method="get">
    <p className="funding-form-note" role="status">{labels.instructions}</p>
    <div className="event-filter-grid">
      {keys.map((key) => <label htmlFor={`funding-${key}`} key={key}>
        <span>{labels.questions[key].label}</span>
        <select defaultValue={answers?.[key] ?? ""} id={`funding-${key}`} name={key} required>
          <option value="">{labels.placeholder}</option>
          {Object.entries(labels.questions[key].options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>)}
    </div>
    <div className="directory-actions">
      <button className="button" type="submit">{labels.submit}</button>
    </div>
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
  // Every scheme carries the same verify-current-terms disclaimer, and printed in each card it
  // read five times down the list. When they agree it is said once, under the heading.
  const shared = results.length > 1 && results.every(({disclaimer}) => disclaimer === results[0]!.disclaimer)
    ? results[0]!.disclaimer
    : null;
  return <section aria-labelledby="funding-results-heading" className="funding-results">
    <h3 id="funding-results-heading">{labels.heading}</h3>
    {shared ? <p className="funding-results-note">{shared}</p> : null}
    <div className="funding-result-grid">
      {results.map((result) => <article className="funding-result" key={result.id}>
        <p className="status-label" role="status">{result.potentiallyEligible ? labels.eligible : labels.ineligible}</p>
        <h4>{result.name}</h4>
        <p>{result.summary}</p>
        <p className="funding-result-meta">{labels.asOf} {result.asOf}</p>
        {shared ? null : <p className="funding-result-meta">{result.disclaimer}</p>}
        <a className="text-link" href={result.sourceUrl} rel="noreferrer" target="_blank">{labels.source} <Arrow /></a>
      </article>)}
    </div>
  </section>;
}
