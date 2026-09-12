import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {ContactRow, ContactSource, ContactStage} from "@/lib/db/repos/contacts";
import {localizedPath} from "@/lib/urls";

/**
 * Programme C-4. The prospect pipeline as staff read it.
 *
 * A Server Component with a `<form method="get">` filter bar and one plain
 * `<form action={…}>` per row, like `components/admin/template-registry-table.tsx`:
 * nothing here needs browser state, and a `"use client"` boundary would only
 * drag the whole table into the client bundle so that a Save button could
 * submit. The filter state lives in the URL, which is what makes a filtered
 * pipeline a link an operator can send to a colleague.
 *
 * Every string arrives through `labels`, resolved from `Admin.contacts` by the
 * page.
 */
export type ContactPipelineLabels = Readonly<{
  caption: string;
  columns: Readonly<{
    name: string; stage: string; source: string; owner: string;
    lastInbound: string; optIn: string; actions: string;
  }>;
  stage: Readonly<Record<ContactStage, string>>;
  source: Readonly<Record<ContactSource, string>>;
  optIn: Readonly<{yes: string; no: string; stopped: string}>;
  filters: Readonly<{
    stage: string; source: string; owner: string; search: string;
    anyStage: string; anySource: string; anyOwner: string; anyOptIn: string;
    submit: string; clear: string;
  }>;
  unassigned: string;
  assign: string;
  assignToMe: string;
  save: string;
  openThread: string;
  noThread: string;
  convert: string;
  linkedMember: string;
  duplicates: (count: number) => string;
  empty: string;
}>;

export type ContactPipelineFilterState = Readonly<{
  stage: ContactStage | "";
  source: ContactSource | "";
  owner: string;
  optIn: "" | "yes" | "no";
  q: string;
}>;

type Action = (formData: FormData) => void | Promise<void>;

const STAGES: readonly ContactStage[] = ["new", "contacted", "qualified", "applied", "member", "closed"];
const SOURCES: readonly ContactSource[] = ["whatsapp", "event_guest", "showcase_intro", "join_abandoned", "interest_form", "import"];

const selectClass = "min-h-11 rounded-md border border-input bg-background px-3 text-sm";

function ownerOptions(row: ContactRow, actorProfileId: string, labels: ContactPipelineLabels) {
  const options: {value: string; label: string}[] = [
    {value: "", label: labels.unassigned},
    {value: actorProfileId, label: labels.assignToMe},
  ];
  // A contact owned by SOMEBODY ELSE keeps their name in the list, and selected.
  // Without it the control would offer only "nobody" and "me", so pressing Save
  // on a row to change its stage would quietly take the contact off a
  // colleague's desk.
  if (row.ownerProfileId !== null && row.ownerProfileId !== actorProfileId) {
    options.push({value: row.ownerProfileId, label: row.ownerName ?? row.ownerProfileId});
  }
  return options;
}

export function ContactPipelineTable({
  locale,
  rows,
  labels,
  filters,
  actorProfileId,
  returnTo,
  updateAction,
}: Readonly<{
  locale: AppLocale;
  rows: readonly ContactRow[];
  labels: ContactPipelineLabels;
  filters: ContactPipelineFilterState;
  actorProfileId: string;
  returnTo: string;
  updateAction: Action;
}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  const pipelinePath = localizedPath(locale, "/admin/contacts");
  return (
    <div className="space-y-6">
      <form action={pipelinePath} className="flex flex-wrap items-end gap-3" method="get">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="contact-filter-stage">{labels.filters.stage}</label>
          <select className={selectClass} defaultValue={filters.stage} id="contact-filter-stage" name="stage">
            <option value="">{labels.filters.anyStage}</option>
            {STAGES.map((stage) => <option key={stage} value={stage}>{labels.stage[stage]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="contact-filter-source">{labels.filters.source}</label>
          <select className={selectClass} defaultValue={filters.source} id="contact-filter-source" name="source">
            <option value="">{labels.filters.anySource}</option>
            {SOURCES.map((source) => <option key={source} value={source}>{labels.source[source]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="contact-filter-owner">{labels.filters.owner}</label>
          {/* Two options, not a staff directory: the question this filter
              answers in practice is "what is on my desk", and listing every
              staff profile would need a second query for a control nobody has
              asked for yet. */}
          <select className={selectClass} defaultValue={filters.owner} id="contact-filter-owner" name="owner">
            <option value="">{labels.filters.anyOwner}</option>
            <option value={actorProfileId}>{labels.assignToMe}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="contact-filter-optin">{labels.columns.optIn}</label>
          <select className={selectClass} defaultValue={filters.optIn} id="contact-filter-optin" name="optIn">
            <option value="">{labels.filters.anyOptIn}</option>
            <option value="yes">{labels.optIn.yes}</option>
            <option value="no">{labels.optIn.no}</option>
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="contact-filter-q">{labels.filters.search}</label>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={filters.q} id="contact-filter-q" maxLength={200} name="q" type="search" />
        </div>
        <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">{labels.filters.submit}</button>
        <Link className="min-h-11 rounded-md border border-input px-4 py-2 text-sm" href={pipelinePath}>{labels.filters.clear}</Link>
      </form>

      {rows.length === 0 ? <p className="text-muted-foreground">{labels.empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <caption className="sr-only">{labels.caption}</caption>
            <thead>
              <tr className="border-b border-border/70 text-muted-foreground">
                <th className="px-3 py-3" scope="col">{labels.columns.name}</th>
                <th className="px-3 py-3" scope="col">{labels.columns.source}</th>
                <th className="px-3 py-3" scope="col">{labels.columns.lastInbound}</th>
                <th className="px-3 py-3" scope="col">{labels.columns.optIn}</th>
                <th className="px-3 py-3" scope="col">{labels.columns.stage}</th>
                <th className="px-3 py-3" scope="col">{labels.columns.owner}</th>
                <th className="px-3 py-3" scope="col">{labels.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-b border-border/50 align-top" key={row.id}>
                  <th className="px-3 py-4 font-medium text-foreground" scope="row">
                    <span className="block">{row.displayName ?? row.email ?? row.phoneE164 ?? row.id}</span>
                    {row.email ? <span className="block text-xs text-muted-foreground">{row.email}</span> : null}
                    {row.phoneE164 ? <span className="block text-xs text-muted-foreground">{row.phoneE164}</span> : null}
                    {/* `contacts_email_idx` is deliberately not unique, so two
                        rows for one person are expected rather than a fault.
                        Saying so where staff can see it is what keeps them from
                        working the same prospect twice. */}
                    {row.duplicateCount > 1 ? <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">{labels.duplicates(row.duplicateCount)}</span> : null}
                  </th>
                  <td className="px-3 py-4">{labels.source[row.source]}</td>
                  <td className="px-3 py-4">{row.lastInboundAt ? formatter.format(row.lastInboundAt) : ""}</td>
                  <td className="px-3 py-4">
                    {row.whatsappOptedOutAt !== null
                      ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{labels.optIn.stopped}</span>
                      : row.whatsappOptIn ? labels.optIn.yes : labels.optIn.no}
                  </td>
                  <td className="px-3 py-4" colSpan={2}>
                    <form action={updateAction} className="flex flex-wrap items-end gap-2">
                      <input name="contactId" type="hidden" value={row.id} />
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <div className="flex flex-col gap-1">
                        <label className="sr-only" htmlFor={`contact-stage-${row.id}`}>{labels.columns.stage}</label>
                        <select className={selectClass} defaultValue={row.stage} id={`contact-stage-${row.id}`} name="stage">
                          {STAGES.map((stage) => <option key={stage} value={stage}>{labels.stage[stage]}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="sr-only" htmlFor={`contact-owner-${row.id}`}>{labels.assign}</label>
                        <select className={selectClass} defaultValue={row.ownerProfileId ?? ""} id={`contact-owner-${row.id}`} name="ownerProfileId">
                          {ownerOptions(row, actorProfileId, labels).map((option) => (
                            <option key={option.value || "unassigned"} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <button className="min-h-11 rounded-md border border-input px-3 py-2" type="submit">{labels.save}</button>
                    </form>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-col gap-2">
                      {row.conversationId === null
                        ? <span className="text-muted-foreground">{labels.noThread}</span>
                        : <Link className="text-primary underline" href={localizedPath(locale, `/admin/inbox/${row.conversationId}`)}>{labels.openThread}</Link>}
                      {row.profileId === null
                        // No personal data in the query string: the link is an
                        // invitation to join, not a pre-filled form, and a
                        // prospect's email in a URL is logged by every hop
                        // between here and the page.
                        ? <Link className="text-primary underline" href={`${localizedPath(locale, "/join")}?plan=community`}>{labels.convert}</Link>
                        : <Link className="text-primary underline" href={localizedPath(locale, `/admin/members/${row.profileId}`)}>{labels.linkedMember}</Link>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
