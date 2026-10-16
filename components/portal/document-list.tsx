import {PrivateLink} from "@/components/internal-shell/private-link";
import {HonestEmpty} from "@/components/wt/honest-empty";
import type {AppLocale} from "@/i18n/routing";
import type {DocumentItem} from "@/lib/portal/content";
import {formatPortalAmount, formatPortalDate} from "@/lib/portal/format-date";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{
  receiptsHeading: string;
  /** Receives the formatted amount, or null when the receipt has none. */
  receiptTitle: (amount: string | null) => string;
  resourcesHeading: string;
  openReceipt: string;
  openDocument: string;
  newTab: string;
  empty: string;
  emptyLine: string;
  emptyAction: string;
}>;
type Props = Readonly<{locale: AppLocale; items: readonly DocumentItem[]; labels: Labels}>;

// Receipts link to Stripe's hosted invoice and approved resources to wherever staff pointed them,
// so an absolute http(s) URL is always another site. A relative URL stays on ours and keeps the tab.
const isExternal = (url: string) => /^https?:\/\//i.test(url);

// A receipt's `title` is the Stripe invoice id ("in_1Q…"): true, but no heading for a member to
// read (final review I1). Its title is built here from the amount instead; resources keep theirs.
function itemTitle(locale: AppLocale, item: DocumentItem, receiptTitle: Labels["receiptTitle"]): string {
  if (item.kind !== "receipt") return item.title;
  const amount = item.amount !== null && item.currency ? formatPortalAmount(locale, item.amount, item.currency) : null;
  return receiptTitle(amount);
}

function DocumentGroup({heading, items, action, locale, newTab, receiptTitle}: Readonly<{heading: string; items: readonly DocumentItem[]; action: string; locale: AppLocale; newTab: string; receiptTitle: Labels["receiptTitle"]}>) {
  if (items.length === 0) return null;
  return (
    <section className="portal-documents-group">
      <div className="portal-section-head"><h2>{heading}</h2></div>
      <ul className="portal-card-grid portal-documents-list">
        {items.map((item) => (
          <li className="portal-card portal-document" key={item.id}>
            <h3>{itemTitle(locale, item, receiptTitle)}</h3>
            {item.issuedAt ? <p className="portal-document-date"><time dateTime={item.issuedAt}>{formatPortalDate(locale, item.issuedAt)}</time></p> : null}
            {item.url ? (
              isExternal(item.url) ? (
                <a className="portal-button-outline" href={item.url} rel="noopener noreferrer" target="_blank">{action}<span className="sr-only"> {newTab}</span></a>
              ) : (
                <a className="portal-button-outline" href={item.url}>{action}</a>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DocumentList({locale, items, labels}: Props) {
  if (items.length === 0) {
    return (
      <>
        <HonestEmpty copy={labels.emptyLine} headingLevel={2} title={labels.empty} variant="inner" />
        <p className="portal-documents-next">
          <PrivateLink className="text-link" href={localizedPath(locale, "/portal/billing")}>{labels.emptyAction}</PrivateLink>
        </p>
      </>
    );
  }

  return (
    <div className="portal-documents">
      <DocumentGroup action={labels.openReceipt} heading={labels.receiptsHeading} items={items.filter((item) => item.kind === "receipt")} locale={locale} newTab={labels.newTab} receiptTitle={labels.receiptTitle} />
      <DocumentGroup action={labels.openDocument} heading={labels.resourcesHeading} items={items.filter((item) => item.kind !== "receipt")} locale={locale} newTab={labels.newTab} receiptTitle={labels.receiptTitle} />
    </div>
  );
}
