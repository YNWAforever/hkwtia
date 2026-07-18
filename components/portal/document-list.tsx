import type {AppLocale} from "@/i18n/routing";
import type {DocumentItem} from "@/lib/portal/content";

type Labels = Readonly<{receipt: string; resource: string; open: string}>;
type Props = Readonly<{locale: AppLocale; items: readonly DocumentItem[]; empty: string; labels: Labels}>;

export function DocumentList({locale, items, empty, labels}: Props) {
  if (items.length === 0) return <section className="glass-card p-6"><p className="text-muted-foreground">{empty}</p></section>;

  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <article className="glass-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{item.kind === "receipt" ? labels.receipt : labels.resource}</p>
            <h2 className="font-serif text-xl font-semibold">{item.title}</h2>
            {item.issuedAt ? <p className="text-sm text-muted-foreground">{new Date(item.issuedAt).toLocaleDateString(locale)}</p> : null}
          </div>
          {item.url ? <a className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted" href={item.url} rel="noreferrer" target="_blank">{labels.open}</a> : null}
        </article>
      ))}
    </div>
  );
}