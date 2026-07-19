import type {AppLocale} from "@/i18n/routing";
import type {SegmentFilterSet} from "@/lib/admin/segment-schema";
import {localizedPath} from "@/lib/urls";

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
  save: string;
  nameEn: string;
  nameZh: string;
  corporate: string;
  startup: string;
  community: string;
  patron: string;
  active: string;
  pastDue: string;
  pendingReview: string;
}>;

type Props = Readonly<{
  locale: AppLocale;
  labels: SegmentBuilderLabels;
  filter: SegmentFilterSet;
  saveAction: (formData: FormData) => Promise<void>;
}>;

function value(value: number | null): string {
  return value === null ? "" : String(value);
}

export function SegmentBuilder({locale, labels, filter, saveAction}: Props) {
  const memberships = [["community", labels.community], ["startup", labels.startup], ["corporate", labels.corporate], ["patron", labels.patron]] as const;
  const statuses = [["active", labels.active], ["past_due", labels.pastDue], ["pending_review", labels.pendingReview]] as const;
  return <div className="space-y-6 rounded-md border border-border p-4 sm:p-6">
    <form action={localizedPath(locale, "/admin/segments")} className="grid gap-4 sm:grid-cols-2" method="get">
      <fieldset className="space-y-2"><legend className="font-medium">{labels.filters}</legend><label className="block text-sm" htmlFor="segment-tier">{labels.tier}</label><select className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={filter.tier} id="segment-tier" multiple name="tier">{memberships.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></fieldset>
      <fieldset className="space-y-2"><legend className="sr-only">{labels.status}</legend><label className="block text-sm" htmlFor="segment-status">{labels.status}</label><select className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={filter.status} id="segment-status" multiple name="status">{statuses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></fieldset>
      <label className="space-y-2 text-sm" htmlFor="segment-score-min"><span>{labels.scoreMin}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={value(filter.scoreMin)} id="segment-score-min" max="100" min="0" name="scoreMin" type="number" /></label>
      <label className="space-y-2 text-sm" htmlFor="segment-score-max"><span>{labels.scoreMax}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={value(filter.scoreMax)} id="segment-score-max" max="100" min="0" name="scoreMax" type="number" /></label>
      <label className="space-y-2 text-sm" htmlFor="segment-renewal"><span>{labels.renewalWithinDays}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={value(filter.renewalWithinDays)} id="segment-renewal" max="730" min="0" name="renewalWithinDays" type="number" /></label>
      <label className="space-y-2 text-sm" htmlFor="segment-sector"><span>{labels.sector}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={filter.sector} id="segment-sector" name="sector" type="text" /></label>
      <label className="space-y-2 text-sm" htmlFor="segment-last-login"><span>{labels.lastLoginBeforeDays}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={value(filter.lastLoginBeforeDays)} id="segment-last-login" max="3650" min="0" name="lastLoginBeforeDays" type="number" /></label>
      <div className="flex items-end"><button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">{labels.preview}</button></div>
    </form>
    <form action={saveAction} className="grid gap-4 border-t border-border pt-6 sm:grid-cols-2"><input name="filters" type="hidden" value={JSON.stringify(filter)} /><label className="space-y-2 text-sm" htmlFor="segment-name-en"><span>{labels.nameEn}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="segment-name-en" name="nameEn" required type="text" /></label><label className="space-y-2 text-sm" htmlFor="segment-name-zh"><span>{labels.nameZh}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="segment-name-zh" name="nameZh" type="text" /></label><div className="sm:col-span-2"><button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted" type="submit">{labels.save}</button></div></form>
  </div>;
}
