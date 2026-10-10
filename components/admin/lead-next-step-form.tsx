type Action = (formData: FormData) => void | Promise<void>;

/**
 * Phase E. The single "what happens next" for a lead, with an optional due day.
 *
 * The date is a native `<input type="date">`: it posts a calendar day, never an
 * instant, because the repository pins a due day to 18:00 Hong Kong time and a
 * browser-zone timestamp would shift it for any admin travelling. An overdue
 * step is flagged in words as well as in the destructive colour, so the signal
 * survives colour-blindness and a monochrome print.
 */
export function LeadNextStepForm({
  contactId,
  returnTo,
  action,
  nextStep,
  dueDate,
  overdue,
  labels,
}: Readonly<{
  contactId: string;
  returnTo: string;
  action: Action;
  nextStep: string;
  dueDate: string;
  overdue: boolean;
  labels: Readonly<{title: string; label: string; due: string; save: string; overdue: string; none: string}>;
}>) {
  return (
    <form action={action} className="space-y-3">
      <input name="contactId" type="hidden" value={contactId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <h2 className="font-serif text-xl font-semibold">{labels.title}</h2>
      {nextStep === "" ? <p className="text-sm text-muted-foreground">{labels.none}</p> : null}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="lead-next-step">{labels.label}</label>
        <input
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={nextStep}
          id="lead-next-step"
          maxLength={200}
          name="nextStep"
          type="text"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="lead-next-step-due">{labels.due}</label>
        <input
          className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={dueDate}
          id="lead-next-step-due"
          name="dueAt"
          type="date"
        />
        {overdue ? <span className="text-sm font-medium text-destructive">{labels.overdue}</span> : null}
      </div>
      <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">{labels.save}</button>
    </form>
  );
}
