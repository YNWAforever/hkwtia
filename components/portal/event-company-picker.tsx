"use client";

import {useId} from "react";

/**
 * Members who manage several companies choose which one the event is for. A plain GET form, so it
 * works without JavaScript; with it, switching away from an event that has unsaved details asks
 * first (the event form marks itself `data-dirty`). The warning is also shown as help text, so the
 * member knows before choosing rather than only from the confirm dialog.
 */
export function EventCompanyPicker({action, companyId, choices, labels}: Readonly<{
  action: string;
  companyId: string;
  choices: readonly Readonly<{id: string; displayName: string}>[];
  labels: Readonly<{choose: string; use: string; changeWarning: string}>;
}>) {
  const legendId = useId();
  const helpId = useId();
  return <form action={action} className="portal-form portal-company-picker" method="get" onSubmit={(event) => {
    const selected = new FormData(event.currentTarget).get("companyId");
    if (selected === companyId) {
      event.preventDefault();
      return;
    }
    const eventForm = document.querySelector<HTMLFormElement>("[data-member-event-form]");
    if (eventForm?.dataset.dirty === "true" && !window.confirm(labels.changeWarning)) {
      event.preventDefault();
      const picker = event.currentTarget.elements.namedItem("companyId");
      if (picker instanceof HTMLSelectElement) picker.value = companyId;
    }
  }}>
    <fieldset className="portal-fieldset">
      <legend className="portal-fieldset-title" id={legendId}>{labels.choose}</legend>
      <div className="portal-company-picker-row">
        <select aria-describedby={helpId} aria-labelledby={legendId} defaultValue={companyId} name="companyId">
          {choices.map((company) => <option key={company.id} value={company.id}>{company.displayName}</option>)}
        </select>
        <button className="portal-button-outline" type="submit">{labels.use}</button>
      </div>
      <p className="portal-field-help" id={helpId}>{labels.changeWarning}</p>
    </fieldset>
  </form>;
}
