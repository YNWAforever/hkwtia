import {SegmentSaveForm} from "@/components/admin/segment-save-form";
import {INDUSTRY_TAGS, industryTagLabel} from "@/config/industry-tags";
import type {AppLocale} from "@/i18n/routing";
import type {SegmentSaveActionState} from "@/lib/admin/segment-action-core";
import type {SegmentFilterSet} from "@/lib/admin/segment-schema";
import {localizedPath} from "@/lib/urls";

type Vocabulary = Readonly<Record<string, string>>;

export type SegmentBuilderLabels = Readonly<{
  preview: string;
  filters: string;
  tier: string;
  status: string;
  scoreMin: string;
  scoreMax: string;
  renewalWithinDays: string;
  sector: string;
  lastLoginBeforeDays: string;
  whatsappOptIn: string;
  whatsappAny: string;
  whatsappYes: string;
  whatsappNo: string;
  save: string;
  saving: string;
  nameEn: string;
  nameZh: string;
  corporate: string;
  startup: string;
  community: string;
  patron: string;
  active: string;
  pastDue: string;
  pendingReview: string;
  // C-6 (v2).
  industryTags: string;
  anyTag: string;
  companyPlan: string;
  event: string;
  eventState: string;
  eventStates: Vocabulary;
  audience: string;
  audiences: Vocabulary;
  contactStage: string;
  contactStages: Vocabulary;
  anyStage: string;
  contactSource: string;
  contactSources: Vocabulary;
  anySource: string;
}>;

/** One published, upcoming event: the `eventId` control's options and the preset's subject. */
export type SegmentEventOption = Readonly<{id: string; title: string}>;
/** A ready-made "not yet registered for X" link. `label` arrives formatted, because the builder has no translator. */
export type SegmentPreset = Readonly<{eventId: string; label: string}>;

type Props = Readonly<{
  locale: AppLocale;
  labels: SegmentBuilderLabels;
  filter: SegmentFilterSet;
  events: readonly SegmentEventOption[];
  presets: readonly SegmentPreset[];
  saveAction: (state: SegmentSaveActionState, formData: FormData) => Promise<SegmentSaveActionState>;
}>;

function value(value: number | null): string {
  return value === null ? "" : String(value);
}

const selectClass = "min-h-11 w-full rounded-md border border-input bg-background px-3";

export function SegmentBuilder({locale, labels, filter, events, presets, saveAction}: Props) {
  const memberships = [["community", labels.community], ["startup", labels.startup], ["corporate", labels.corporate], ["patron", labels.patron]] as const;
  const statuses = [["active", labels.active], ["past_due", labels.pastDue], ["pending_review", labels.pendingReview]] as const;
  // `localizedPath` is the only place that knows `zh-HK` is served at `/zh`;
  // a hand-built `/${locale}/admin/segments` 404s on the Chinese admin.
  const segmentPath = localizedPath(locale, "/admin/segments");
  return <div className="space-y-6 rounded-md border border-border p-4 sm:p-6">
    <form action={segmentPath} className="grid gap-4 sm:grid-cols-2" method="get">
      <fieldset className="space-y-2"><legend className="font-medium">{labels.filters}</legend><label className="block text-sm" htmlFor="segment-tier">{labels.tier}</label><select className={selectClass} defaultValue={filter.tier} id="segment-tier" multiple name="tier">{memberships.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></fieldset>
      <fieldset className="space-y-2"><legend className="sr-only">{labels.status}</legend><label className="block text-sm" htmlFor="segment-status">{labels.status}</label><select className={selectClass} defaultValue={filter.status} id="segment-status" multiple name="status">{statuses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></fieldset>
      <label className="space-y-2 text-sm" htmlFor="segment-score-min"><span>{labels.scoreMin}</span><input className={selectClass} defaultValue={value(filter.scoreMin)} id="segment-score-min" max="100" min="0" name="scoreMin" type="number" /></label>
      <label className="space-y-2 text-sm" htmlFor="segment-score-max"><span>{labels.scoreMax}</span><input className={selectClass} defaultValue={value(filter.scoreMax)} id="segment-score-max" max="100" min="0" name="scoreMax" type="number" /></label>
      <label className="space-y-2 text-sm" htmlFor="segment-renewal"><span>{labels.renewalWithinDays}</span><input className={selectClass} defaultValue={value(filter.renewalWithinDays)} id="segment-renewal" max="730" min="0" name="renewalWithinDays" type="number" /></label>
      <label className="space-y-2 text-sm" htmlFor="segment-sector"><span>{labels.sector}</span><input className={selectClass} defaultValue={filter.sector} id="segment-sector" name="sector" type="text" /></label>
      <label className="space-y-2 text-sm" htmlFor="segment-last-login"><span>{labels.lastLoginBeforeDays}</span><input className={selectClass} defaultValue={value(filter.lastLoginBeforeDays)} id="segment-last-login" max="3650" min="0" name="lastLoginBeforeDays" type="number" /></label>
      <label className="space-y-2 text-sm" htmlFor="segment-whatsapp-opt-in"><span>{labels.whatsappOptIn}</span><select className={selectClass} defaultValue={filter.whatsappOptIn === null ? "" : String(filter.whatsappOptIn)} id="segment-whatsapp-opt-in" name="whatsappOptIn"><option value="">{labels.whatsappAny}</option><option value="true">{labels.whatsappYes}</option><option value="false">{labels.whatsappNo}</option></select></label>
      {/* Audience decides which arms of the union run at all, so it sits with
          the contact controls it governs rather than among the member ones. */}
      <label className="space-y-2 text-sm" htmlFor="segment-audience"><span>{labels.audience}</span><select className={selectClass} defaultValue={filter.audience} id="segment-audience" name="audience">{Object.entries(labels.audiences).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {/* `industryTags` is the closed vocabulary on `companies.tags`; `sector`
          above is a substring match on free-text `companies.industry`. Two
          controls, two columns, deliberately labelled apart. */}
      <label className="space-y-2 text-sm" htmlFor="segment-industry-tags"><span>{labels.industryTags}</span><select className={selectClass} defaultValue={filter.industryTags} id="segment-industry-tags" multiple name="industryTag"><option value="">{labels.anyTag}</option>{INDUSTRY_TAGS.map((tag) => <option key={tag.slug} value={tag.slug}>{industryTagLabel(tag.slug, locale)}</option>)}</select></label>
      <label className="space-y-2 text-sm" htmlFor="segment-company-plan"><span>{labels.companyPlan}</span><select className={selectClass} defaultValue={filter.companyPlan} id="segment-company-plan" multiple name="companyPlan">{memberships.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {/* The composite `event` filter travels as two flat params: the query
          schema handles strings and arrays of strings, never a nested object. */}
      <label className="space-y-2 text-sm" htmlFor="segment-event"><span>{labels.event}</span><select className={selectClass} defaultValue={filter.event?.eventId ?? ""} id="segment-event" name="eventId"><option value="">{labels.whatsappAny}</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
      <label className="space-y-2 text-sm" htmlFor="segment-event-state"><span>{labels.eventState}</span><select className={selectClass} defaultValue={filter.event?.state ?? "registered"} id="segment-event-state" name="eventState">{Object.entries(labels.eventStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="space-y-2 text-sm" htmlFor="segment-contact-stage"><span>{labels.contactStage}</span><select className={selectClass} defaultValue={filter.contactStage} id="segment-contact-stage" multiple name="contactStage"><option value="">{labels.anyStage}</option>{Object.entries(labels.contactStages).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="space-y-2 text-sm" htmlFor="segment-contact-source"><span>{labels.contactSource}</span><select className={selectClass} defaultValue={filter.contactSource} id="segment-contact-source" multiple name="contactSource"><option value="">{labels.anySource}</option>{Object.entries(labels.contactSources).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <div className="flex items-end"><button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">{labels.preview}</button></div>
    </form>
    {presets.length === 0 ? null : <ul className="flex flex-wrap gap-2">{presets.map((preset) => <li key={preset.eventId}><a className="inline-block min-h-11 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted" href={`${segmentPath}?eventId=${encodeURIComponent(preset.eventId)}&eventState=not_registered&audience=members`}>{preset.label}</a></li>)}</ul>}
    <SegmentSaveForm action={saveAction} filter={filter} labels={{save: labels.save, saving: labels.saving, nameEn: labels.nameEn, nameZh: labels.nameZh}}/>
  </div>;
}
