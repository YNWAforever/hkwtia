"use client";

import {useId, type ReactNode} from "react";

/** Keeps dirty markers scoped to the displayed company, without copying form values into shared state. */
export function CompanyFormScope({children}: Readonly<{children: ReactNode}>) {
  return <div data-company-workspace onChangeCapture={(event) => {
    const form = (event.target as HTMLElement).closest("form");
    if (form && !form.hasAttribute("data-company-picker")) form.dataset.dirty = "true";
  }}>{children}</div>;
}

export function CompanySelector({action, companyId, choices, labels}: Readonly<{
  action: string; companyId: string;
  choices: readonly Readonly<{id: string; displayName: string}>[];
  labels: Readonly<{choose: string; use: string; changeWarning: string}>;
}>) {
  const id = useId();
  return <form action={action} method="get" className="portal-form portal-company-picker" data-company-picker onSubmit={(event) => {
    const form = event.currentTarget;
    const selected = new FormData(form).get("companyId");
    if (selected === companyId) { event.preventDefault(); return; }
    const dirty = form.closest("[data-company-workspace]")?.querySelector('form[data-dirty="true"]');
    if (dirty && !window.confirm(labels.changeWarning)) {
      event.preventDefault();
      const select = form.elements.namedItem("companyId");
      if (select instanceof HTMLSelectElement) select.value = companyId;
    }
  }}>
    <label className="portal-fieldset-title" htmlFor={id}>{labels.choose}</label>
    <div className="portal-company-picker-row">
      <select id={id} aria-describedby={`${id}-help`} defaultValue={companyId} name="companyId" required>
        {!companyId ? <option value="" disabled>{labels.choose}</option> : null}
        {choices.map((company) => <option key={company.id} value={company.id}>{company.displayName}</option>)}
      </select>
      <button className="portal-button-outline" type="submit">{labels.use}</button>
    </div>
    <p className="portal-field-help" id={`${id}-help`}>{labels.changeWarning}</p>
  </form>;
}
