import {randomUUID} from "node:crypto";


import {redirect} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {SegmentBuilder, type SegmentEventOption, type SegmentPreset} from "@/components/admin/segment-builder";
import {SegmentResults} from "@/components/admin/segment-results";
import type {AppLocale} from "@/i18n/routing";
import {queueCampaignAction} from "@/lib/admin/campaign-actions";
import {campaignDraftHref, resolveCampaignDraft} from "@/lib/admin/campaigns";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {saveSegmentAction} from "@/lib/admin/segment-actions";
import {parseSegmentRouteQuery} from "@/lib/admin/segment-schema";
import {previewSegment} from "@/lib/admin/segments";
import {eventsRepository, localizeEvent} from "@/lib/db/repos/events";
import {segmentsRepository} from "@/lib/db/repos/segments";
import {localizedPath} from "@/lib/urls";

/** How many upcoming events the event control offers, and how many earn a one-click preset. */
const EVENT_OPTION_LIMIT = 20;
const PRESET_LIMIT = 5;

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

export default async function SegmentsPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const rawSearchParams = await searchParams;
  const draft = resolveCampaignDraft(rawSearchParams.campaignDraft, randomUUID);
  if (draft.created) {
    redirect(campaignDraftHref(localizedPath(locale, "/admin/segments"), rawSearchParams, draft.draftId));
  }
  const segmentSearchParams = {...rawSearchParams};
  delete segmentSearchParams.campaignDraft;
  const query = parseSegmentRouteQuery(segmentSearchParams);
  // The event control and its presets are a convenience, not the page: a
  // failing events read must not take the segment builder down with it, so it
  // degrades to "no event filter offered" the way the public pages degrade.
  const [preview, saved, allEvents] = await Promise.all([
    previewSegment(actor, query),
    segmentsRepository.list(actor),
    eventsRepository.listForAdmin(actor).catch(() => []),
  ]);
  const t = await getTranslations({locale, namespace: "Admin.segments"});
  // The contact stage and source vocabularies are labelled once, by
  // /admin/contacts; re-spelling them here would let the two screens drift.
  const tContacts = await getTranslations({locale, namespace: "Admin.contacts"});
  const now = new Date();
  const upcoming = allEvents
    .filter((event) => event.published && event.startsAt.getTime() >= now.getTime())
    .map((event) => localizeEvent(event, locale));
  const selectedEventId = query.filter.event?.eventId ?? null;
  // A saved segment can name an event that has already happened. Keeping it in
  // the option list is what stops the next "Preview" from silently dropping the
  // filter the segment was saved with.
  const selected = selectedEventId !== null && !upcoming.some((event) => event.id === selectedEventId)
    ? allEvents.filter((event) => event.id === selectedEventId).map((event) => localizeEvent(event, locale))
    : [];
  const eventOptions: readonly SegmentEventOption[] = [...selected, ...upcoming.slice(0, EVENT_OPTION_LIMIT)].map((event) => ({id: event.id, title: event.title}));
  const presets: readonly SegmentPreset[] = upcoming.slice(0, PRESET_LIMIT).map((event) => ({eventId: event.id, label: t("presetNotRegistered", {event: event.title})}));
  const segmentPath = localizedPath(locale, "/admin/segments");
  const saveAction = saveSegmentAction.bind(null, segmentPath, {success: t("saveSuccess"), validation: t("saveValidation"), error: t("saveError")});
  const queueAction = queueCampaignAction.bind(null, draft.draftId, localizedPath(locale, "/admin/segments"));
  const builderLabels = {preview: t("preview"), filters: t("filters"), tier: t("tier"), status: t("status"), scoreMin: t("scoreMin"), scoreMax: t("scoreMax"), renewalWithinDays: t("renewalWithinDays"), sector: t("sector"), lastLoginBeforeDays: t("lastLoginBeforeDays"), whatsappOptIn: t("whatsappOptIn"), whatsappAny: t("whatsappAny"), whatsappYes: t("whatsappYes"), whatsappNo: t("whatsappNo"), save: t("save"), saving: t("saving"), nameEn: t("nameEn"), nameZh: t("nameZh"), corporate: t("corporate"), startup: t("startup"), community: t("community"), patron: t("patron"), active: t("active"), pastDue: t("pastDue"), pendingReview: t("pendingReview"),
    industryTags: t("industryTags"), anyTag: t("anyTag"), companyPlan: t("companyPlan"), event: t("event"), eventState: t("eventState"),
    eventStates: {registered: t("eventStates.registered"), waitlist: t("eventStates.waitlist"), attended: t("eventStates.attended"), cancelled: t("eventStates.cancelled"), not_registered: t("eventStates.not_registered")},
    audience: t("audience"),
    audiences: {members: t("audiences.members"), contacts: t("audiences.contacts"), both: t("audiences.both")},
    contactStage: t("contactStage"), anyStage: tContacts("filters.anyStage"),
    contactStages: {new: tContacts("stage.new"), contacted: tContacts("stage.contacted"), qualified: tContacts("stage.qualified"), applied: tContacts("stage.applied"), member: tContacts("stage.member"), closed: tContacts("stage.closed")},
    contactSource: t("contactSource"), anySource: tContacts("filters.anySource"),
    contactSources: {whatsapp: tContacts("source.whatsapp"), event_guest: tContacts("source.event_guest"), showcase_intro: tContacts("source.showcase_intro"), join_abandoned: tContacts("source.join_abandoned"), interest_form: tContacts("source.interest_form"), import: tContacts("source.import")}};
  const resultsLabels = {caption: t("caption"), total: t("total"), empty: t("empty"), kind: t("kind"), kindMember: t("kindMember"), kindContact: t("kindContact"), name: t("name"), email: t("email"), company: t("company"), plan: t("plan"), status: t("status"), renewal: t("renewal"), score: t("score"), unavailable: t("unavailable"), saved: t("saved"), export: t("export"), queue: t("queue"), template: t("template"), templateRenewal: t("templateRenewal"), templateUpdate: t("templateUpdate"), queued: t("queued"), existing: t("existing"), recipients: t("recipients"), newDraft: t("newDraft"), error: t("error")};
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header><SegmentBuilder events={eventOptions} filter={query.filter} labels={builderLabels} locale={locale} presets={presets} saveAction={saveAction}/><SegmentResults labels={resultsLabels} preview={preview} queueAction={queueAction} newDraftHref={campaignDraftHref(localizedPath(locale, "/admin/segments"), rawSearchParams, randomUUID())} saved={saved}/></div>;
}
