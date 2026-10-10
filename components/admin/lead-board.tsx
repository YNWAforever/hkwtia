import {Link as LocaleLink} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import type {BoardCard, ContactBoard, ContactSource, ContactStage} from "@/lib/db/repos/contacts";
import {localizedPath} from "@/lib/urls";

/**
 * Phase E board. The pipeline as columns, one card per lead.
 *
 * A Server Component with no drag-and-drop: moving a card is the same plain
 * `<form>` the list posts (`updateContactPipelineAction`), so the board adds no
 * mutation path and works without JavaScript. The overdue marker is a text
 * label from the bundle, never colour alone.
 */
export type LeadBoardLabels = Readonly<{
  caption: string;
  stage: Readonly<Record<ContactStage, string>>;
  source: Readonly<Record<ContactSource, string>>;
  view: Readonly<{label: string; list: string; board: string}>;
  filters: Readonly<{
    owner: string; anyone: string; mine: string; source: string; anySource: string;
    overdueOnly: string; includeClosed: string; apply: string;
  }>;
  columnCount: (count: number) => string;
  emptyColumn: string;
  unnamed: string;
  unassigned: string;
  ownedBy: (name: string) => string;
  dueOn: (date: string) => string;
  noNextStep: string;
  overdue: string;
  inviteOpened: string;
  applied: string;
  moveTo: string;
  move: string;
}>;

export type LeadBoardFilterState = Readonly<{
  owner: "" | "mine";
  source: ContactSource | "";
  overdueOnly: boolean;
  includeClosed: boolean;
}>;

type Action = (formData: FormData) => void | Promise<void>;

const OPEN_STAGES = ["new", "contacted", "qualified", "applied", "member"] as const satisfies readonly ContactStage[];
const ALL_STAGES = [...OPEN_STAGES, "closed"] as const satisfies readonly ContactStage[];
const SOURCES = ["whatsapp", "event_guest", "showcase_intro", "join_abandoned", "interest_form", "import"] as const satisfies readonly ContactSource[];

const selectClass = "min-h-11 rounded-md border border-input bg-background px-3 text-sm";

function LeadBoardCard({
  card,
  stage,
  labels,
  dueFormat,
  now,
  returnTo,
  updateAction,
}: Readonly<{
  card: BoardCard;
  stage: ContactStage;
  labels: LeadBoardLabels;
  dueFormat: Intl.DateTimeFormat;
  now: Date;
  returnTo: string;
  updateAction: Action;
}>) {
  const overdue = card.nextStepDueAt !== null && card.nextStepDueAt.getTime() < now.getTime();
  return (
    <li className="space-y-2 rounded-md border border-border/70 bg-background p-3 text-sm">
      {/* The i18n Link takes an UNPREFIXED path and adds the locale itself. */}
      <LocaleLink className="block font-medium text-primary underline" href={`/admin/contacts/${card.id}`} prefetch={false}>
        {card.displayName ?? labels.unnamed}
      </LocaleLink>
      {card.organisation ? <p className="text-xs text-muted-foreground">{card.organisation}</p> : null}
      <p className="text-xs text-muted-foreground">{labels.source[card.source]}</p>
      <p className="text-xs text-muted-foreground">{card.ownerName ? labels.ownedBy(card.ownerName) : labels.unassigned}</p>
      <p>{card.nextStep ?? labels.noNextStep}</p>
      {card.nextStepDueAt ? <p className="text-xs text-muted-foreground">{labels.dueOn(dueFormat.format(card.nextStepDueAt))}</p> : null}
      {overdue ? <p className="text-xs font-semibold text-destructive">{labels.overdue}</p> : null}
      {card.inviteOpened || card.applied ? (
        <ul className="flex flex-wrap gap-1 text-xs">
          {card.inviteOpened ? <li className="rounded-full bg-muted px-2 py-0.5">{labels.inviteOpened}</li> : null}
          {card.applied ? <li className="rounded-full bg-muted px-2 py-0.5">{labels.applied}</li> : null}
        </ul>
      ) : null}
      <form action={updateAction} className="flex items-end gap-2">
        <input name="contactId" type="hidden" value={card.id} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <label className="sr-only" htmlFor={`board-stage-${card.id}`}>{labels.moveTo}</label>
        <select className={selectClass} defaultValue={stage} id={`board-stage-${card.id}`} name="stage">
          {ALL_STAGES.map((option) => <option key={option} value={option}>{labels.stage[option]}</option>)}
        </select>
        <button className="min-h-11 rounded-md border border-input px-3 py-2" type="submit">{labels.move}</button>
      </form>
    </li>
  );
}

export function LeadBoard({
  locale,
  board,
  labels,
  filters,
  returnTo,
  updateAction,
  now,
}: Readonly<{
  locale: AppLocale;
  board: ContactBoard;
  labels: LeadBoardLabels;
  filters: LeadBoardFilterState;
  returnTo: string;
  updateAction: Action;
  /** Injected so "overdue" is a pure function of the render, like the lead page's. */
  now: Date;
}>) {
  const dueFormat = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "Asia/Hong_Kong"});
  const columns: readonly ContactStage[] = filters.includeClosed ? ALL_STAGES : OPEN_STAGES;
  const contactsPath = localizedPath(locale, "/admin/contacts");

  return (
    <div className="space-y-6">
      <nav aria-label={labels.view.label} className="flex gap-2 text-sm">
        <LocaleLink className="rounded-md border border-input px-3 py-2" href="/admin/contacts">{labels.view.list}</LocaleLink>
        <span aria-current="page" className="rounded-md bg-primary px-3 py-2 text-primary-foreground">{labels.view.board}</span>
      </nav>
      <form action={contactsPath} className="flex flex-wrap items-end gap-3" method="get">
        <input name="view" type="hidden" value="board" />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="board-filter-owner">{labels.filters.owner}</label>
          <select className={selectClass} defaultValue={filters.owner} id="board-filter-owner" name="owner">
            <option value="">{labels.filters.anyone}</option>
            <option value="mine">{labels.filters.mine}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="board-filter-source">{labels.filters.source}</label>
          <select className={selectClass} defaultValue={filters.source} id="board-filter-source" name="source">
            <option value="">{labels.filters.anySource}</option>
            {SOURCES.map((source) => <option key={source} value={source}>{labels.source[source]}</option>)}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input defaultChecked={filters.overdueOnly} name="overdue" type="checkbox" value="1" />
          {labels.filters.overdueOnly}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input defaultChecked={filters.includeClosed} name="closed" type="checkbox" value="1" />
          {labels.filters.includeClosed}
        </label>
        <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">{labels.filters.apply}</button>
      </form>
      <div aria-label={labels.caption} className="grid gap-4 overflow-x-auto md:auto-cols-fr md:grid-flow-col" role="group">
        {columns.map((stage) => {
          const cards = board[stage];
          return (
            <section aria-labelledby={`board-column-${stage}`} className="min-w-56 space-y-3 rounded-lg bg-muted/30 p-3" key={stage}>
              <header>
                <h2 className="font-semibold" id={`board-column-${stage}`}>{labels.stage[stage]}</h2>
                <p className="text-xs text-muted-foreground">{labels.columnCount(cards.length)}</p>
              </header>
              {cards.length === 0
                ? <p className="text-sm text-muted-foreground">{labels.emptyColumn}</p>
                : (
                  <ul className="space-y-3">
                    {cards.map((card) => (
                      <LeadBoardCard card={card} dueFormat={dueFormat} key={card.id} labels={labels} now={now} returnTo={returnTo} stage={stage} updateAction={updateAction} />
                    ))}
                  </ul>
                )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
