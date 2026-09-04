import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventCard} from "@/components/marketing/event-card";
import {ActionLink} from "@/components/wt/action-link";
import {Arrow} from "@/components/wt/arrow";
import {ClosingBand} from "@/components/wt/closing-band";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {InterestBand} from "@/components/wt/interest-band";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository} from "@/lib/db/repos/events";
import {parsePublicEventStatus} from "@/lib/events/public";
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
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: "Events"}),
    getTranslations({locale, namespace: "Common"}),
  ]);
  const appLocale = locale as AppLocale;
  const status = parsePublicEventStatus(query.status);
  const asOf = new Date();
  const records = await eventsRepository.listPublic(anonymous, {status, asOf, locale}).catch(() => null);
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
        image={{src: "/images/projects-hero.jpg", alt: t("heroImageAlt")}}
        lead={t("description")}
        title={t("title")}
        variant="inner"
      />
      <Section id="events-results" labelledBy="events-results-title">
        <h2 className="sr-only" id="events-results-title">{t("resultsHeading")}</h2>
        {/* Real <button> elements (not styled anchors): app/styles/wisetech.css:815 targets
            `.event-quick-tabs button`, not `a`. Plain GET navigation, same idiom as
            components/marketing/showcase-filters.tsx -- no client state. */}
        <form action={localizedPath(appLocale, "/events")} aria-label={t("quickTabs.label")} className="event-quick-tabs" method="get">
          <button aria-pressed={status === "open"} className={status === "open" ? "active" : undefined} name="status" type="submit" value="open">{t("quickTabs.open")}</button>
          <button aria-pressed={status === "past"} className={status === "past" ? "active" : undefined} name="status" type="submit" value="past">{t("quickTabs.past")}</button>
        </form>
        <nav aria-label={t("activityStrip.label")} className="activity-type-strip">
          <Link href="/events?status=open">{t("activityStrip.openLabel")}</Link>
          <Link href="/launchpad">{t("activityStrip.launchpadLabel")}</Link>
          <Link href="/showcase">{t("activityStrip.showcaseLabel")}</Link>
        </nav>
        {records === null ? (
          <HonestEmpty copy={t("unavailableDescription")} label={t("statusLabel")} title={t("unavailableTitle")} variant="light" />
        ) : (
          <>
            <div className="event-results-head" role="status">
              <p><strong>{records.length}</strong>{t("resultsHead.label", {count: records.length})}</p>
            </div>
            {records.length > 0 ? (
              <div className="event-library">
                {records.map((event) => (
                  <EventCard event={event} key={event.id} labels={cardLabels} locale={appLocale} status={status} />
                ))}
              </div>
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
        action={<ActionLink href="/events?status=open" variant="button-light">{t("interest.action")}</ActionLink>}
        copy={t("interest.copy")}
        eyebrow={t("interest.eyebrow")}
        id="events-interest"
        title={t("interest.title")}
      />
      <ClosingBand
        actions={[{label: t("closing.actions.primary"), href: "/contact"}, {label: t("closing.actions.secondary"), href: "/membership"}]}
        copy={t("closing.copy")}
        eyebrow={t("closing.eyebrow")}
        id="events-closing"
        title={t("closing.title")}
      />
    </>
  );
}
