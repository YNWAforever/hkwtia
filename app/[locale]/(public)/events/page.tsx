import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventCalendarView} from "@/components/marketing/event-calendar-view";
import {EventCard} from "@/components/marketing/event-card";
import {EventFilterPanel} from "@/components/marketing/event-filter-panel";
import {EventViewSwitch} from "@/components/marketing/event-view-switch";
import {InterestForm} from "@/components/marketing/interest-form";
import {WhatsAppLink} from "@/components/marketing/whatsapp-link";
import {Arrow} from "@/components/wt/arrow";
import {ClosingBand} from "@/components/wt/closing-band";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {InterestBand} from "@/components/wt/interest-band";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository} from "@/lib/db/repos/events";
import {parseEventFilters} from "@/lib/events/filters";
import {parsePublicEventStatus} from "@/lib/events/public";
import {submitInterestAction} from "@/lib/growth/interest-action";
import {buildPageMetadata} from "@/lib/metadata";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;
const anonymous = {kind: "anonymous", userId: null} as const;
// Group A / Decision (design spec §2): 3 static links, not the donor's unported `/activities/*`.
const RECOMMENDATIONS = [
  {key: "launchpad", href: "/launchpad"},
  {key: "showcase", href: "/showcase"},
  {key: "membership", href: "/membership"},
] as const;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Events"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/events", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function EventsPage({params, searchParams}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const [t, common, tInterest, tWhatsApp] = await Promise.all([
    getTranslations({locale, namespace: "Events"}),
    getTranslations({locale, namespace: "Common"}),
    getTranslations({locale, namespace: "Interest"}),
    getTranslations({locale, namespace: "WhatsApp"}),
  ]);
  const appLocale = locale as AppLocale;
  const interestLabels = {
    email: tInterest("email"), displayName: tInterest("displayName"), whatsappNumber: tInterest("whatsappNumber"),
    whatsappOptIn: tInterest("whatsappOptIn"), consent: tInterest("consent"), website: tInterest("website"),
    submit: tInterest("submit"), submitting: tInterest("submitting"), success: tInterest("success"),
    invalid: tInterest("invalid"), rateLimited: tInterest("rateLimited"),
  };
  const status = parsePublicEventStatus(query.status);
  // Programme B-6: the URL is the whole filter state; each axis validates on its own.
  const filters = parseEventFilters(query);
  const carriedFilters = Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== null);
  const view = query.view === "calendar" ? "calendar" : "cards";
  // Landing state from /api/events/guest/cancel (B-4). Anything else in ?guest is ignored,
  // so the redirect target can never make this page echo a value it did not write.
  const guestNotice = query.guest === "cancelled" ? t("guest.cancelled")
    : query.guest === "unknown" || query.guest === "invalid" ? t("guest.cancelInvalid") : null;
  const asOf = new Date();
  const records = await eventsRepository.listPublic(anonymous, {status, asOf, locale, filters}).catch(() => null);
  const filterLabels = {
    legend: t("filters.legend"), format: t("filters.format"),
    formats: {any: t("filters.formats.any"), in_person: t("filters.formats.in_person"), online: t("filters.formats.online"), hybrid: t("filters.formats.hybrid")},
    month: t("filters.month"), organiser: t("filters.organiser"), tag: t("filters.tag"), apply: t("filters.apply"), clear: t("filters.clear"),
  };
  const cardLabels = {
    status: {open: t("status.open"), past: t("status.past")},
    venueLabel: t("card.venueLabel"),
    capacityLabel: t("card.capacityLabel"),
    cta: t("card.cta"),
  };

  return (
    <>
      <PageHero
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("breadcrumbCurrent")}}
        breadcrumbLabel={common("breadcrumbLabel")}
        eyebrow={t("eyebrow")}
        image={{src: "/archive/tech-connect-community.webp", alt: t("heroImageAlt")}}
        lead={t("description")}
        title={t("title")}
        variant="inner"
      />
      <Section id="events-results" labelledBy="events-results-title">
        <h2 className="sr-only" id="events-results-title">{t("resultsHeading")}</h2>
        {guestNotice ? <p className="interest-form-status" role="status">{guestNotice}</p> : null}
        {/* Real <button> elements (not styled anchors): app/styles/wisetech.css:815 targets
            `.event-quick-tabs button`, not `a`. Plain GET navigation, same idiom as
            components/marketing/showcase-filters.tsx -- no client state. */}
        <form action={localizedPath(appLocale, "/events")} aria-label={t("quickTabs.label")} className="event-quick-tabs" method="get">
          {/* Switching open/past keeps the B-6 filters; only the status button changes. */}
          {carriedFilters.map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
          <button aria-pressed={status === "open"} className={status === "open" ? "active" : undefined} name="status" type="submit" value="open">{t("quickTabs.open")}</button>
          <button aria-pressed={status === "past"} className={status === "past" ? "active" : undefined} name="status" type="submit" value="past">{t("quickTabs.past")}</button>
        </form>
        <nav aria-label={t("activityStrip.label")} className="activity-type-strip">
          <Link href="/events?status=open">{t("activityStrip.openLabel")}</Link>
          <Link href="/launchpad">{t("activityStrip.launchpadLabel")}</Link>
          <Link href="/showcase">{t("activityStrip.showcaseLabel")}</Link>
        </nav>
        <EventFilterPanel filters={filters} labels={filterLabels} locale={appLocale} status={status} />
        {records === null ? (
          <HonestEmpty copy={t("unavailableDescription")} label={t("statusLabel")} title={t("unavailableTitle")} variant="light" />
        ) : (
          <>
            <div className="event-results-head" role="status">
              <p><strong>{records.length}</strong>{t("resultsHead.label", {count: records.length})}</p>
              {records.length > 0 ? (
                <EventViewSwitch labels={{label: t("viewSwitch.label"), cards: t("viewSwitch.cards"), calendar: t("viewSwitch.calendar")}} />
              ) : null}
            </div>
            {records.length > 0 ? (
              view === "calendar" ? (
                <EventCalendarView events={records} locale={appLocale} />
              ) : (
                <div className="event-library">
                  {records.map((event) => (
                    <EventCard event={event} key={event.id} labels={cardLabels} locale={appLocale} status={status} />
                  ))}
                </div>
              )
            ) : (
              <HonestEmpty
                actions={[{label: t("empty.action"), href: "/contact"}]}
                copy={t(`empty.${status}.description`)}
                label={t("statusLabel")}
                title={t(`empty.${status}.title`)}
                variant="light"
              />
            )}
          </>
        )}
        <div className="inner-card-grid">
          {RECOMMENDATIONS.map((item, index) => (
            <Link className="inner-card" href={item.href} key={item.key}>
              <span className="inner-card-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{t(`recommendations.items.${item.key}.title`)}</h3>
              <p>{t(`recommendations.items.${item.key}.copy`)}</p>
              <b>{t(`recommendations.items.${item.key}.cta`)} <Arrow /></b>
            </Link>
          ))}
        </div>
      </Section>
      <InterestBand
        action={<InterestForm action={submitInterestAction} id="events-interest-form" labels={interestLabels} locale={appLocale} />}
        copy={t("interest.copy")}
        eyebrow={t("interest.eyebrow")}
        id="events-interest"
        title={t("interest.title")}
      />
      <ClosingBand
        actions={[{label: t("closing.actions.primary"), href: "/contact"}, {label: t("closing.actions.secondary"), href: "/membership"}]}
        copy={t("closing.copy")}
        extra={<WhatsAppLink className="text-link light-link" label={tWhatsApp("chat")} locale={appLocale} prefill={tWhatsApp("prefill.events")} source="events" />}
        eyebrow={t("closing.eyebrow")}
        id="events-closing"
        title={t("closing.title")}
      />
    </>
  );
}
