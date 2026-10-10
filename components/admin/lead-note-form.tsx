type Action = (formData: FormData) => void | Promise<void>;

/**
 * Phase E. One textarea and a button: a note is the cheapest thing a salesperson
 * writes, so it must cost one click to file. A plain `<form action>` rather than
 * a client component — nothing here needs browser state, and the server action
 * redirects back so the new entry is the first thing on the reloaded timeline.
 */
export function LeadNoteForm({
  contactId,
  returnTo,
  action,
  labels,
}: Readonly<{
  contactId: string;
  returnTo: string;
  action: Action;
  labels: Readonly<{title: string; label: string; add: string}>;
}>) {
  return (
    <form action={action} className="space-y-3">
      <input name="contactId" type="hidden" value={contactId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <h2 className="font-serif text-xl font-semibold">{labels.title}</h2>
      <label className="sr-only" htmlFor="lead-note-body">{labels.label}</label>
      <textarea
        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        id="lead-note-body"
        maxLength={2000}
        name="body"
        required
      />
      <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">{labels.add}</button>
    </form>
  );
}
