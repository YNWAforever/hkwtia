"use client";

import {useActionState} from "react";

type State = Readonly<{status: string; listings?: number}>;

export type ArchiveToggleLabels = Readonly<{
  archive: string;
  unarchive: string;
  archiving: string;
  archivedNotice: string;
  /** Shown when a listing still points at the image. Takes {count}. */
  inUse: string;
  error: string;
}>;

const initialState: State = {status: "idle"};

/**
 * A separate form from the content editor. Archiving retires an item from the
 * authoring list, so it should not ride along with a content save that a staff
 * member might submit by reflex.
 */
export function ArchiveToggle({
  action,
  archived,
  labels,
}: Readonly<{
  action: (state: never, formData: FormData) => Promise<never>;
  archived: boolean;
  labels: ArchiveToggleLabels;
}>) {
  const [state, formAction, pending] = useActionState(
    action as unknown as (state: State, formData: FormData) => Promise<State>,
    initialState,
  );

  const message = state.status === "inUse"
    ? labels.inUse.replace("{count}", String(state.listings ?? 0))
    : state.status === "error" || state.status === "invalid"
      ? labels.error
      : null;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      {archived ? <p className="text-sm text-muted-foreground">{labels.archivedNotice}</p> : null}
      <button
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? labels.archiving : archived ? labels.unarchive : labels.archive}
      </button>
      {message
        ? <p className="text-sm text-destructive" role="alert">{message}</p>
        : null}
    </form>
  );
}
