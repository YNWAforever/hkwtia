"use client";

export function EventCompanyPicker({action, companyId, choices, labels}: Readonly<{
  action: string;
  companyId: string;
  choices: readonly Readonly<{id: string; displayName: string}>[];
  labels: Readonly<{choose: string; use: string; changeWarning: string}>;
}>) {
  return <form action={action} className="glass-card flex flex-wrap items-end gap-3 p-4" method="get" onSubmit={(event) => {
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
    <label className="flex min-w-48 flex-1 flex-col gap-2 text-sm font-medium">{labels.choose}
      <select className="min-h-11 rounded-md border border-input bg-background px-3" defaultValue={companyId} name="companyId">
        {choices.map((company) => <option key={company.id} value={company.id}>{company.displayName}</option>)}
      </select>
    </label>
    <button className="min-h-11 rounded-md border border-border px-4 text-sm font-medium" type="submit">{labels.use}</button>
  </form>;
}